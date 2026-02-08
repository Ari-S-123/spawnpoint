"""
Pure Python Instagram account registration.

Replicates the browser signup flow using requests.
The user manually provides the email confirmation code when prompted.

Usage: python register.py
"""

import base64
import json
import re
import struct
import time
import uuid

import requests
from Crypto.Cipher import AES
from Crypto.Random import get_random_bytes
from nacl.public import PublicKey, SealedBox

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

IG_APP_ID = "936619743392459"

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)

SIGNUP_URL = "https://www.instagram.com/accounts/emailsignup/"
GRAPHQL_URL = "https://www.instagram.com/api/graphql"

# GraphQL doc_ids
DOC_ID_FIELD_VALIDATION = "25391252800555418"
DOC_ID_FORM_SUBMIT = "25782408224726258"
DOC_ID_CONFIRMATION = "24050931851170558"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _compute_jazoest(phone_id: str) -> str:
    """Compute jazoest checksum from a token string (usually mid cookie)."""
    total = sum(ord(c) for c in phone_id)
    return f"2{total}"


def _extract_from_html(html: str, pattern: str) -> str | None:
    """Extract a value from HTML using a regex pattern."""
    m = re.search(pattern, html)
    return m.group(1) if m else None


def _extract_encryption_config(html: str) -> tuple[str | None, int | None]:
    """
    Extract the password encryption public key and key_id from the page HTML.

    Instagram embeds these in the page JS as part of the shared data or
    in script tags. The public key is a 32-byte X25519 key (hex-encoded)
    and key_id is a small integer.
    """
    # Try multiple patterns Instagram has used
    pub_key = None
    key_id = None

    # Pattern: "publicKey":"<hex>"
    m = re.search(r'"publicKey"\s*:\s*"([0-9a-f]+)"', html)
    if m:
        pub_key = m.group(1)

    # Pattern: "keyId":"<int>" or "keyId":<int>
    m = re.search(r'"keyId"\s*:\s*"?(\d+)"?', html)
    if m:
        key_id = int(m.group(1))

    # Alternative pattern in ScheduledServerJS
    if not pub_key:
        m = re.search(
            r'PasswordEncryption.*?"publicKey"\s*:\s*"([0-9a-f]+)"', html, re.DOTALL
        )
        if m:
            pub_key = m.group(1)

    if not key_id:
        m = re.search(
            r'PasswordEncryption.*?"keyId"\s*:\s*"?(\d+)"?', html, re.DOTALL
        )
        if m:
            key_id = int(m.group(1))

    return pub_key, key_id


def encrypt_password(password: str, pub_key_hex: str, key_id: int) -> str:
    """
    Encrypt a password using Instagram's #PWD_BROWSER:10 scheme.

    The server's public key is a 32-byte X25519 key. The scheme:
    1. Generate a random 32-byte AES-256 session key
    2. Seal (NaCl crypto_box_seal) the AES key with the server's public key
    3. AES-256-GCM encrypt the password (timestamp as AAD, zero nonce —
       safe because each AES key is single-use)
    4. Assemble binary payload and base64-encode

    Binary format:
        version(1) | key_id(1) | sealed_key_len(2 LE) | sealed_key | gcm_tag(16) | ciphertext

    Returns: "#PWD_BROWSER:10:{timestamp}:{base64_payload}"
    """
    ts = str(int(time.time()))

    # Parse the 32-byte X25519 public key
    pub_key_bytes = bytes.fromhex(pub_key_hex)
    nacl_pub = PublicKey(pub_key_bytes)
    sealed_box = SealedBox(nacl_pub)

    # Generate a random AES-256 session key and seal it
    aes_key = get_random_bytes(32)
    sealed_aes_key = sealed_box.encrypt(aes_key)  # 80 bytes (32 ephemeral pk + 16 MAC + 32 encrypted key)

    # AES-256-GCM encrypt the password with zero nonce and timestamp as AAD
    cipher_aes = AES.new(aes_key, AES.MODE_GCM, nonce=b"\x00" * 12)
    cipher_aes.update(ts.encode())
    ciphertext, tag = cipher_aes.encrypt_and_digest(password.encode())

    # Assemble: version(1) | key_id(1) | sealed_key_len(2 LE) | sealed_key | tag(16) | ciphertext
    payload = b""
    payload += b"\x01"  # version byte
    payload += struct.pack("<B", key_id)  # key_id byte
    payload += struct.pack("<H", len(sealed_aes_key))  # 2 bytes, little-endian
    payload += sealed_aes_key
    payload += tag  # 16 bytes (GCM auth tag)
    payload += ciphertext

    b64 = base64.b64encode(payload).decode()
    return f"#PWD_BROWSER:10:{ts}:{b64}"


# ---------------------------------------------------------------------------
# Session setup
# ---------------------------------------------------------------------------

class InstagramRegistration:
    """Manages the full Instagram registration flow."""

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": USER_AGENT,
            "Accept": "*/*",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept-Encoding": "gzip, deflate",
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "same-origin",
            "Sec-CH-UA": '"Chromium";v="145", "Not:A-Brand";v="99"',
            "Sec-CH-UA-Mobile": "?0",
            "Sec-CH-UA-Platform": '"macOS"',
        })

        # Tokens extracted from the signup page
        self.csrf_token: str = ""
        self.lsd_token: str = ""
        self.machine_id: str = ""
        self.hsi: str = ""
        self.rev: str = ""
        self.spin_t: str = ""

        # Dynamic params scraped from page
        self.dyn: str = ""
        self.csr: str = ""

        # Password encryption
        self.pub_key_hex: str | None = None
        self.key_id: int | None = None

    # ------------------------------------------------------------------
    # Step 1: Load signup page & extract tokens
    # ------------------------------------------------------------------

    def load_signup_page(self):
        """GET the signup page to collect cookies, CSRF token, lsd, etc."""
        print("[1] Loading signup page...")

        resp = self.session.get(SIGNUP_URL, headers={
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "none",
            "Sec-Fetch-User": "?1",
            "Upgrade-Insecure-Requests": "1",
        })
        resp.raise_for_status()
        html = resp.text

        # Extract CSRF token from cookies
        self.csrf_token = self.session.cookies.get("csrftoken", "")
        if not self.csrf_token:
            # Fallback: try Set-Cookie header
            for cookie in resp.cookies:
                if cookie.name == "csrftoken":
                    self.csrf_token = cookie.value
                    break

        # Extract machine_id (mid) from cookies
        self.machine_id = self.session.cookies.get("mid", "")

        # Extract LSD token from page HTML
        # Pattern from captured data: ["LSD",[],{"token":"AdRiKLjmKIjt_..."}
        lsd = _extract_from_html(html, r'\["LSD",\[\],\{"token":"([^"]+)"\}')
        if not lsd:
            # Also appears as: "lsd":"<token>"
            lsd = _extract_from_html(html, r'"lsd":"([^"]+)"')
        if not lsd:
            lsd = _extract_from_html(html, r'name="lsd"\s+value="([^"]+)"')
        self.lsd_token = lsd or ""

        # Extract __hsi
        hsi = _extract_from_html(html, r'"hsi"\s*:\s*"(\d+)"')
        if not hsi:
            hsi = _extract_from_html(html, r'__hsi=(\d+)')
        self.hsi = hsi or ""

        # Extract __rev (client revision)
        rev = _extract_from_html(html, r'"client_revision"\s*:\s*(\d+)')
        if not rev:
            rev = _extract_from_html(html, r'__rev=(\d+)')
        if not rev:
            rev = _extract_from_html(html, r'"rev"\s*:\s*(\d+)')
        self.rev = rev or ""

        # Extract __spin_t
        spin_t = _extract_from_html(html, r'"__spin_t"\s*:\s*(\d+)')
        if not spin_t:
            spin_t = _extract_from_html(html, r'__spin_t=(\d+)')
        self.spin_t = spin_t or str(int(time.time()))

        # Extract __dyn and __csr from embedded JS/links
        dyn = _extract_from_html(html, r'__dyn=([^&"]+)')
        self.dyn = dyn or ""

        csr = _extract_from_html(html, r'__csr=([^&"]+)')
        self.csr = csr or ""

        # Extract password encryption config from HTML
        self.pub_key_hex, self.key_id = _extract_encryption_config(html)

        # Fetch shared_data for encryption keys and any missing tokens
        self._fetch_shared_data()

        print(f"    CSRF:       {self.csrf_token[:20]}..." if self.csrf_token else "    CSRF:       (not found)")
        print(f"    LSD:        {self.lsd_token[:20]}..." if self.lsd_token else "    LSD:        (not found)")
        print(f"    machine_id: {self.machine_id}" if self.machine_id else "    machine_id: (not found)")
        print(f"    Encryption: key_id={self.key_id}" if self.key_id else "    Encryption: (not found in HTML)")
        print()

    def _fetch_shared_data(self):
        """Fetch shared_data endpoint for encryption keys, machine_id, lsd, etc."""
        try:
            resp = self.session.get(
                "https://www.instagram.com/data/shared_data/",
                headers={"X-Requested-With": "XMLHttpRequest"},
            )
            if not resp.ok:
                return
            data = resp.json()

            # Encryption keys
            enc = data.get("encryption", {})
            if not self.pub_key_hex:
                self.pub_key_hex = enc.get("public_key")
                key_id = enc.get("key_id")
                self.key_id = int(key_id) if key_id is not None else None
                if self.pub_key_hex:
                    print("    (encryption keys from shared_data)")

            # machine_id: use mid cookie first, then device_id from shared_data
            if not self.machine_id:
                self.machine_id = self.session.cookies.get("mid", "")
            if not self.machine_id:
                self.machine_id = data.get("device_id", "")

            # LSD token
            if not self.lsd_token:
                config = data.get("config", {})
                # Sometimes available in config
                lsd = config.get("lsd")
                if lsd:
                    self.lsd_token = lsd

        except Exception:
            pass

    # ------------------------------------------------------------------
    # Common request builder
    # ------------------------------------------------------------------

    def _graphql_headers(self) -> dict:
        """Build headers for GraphQL POST requests."""
        return {
            "Content-Type": "application/x-www-form-urlencoded",
            "X-CSRFToken": self.csrf_token,
            "X-IG-App-ID": IG_APP_ID,
            "X-FB-LSD": self.lsd_token,
            "X-ASBD-ID": "359341",
            "X-IG-D": "www",
            "X-FB-Friendly-Name": "",  # overridden per call
            "Referer": SIGNUP_URL,
            "Origin": "https://www.instagram.com",
        }

    def _common_form_data(self) -> dict:
        """Build common form fields for GraphQL POST requests."""
        jazoest = _compute_jazoest(self.machine_id or self.csrf_token)
        return {
            "av": "0",
            "__d": "www",
            "__user": "0",
            "__a": "1",
            "__req": "a",
            "__hs": "20491.HYP:instagram_web_pkg.2.1...0",
            "dpr": "2",
            "__ccg": "GOOD",
            "__rev": self.rev,
            "__s": "",
            "__hsi": self.hsi,
            "__dyn": self.dyn,
            "__csr": self.csr,
            "__comet_req": "7",
            "lsd": self.lsd_token,
            "jazoest": jazoest,
            "__spin_r": self.rev,
            "__spin_b": "trunk",
            "__spin_t": self.spin_t,
            "fb_api_caller_class": "RelayModern",
            "server_timestamps": "true",
        }

    def _post_graphql(self, friendly_name: str, doc_id: str, variables: dict) -> dict:
        """Execute a GraphQL POST and return parsed JSON response."""
        headers = self._graphql_headers()
        headers["X-FB-Friendly-Name"] = friendly_name

        data = self._common_form_data()
        data["fb_api_req_friendly_name"] = friendly_name
        data["doc_id"] = doc_id
        data["variables"] = json.dumps(variables)

        resp = self.session.post(GRAPHQL_URL, headers=headers, data=data)
        resp.raise_for_status()

        text = resp.text
        # Instagram sometimes prefixes responses with "for (;;);"
        if text.startswith("for (;;);"):
            text = text[len("for (;;);"):]

        # Debug: handle empty or non-JSON responses
        if not text.strip():
            print(f"\n[ERROR] Empty response from server for {friendly_name}")
            print(f"  Status code: {resp.status_code}")
            print(f"  Response headers:")
            for k, v in resp.headers.items():
                print(f"    {k}: {v}")
            raise ValueError("Server returned empty response - possibly rate limited or blocked")

        try:
            return json.loads(text)
        except json.JSONDecodeError:
            print(f"\n[ERROR] Non-JSON response for {friendly_name}:")
            print(f"  Status code: {resp.status_code}")
            print(f"  Response (first 1000 chars):")
            print(f"  {text[:1000]}")
            if "checkpoint" in text.lower():
                print("\n  [!] Detected checkpoint/challenge - Instagram requires verification")
            if "rate" in text.lower() or "limit" in text.lower():
                print("\n  [!] Possible rate limiting detected")
            raise

    # ------------------------------------------------------------------
    # Step 2: Encrypt password
    # ------------------------------------------------------------------

    def encrypt_password(self, password: str) -> str:
        """Encrypt the password using Instagram's #PWD_BROWSER:10 scheme."""
        if self.pub_key_hex and self.key_id is not None:
            print("[2] Encrypting password with NaCl+AES-GCM...")
            return encrypt_password(password, self.pub_key_hex, self.key_id)
        else:
            # If we couldn't get encryption keys, send plaintext with version 0
            # (Instagram may still accept this in some cases)
            print("[2] Encryption keys not available, using plaintext fallback...")
            ts = str(int(time.time()))
            return f"#PWD_BROWSER:0:{ts}:{password}"

    # ------------------------------------------------------------------
    # Step 3: Field validation
    # ------------------------------------------------------------------

    def validate_field(self, field_name: str, email: str, password: str = "",
                       fullname: str = "", username: str = "") -> dict:
        """
        Validate a single registration field.
        field_name: CONTACTPOINT | PASSWORD | FULLNAME
        """
        variables: dict = {
            "input": {
                "contactpoint": {"sensitive_string_value": email},
                "contactpoint_type": "EMAIL",
                "field_name": field_name,
                "firstname": {"sensitive_string_value": ""},
                "fullname": {"sensitive_string_value": fullname},
                "lastname": {"sensitive_string_value": ""},
                "machine_id": self.machine_id,
            },
            "scale": 2,
        }

        if field_name == "PASSWORD":
            variables["input"]["reg_passwd__"] = {
                "sensitive_string_value": password,
            }
            variables["input"]["username"] = {
                "sensitive_string_value": username,
            }

        result = self._post_graphql(
            "useCAARegistrationFieldValidationQuery",
            DOC_ID_FIELD_VALIDATION,
            variables,
        )
        return result

    def validate_fields(self, email: str, password: str, fullname: str,
                         username: str) -> bool:
        """Validate email, password, and fullname. Returns True if all pass."""
        print("[3] Validating registration fields...")

        all_ok = True

        # Validate email
        print("    Validating email...", end=" ")
        result = self.validate_field("CONTACTPOINT", email)
        validation = result.get("data", {}).get("xfb_caa_registration_field_validation")
        if validation is None:
            print(f"UNEXPECTED RESPONSE")
            print(f"    Full response: {json.dumps(result, indent=2)[:500]}")
            all_ok = False
        else:
            status = validation.get("status", "")
            error = validation.get("error") or {}
            if status == "SUCCESS" and not error.get("message"):
                print("OK")
                suggestions = validation.get("username_suggestions", [])
                if suggestions:
                    print(f"    Username suggestions: {', '.join(suggestions[:5])}")
            else:
                msg = error.get("message", "Unknown error")
                print(f"FAILED: {msg}")
                all_ok = False

        # Validate password
        print("    Validating password...", end=" ")
        result = self.validate_field("PASSWORD", email, password=password, username=username)
        validation = result.get("data", {}).get("xfb_caa_registration_field_validation")
        if validation is None:
            print(f"UNEXPECTED RESPONSE")
            print(f"    Full response: {json.dumps(result, indent=2)[:500]}")
            all_ok = False
        else:
            status = validation.get("status", "")
            error = validation.get("error") or {}
            if status == "SUCCESS" and not error.get("message"):
                print("OK")
            else:
                msg = error.get("message", "Unknown error")
                print(f"FAILED: {msg}")
                all_ok = False

        # Validate fullname
        print("    Validating full name...", end=" ")
        result = self.validate_field("FULLNAME", email, fullname=fullname)
        validation = result.get("data", {}).get("xfb_caa_registration_field_validation")
        if validation is None:
            print(f"UNEXPECTED RESPONSE")
            print(f"    Full response: {json.dumps(result, indent=2)[:500]}")
            all_ok = False
        else:
            status = validation.get("status", "")
            error = validation.get("error") or {}
            if status == "SUCCESS" and not error.get("message"):
                print("OK")
            else:
                msg = error.get("message", "Unknown error")
                print(f"FAILED: {msg}")
                all_ok = False

        print()
        return all_ok

    # ------------------------------------------------------------------
    # Step 4: Submit registration form
    # ------------------------------------------------------------------

    def submit_registration(
        self,
        email: str,
        fullname: str,
        username: str,
        enc_password: str,
        birthday_month: int,
        birthday_day: int,
        birthday_year: int,
    ) -> tuple[str | None, dict]:
        """
        Submit the registration form.
        Returns (context_token, full_response).
        context_token is needed for the confirmation step.
        """
        print("[4] Submitting registration form...")

        client_mutation_id = str(uuid.uuid4())
        waterfall_id = str(uuid.uuid4())

        variables = {
            "input": {
                "client_mutation_id": client_mutation_id,
                "actor_id": "0",
                "machine_id": self.machine_id,
                "reg_data": {
                    "birthday_day": birthday_day,
                    "birthday_month": birthday_month,
                    "birthday_year": birthday_year,
                    "contactpoint": {"sensitive_string_value": email},
                    "contactpoint_type": "EMAIL",
                    "custom_gender": "",
                    "did_use_age": False,
                    "firstname": {"sensitive_string_value": ""},
                    "fullname": {"sensitive_string_value": fullname},
                    "ig_age_block_data": None,
                    "lastname": {"sensitive_string_value": ""},
                    "preferred_pronoun": None,
                    "reg_passwd__": {"sensitive_string_value": enc_password},
                    "sex": None,
                    "use_custom_gender": False,
                    "username": {"sensitive_string_value": username},
                },
                "waterfall_id": waterfall_id,
            }
        }

        result = self._post_graphql(
            "useCAARegistrationFormSubmitMutation",
            DOC_ID_FORM_SUBMIT,
            variables,
        )

        reg_result = result.get("data", {}).get("caa_registration_homepage_submit", {})
        status = reg_result.get("status", "")
        errors = reg_result.get("errors", {}).get("creation_errors", [])

        if errors:
            print(f"    Registration errors: {errors}")
            return None, result

        context_data = reg_result.get("context", {})
        context_token = context_data.get("ntf_context") if context_data else None

        if status == "SUCCESS" and context_token:
            print(f"    Status: {status}")
            print(f"    Context token: {context_token[:40]}...")
        else:
            print(f"    Status: {status}")
            print(f"    Response: {json.dumps(reg_result, indent=2)}")

        print()
        return context_token, result

    # ------------------------------------------------------------------
    # Step 5 & 6: Confirmation code
    # ------------------------------------------------------------------

    def submit_confirmation_code(self, code: str, context_token: str) -> dict:
        """Submit the email confirmation code."""
        print("[6] Submitting confirmation code...")

        client_mutation_id = str(uuid.uuid4())

        variables = {
            "input": {
                "client_mutation_id": client_mutation_id,
                "actor_id": "0",
                "conf_code": {"sensitive_string_value": code},
                "ig_reg_data": context_token,
                "machine_id": self.machine_id,
                "youth_consent_decision_time": None,
            }
        }

        result = self._post_graphql(
            "useCAAFBConfirmationFormSubmitMutation",
            DOC_ID_CONFIRMATION,
            variables,
        )

        confirm = result.get("data", {}).get("xfb_caa_registration_confirmation_submit", {})
        created_user_id = confirm.get("created_user_id")

        if created_user_id:
            print(f"    Account created! User ID: {created_user_id}")
        else:
            print(f"    Response: {json.dumps(result, indent=2)}")

        return result


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print("=" * 60)
    print("  Instagram Account Registration (Pure Python)")
    print("=" * 60)
    print()

    # Step 0: Collect user input
    print("[0] Enter registration details:")
    email = input("    Email: ").strip()
    fullname = input("    Full name: ").strip()
    username = input("    Username: ").strip()
    password = input("    Password: ").strip()
    print()

    birthday_input = input("    Birthday (MM/DD/YYYY): ").strip()
    parts = birthday_input.split("/")
    birthday_month = int(parts[0])
    birthday_day = int(parts[1])
    birthday_year = int(parts[2])
    print()

    reg = InstagramRegistration()

    # Step 1: Load signup page
    reg.load_signup_page()

    # Step 2: Encrypt password
    enc_password = reg.encrypt_password(password)

    # Step 3: Validate fields
    valid = reg.validate_fields(email, password, fullname, username)
    if not valid:
        print("Field validation failed. You may continue anyway or fix the issues.")
        cont = input("Continue? [y/N]: ").strip().lower()
        if cont != "y":
            return

    # Step 4: Submit registration
    context_token, reg_result = reg.submit_registration(
        email=email,
        fullname=fullname,
        username=username,
        enc_password=enc_password,
        birthday_month=birthday_month,
        birthday_day=birthday_day,
        birthday_year=birthday_year,
    )

    if not context_token:
        print("Registration did not return a context token. Cannot proceed.")
        print(f"Full response: {json.dumps(reg_result, indent=2)}")
        return

    # Step 5: Prompt for confirmation code
    print("[5] Check your email for the confirmation code.")
    code = input("    Enter 6-digit code: ").strip()
    print()

    # Step 6: Submit confirmation code
    reg.submit_confirmation_code(code, context_token)

    print()
    print("Done.")


if __name__ == "__main__":
    main()
