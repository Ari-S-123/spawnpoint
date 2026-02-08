/**
 * Deterministic Instagram signup via direct HTTP/GraphQL calls.
 *
 * Ports the Python reverse-engineered flow (instagram_reverse.md) to TypeScript.
 * Bypasses the browser entirely — no Stagehand, no CAPTCHA.
 */

import { randomBytes, createCipheriv } from 'crypto';
import nacl from 'tweetnacl';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const IG_APP_ID = '936619743392459';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/120.0.0.0 Safari/537.36';

const SIGNUP_URL = 'https://www.instagram.com/accounts/emailsignup/';
const GRAPHQL_URL = 'https://www.instagram.com/api/graphql';

const DOC_ID_FIELD_VALIDATION = '25391252800555418';
const DOC_ID_FORM_SUBMIT = '25782408224726258';
const DOC_ID_CONFIRMATION = '24050931851170558';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SessionTokens {
  csrfToken: string;
  lsdToken: string;
  machineId: string;
  hsi: string;
  rev: string;
  spinT: string;
  dyn: string;
  csr: string;
  pubKeyHex: string | null;
  keyId: number | null;
  cookies: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeJazoest(phoneId: string): string {
  let total = 0;
  for (const c of phoneId) {
    total += c.charCodeAt(0);
  }
  return `2${total}`;
}

function extractFromHtml(html: string, pattern: RegExp): string | null {
  const m = html.match(pattern);
  return m?.[1] ?? null;
}

function extractEncryptionConfig(html: string): { pubKeyHex: string | null; keyId: number | null } {
  let pubKeyHex: string | null = null;
  let keyId: number | null = null;

  let m = html.match(/"publicKey"\s*:\s*"([0-9a-f]+)"/);
  if (m) pubKeyHex = m[1]!;

  m = html.match(/"keyId"\s*:\s*"?(\d+)"?/);
  if (m) keyId = parseInt(m[1]!, 10);

  // Alternative pattern in ScheduledServerJS
  if (!pubKeyHex) {
    m = html.match(/PasswordEncryption[\s\S]*?"publicKey"\s*:\s*"([0-9a-f]+)"/);
    if (m) pubKeyHex = m[1]!;
  }

  if (keyId === null) {
    m = html.match(/PasswordEncryption[\s\S]*?"keyId"\s*:\s*"?(\d+)"?/);
    if (m) keyId = parseInt(m[1]!, 10);
  }

  return { pubKeyHex, keyId };
}

function parseCookies(setCookieHeaders: string[]): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const header of setCookieHeaders) {
    const parts = header.split(';')[0]!;
    const eqIdx = parts.indexOf('=');
    if (eqIdx > 0) {
      const name = parts.slice(0, eqIdx).trim();
      const value = parts.slice(eqIdx + 1).trim();
      cookies[name] = value;
    }
  }
  return cookies;
}

function cookieString(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

// ---------------------------------------------------------------------------
// Password encryption — NaCl sealed box + AES-256-GCM
// ---------------------------------------------------------------------------

/**
 * Encrypt a password using Instagram's #PWD_BROWSER:10 scheme.
 *
 * 1. Generate a random 32-byte AES-256 session key
 * 2. Seal (NaCl crypto_box_seal) the AES key with the server's X25519 public key
 * 3. AES-256-GCM encrypt the password (timestamp as AAD, 12-byte zero nonce)
 * 4. Assemble binary payload: version(1) | key_id(1) | sealed_key_len(2 LE) | sealed_key | tag(16) | ciphertext
 */
function encryptPassword(password: string, pubKeyHex: string, keyId: number): string {
  const ts = Math.floor(Date.now() / 1000).toString();

  // Parse the 32-byte X25519 public key
  const pubKeyBytes = Buffer.from(pubKeyHex, 'hex');

  // Generate a random AES-256 session key
  const aesKey = randomBytes(32);

  // NaCl sealed box: ephemeral keypair + crypto_box
  // crypto_box_seal = ephemeral_pk(32) + crypto_box(msg, nonce=blake2b(ephemeral_pk||receiver_pk), ephemeral_sk, receiver_pk)
  const ephemeral = nacl.box.keyPair();
  // Nonce for sealed box is first 24 bytes of hash(ephemeralPk || recipientPk)
  const nonceInput = new Uint8Array(64);
  nonceInput.set(ephemeral.publicKey, 0);
  nonceInput.set(pubKeyBytes, 32);
  // Use the nacl hash (SHA-512) and take first 24 bytes as nonce
  const hashBytes = nacl.hash(nonceInput);
  const sealNonce = hashBytes.slice(0, 24);

  const encrypted = nacl.box(
    aesKey,
    sealNonce,
    new Uint8Array(pubKeyBytes),
    ephemeral.secretKey
  );
  // Sealed box = ephemeral public key + encrypted message
  const sealedAesKey = new Uint8Array(ephemeral.publicKey.length + encrypted.length);
  sealedAesKey.set(ephemeral.publicKey, 0);
  sealedAesKey.set(encrypted, ephemeral.publicKey.length);

  // AES-256-GCM encrypt the password
  const nonce = Buffer.alloc(12); // zero nonce — safe because key is single-use
  const cipher = createCipheriv('aes-256-gcm', aesKey, nonce);
  cipher.setAAD(Buffer.from(ts));
  const ciphertext = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag(); // 16 bytes

  // Assemble binary payload
  const sealedLen = sealedAesKey.length;
  const payload = Buffer.alloc(1 + 1 + 2 + sealedLen + 16 + ciphertext.length);
  let offset = 0;

  payload.writeUInt8(1, offset); // version
  offset += 1;
  payload.writeUInt8(keyId, offset); // key_id
  offset += 1;
  payload.writeUInt16LE(sealedLen, offset); // sealed_key_len (little-endian)
  offset += 2;
  Buffer.from(sealedAesKey).copy(payload, offset); // sealed_key
  offset += sealedLen;
  tag.copy(payload, offset); // GCM auth tag
  offset += 16;
  ciphertext.copy(payload, offset); // ciphertext

  return `#PWD_BROWSER:10:${ts}:${payload.toString('base64')}`;
}

// ---------------------------------------------------------------------------
// Session setup — load signup page + extract tokens
// ---------------------------------------------------------------------------

async function loadSignupPage(): Promise<SessionTokens> {
  console.log('[INSTAGRAM] Loading signup page...');

  const resp = await fetch(SIGNUP_URL, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1'
    },
    redirect: 'manual'
  });

  // Follow redirects manually to capture cookies
  const cookies = parseCookies(resp.headers.getSetCookie?.() ?? []);
  const html = await resp.text();

  const csrfToken = cookies['csrftoken'] ?? '';
  const machineId = cookies['mid'] ?? '';

  // Extract LSD token
  let lsdToken =
    extractFromHtml(html, /\["LSD",\[\],\{"token":"([^"]+)"\}/) ??
    extractFromHtml(html, /"lsd":"([^"]+)"/) ??
    extractFromHtml(html, /name="lsd"\s+value="([^"]+)"/) ??
    '';

  // Extract other tokens
  const hsi =
    extractFromHtml(html, /"hsi"\s*:\s*"(\d+)"/) ?? extractFromHtml(html, /__hsi=(\d+)/) ?? '';

  let rev =
    extractFromHtml(html, /"client_revision"\s*:\s*(\d+)/) ??
    extractFromHtml(html, /__rev=(\d+)/) ??
    extractFromHtml(html, /"rev"\s*:\s*(\d+)/) ??
    '';

  const spinT =
    extractFromHtml(html, /"__spin_t"\s*:\s*(\d+)/) ??
    extractFromHtml(html, /__spin_t=(\d+)/) ??
    Math.floor(Date.now() / 1000).toString();

  const dyn = extractFromHtml(html, /__dyn=([^&"]+)/) ?? '';
  const csr = extractFromHtml(html, /__csr=([^&"]+)/) ?? '';

  // Extract encryption config
  let { pubKeyHex, keyId } = extractEncryptionConfig(html);

  // Fetch shared_data for fallback encryption keys
  const sharedData = await fetchSharedData(cookies);
  if (sharedData) {
    if (!pubKeyHex && sharedData.pubKeyHex) {
      pubKeyHex = sharedData.pubKeyHex;
      keyId = sharedData.keyId;
      console.log('[INSTAGRAM] Got encryption keys from shared_data');
    }
    if (!lsdToken && sharedData.lsd) lsdToken = sharedData.lsd;
    // Merge any additional cookies from shared_data request
    Object.assign(cookies, sharedData.cookies);
  }

  console.log(
    `[INSTAGRAM] Tokens — CSRF: ${csrfToken ? csrfToken.slice(0, 20) + '...' : '(missing)'}, ` +
      `LSD: ${lsdToken ? lsdToken.slice(0, 20) + '...' : '(missing)'}, ` +
      `machineId: ${machineId || '(missing)'}, keyId: ${keyId ?? '(missing)'}`
  );

  return {
    csrfToken,
    lsdToken,
    machineId,
    hsi,
    rev,
    spinT,
    dyn,
    csr,
    pubKeyHex,
    keyId,
    cookies
  };
}

async function fetchSharedData(
  cookies: Record<string, string>
): Promise<{ pubKeyHex: string | null; keyId: number | null; lsd: string | null; cookies: Record<string, string> } | null> {
  try {
    const resp = await fetch('https://www.instagram.com/data/shared_data/', {
      headers: {
        'User-Agent': USER_AGENT,
        'X-Requested-With': 'XMLHttpRequest',
        Cookie: cookieString(cookies)
      }
    });
    if (!resp.ok) return null;

    const newCookies = parseCookies(resp.headers.getSetCookie?.() ?? []);
    const data = await resp.json();
    const enc = (data as Record<string, unknown>).encryption as Record<string, unknown> | undefined;
    const config = (data as Record<string, unknown>).config as Record<string, unknown> | undefined;

    return {
      pubKeyHex: (enc?.public_key as string) ?? null,
      keyId: enc?.key_id != null ? Number(enc.key_id) : null,
      lsd: (config?.lsd as string) ?? null,
      cookies: newCookies
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// GraphQL helpers
// ---------------------------------------------------------------------------

function graphqlHeaders(tokens: SessionTokens, friendlyName: string): Record<string, string> {
  return {
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': USER_AGENT,
    'X-CSRFToken': tokens.csrfToken,
    'X-IG-App-ID': IG_APP_ID,
    'X-FB-LSD': tokens.lsdToken,
    'X-ASBD-ID': '359341',
    'X-IG-D': 'www',
    'X-FB-Friendly-Name': friendlyName,
    Referer: SIGNUP_URL,
    Origin: 'https://www.instagram.com',
    Cookie: cookieString(tokens.cookies)
  };
}

function commonFormData(tokens: SessionTokens): Record<string, string> {
  const jazoest = computeJazoest(tokens.machineId || tokens.csrfToken);
  return {
    av: '0',
    __d: 'www',
    __user: '0',
    __a: '1',
    __req: 'a',
    __hs: '20491.HYP:instagram_web_pkg.2.1...0',
    dpr: '2',
    __ccg: 'GOOD',
    __rev: tokens.rev,
    __s: '',
    __hsi: tokens.hsi,
    __dyn: tokens.dyn,
    __csr: tokens.csr,
    __comet_req: '7',
    lsd: tokens.lsdToken,
    jazoest,
    __spin_r: tokens.rev,
    __spin_b: 'trunk',
    __spin_t: tokens.spinT,
    fb_api_caller_class: 'RelayModern',
    server_timestamps: 'true'
  };
}

async function postGraphql(
  tokens: SessionTokens,
  friendlyName: string,
  docId: string,
  variables: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const headers = graphqlHeaders(tokens, friendlyName);
  const form = commonFormData(tokens);
  form['fb_api_req_friendly_name'] = friendlyName;
  form['doc_id'] = docId;
  form['variables'] = JSON.stringify(variables);

  const body = new URLSearchParams(form).toString();
  const resp = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers,
    body
  });

  // Merge any new cookies (e.g. updated csrftoken)
  const newCookies = parseCookies(resp.headers.getSetCookie?.() ?? []);
  Object.assign(tokens.cookies, newCookies);
  if (newCookies['csrftoken']) tokens.csrfToken = newCookies['csrftoken'];

  let text = await resp.text();

  // Instagram sometimes prefixes responses with "for (;;);"
  if (text.startsWith('for (;;);')) {
    text = text.slice('for (;;);'.length);
  }

  if (!text.trim()) {
    throw new Error(
      `[INSTAGRAM] Empty response from server for ${friendlyName} (status ${resp.status}) — possibly rate limited`
    );
  }

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    const preview = text.slice(0, 500);
    if (text.toLowerCase().includes('checkpoint')) {
      throw new Error(`[INSTAGRAM] Checkpoint/challenge detected: ${preview}`);
    }
    throw new Error(`[INSTAGRAM] Non-JSON response for ${friendlyName}: ${preview}`);
  }
}

// ---------------------------------------------------------------------------
// Field validation
// ---------------------------------------------------------------------------

async function validateField(
  tokens: SessionTokens,
  fieldName: string,
  email: string,
  password: string = '',
  fullname: string = '',
  username: string = ''
): Promise<{ ok: boolean; message: string }> {
  const variables: Record<string, unknown> = {
    input: {
      contactpoint: { sensitive_string_value: email },
      contactpoint_type: 'EMAIL',
      field_name: fieldName,
      firstname: { sensitive_string_value: '' },
      fullname: { sensitive_string_value: fullname },
      lastname: { sensitive_string_value: '' },
      machine_id: tokens.machineId
    },
    scale: 2
  };

  if (fieldName === 'PASSWORD') {
    (variables.input as Record<string, unknown>).reg_passwd__ = {
      sensitive_string_value: password
    };
    (variables.input as Record<string, unknown>).username = {
      sensitive_string_value: username
    };
  }

  const result = await postGraphql(
    tokens,
    'useCAARegistrationFieldValidationQuery',
    DOC_ID_FIELD_VALIDATION,
    variables
  );

  const data = result.data as Record<string, unknown> | undefined;
  const validation = data?.xfb_caa_registration_field_validation as Record<string, unknown> | undefined;

  if (!validation) {
    return { ok: false, message: `Unexpected response for ${fieldName}` };
  }

  const error = validation.error as Record<string, unknown> | null;
  if (validation.status === 'SUCCESS' && !error?.message) {
    return { ok: true, message: 'OK' };
  }

  return { ok: false, message: (error?.message as string) ?? 'Unknown validation error' };
}

async function validateFields(
  tokens: SessionTokens,
  email: string,
  password: string,
  fullname: string,
  username: string
): Promise<void> {
  console.log('[INSTAGRAM] Validating registration fields...');

  const emailResult = await validateField(tokens, 'CONTACTPOINT', email);
  console.log(`[INSTAGRAM]   Email: ${emailResult.ok ? 'OK' : emailResult.message}`);

  const passwordResult = await validateField(tokens, 'PASSWORD', email, password, '', username);
  console.log(`[INSTAGRAM]   Password: ${passwordResult.ok ? 'OK' : passwordResult.message}`);

  const nameResult = await validateField(tokens, 'FULLNAME', email, '', fullname);
  console.log(`[INSTAGRAM]   Full name: ${nameResult.ok ? 'OK' : nameResult.message}`);

  // Log warnings but don't block — Instagram validation can be overly strict
  if (!emailResult.ok) {
    console.warn(`[INSTAGRAM] Email validation warning: ${emailResult.message}`);
  }
  if (!passwordResult.ok) {
    console.warn(`[INSTAGRAM] Password validation warning: ${passwordResult.message}`);
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export type ProgressCallback = (step: string, detail: string) => void;

export async function registerInstagramAccount(
  email: string,
  password: string,
  fullname: string,
  username: string,
  onProgress?: ProgressCallback
): Promise<{ contextToken: string; machineId: string }> {
  const progress = onProgress ?? (() => {});

  // Step 1: Load signup page and extract tokens
  progress('Loading signup page', 'GET instagram.com/accounts/emailsignup/ — extracting CSRF, LSD, encryption keys...');
  const tokens = await loadSignupPage();
  progress('Tokens extracted', `CSRF: ${tokens.csrfToken ? 'OK' : 'missing'}, LSD: ${tokens.lsdToken ? 'OK' : 'missing'}, encryption key: ${tokens.pubKeyHex ? 'OK' : 'missing'}`);

  // Step 2: Encrypt password
  let encPassword: string;
  if (tokens.pubKeyHex && tokens.keyId !== null) {
    progress('Encrypting password', 'NaCl sealed box + AES-256-GCM → #PWD_BROWSER:10');
    console.log('[INSTAGRAM] Encrypting password with NaCl+AES-GCM...');
    encPassword = encryptPassword(password, tokens.pubKeyHex, tokens.keyId);
  } else {
    progress('Encrypting password', 'Encryption keys not available, using plaintext fallback');
    console.log('[INSTAGRAM] Encryption keys not available, using plaintext fallback...');
    const ts = Math.floor(Date.now() / 1000).toString();
    encPassword = `#PWD_BROWSER:0:${ts}:${password}`;
  }

  // Step 3: Validate fields (non-blocking — warnings only)
  progress('Validating fields', 'POST /api/graphql — validating email, password, and username...');
  await validateFields(tokens, email, password, fullname, username);
  progress('Fields validated', 'All field checks complete');

  // Step 4: Submit registration form
  progress('Submitting registration', 'POST /api/graphql — useCAARegistrationFormSubmitMutation');
  console.log('[INSTAGRAM] Submitting registration form...');

  const clientMutationId = crypto.randomUUID();
  const waterfallId = crypto.randomUUID();

  // Generate a reasonable birthday (25 years old)
  const now = new Date();
  const birthYear = now.getFullYear() - 25;

  const variables = {
    input: {
      client_mutation_id: clientMutationId,
      actor_id: '0',
      machine_id: tokens.machineId,
      reg_data: {
        birthday_day: 15,
        birthday_month: 6,
        birthday_year: birthYear,
        contactpoint: { sensitive_string_value: email },
        contactpoint_type: 'EMAIL',
        custom_gender: '',
        did_use_age: false,
        firstname: { sensitive_string_value: '' },
        fullname: { sensitive_string_value: fullname },
        ig_age_block_data: null,
        lastname: { sensitive_string_value: '' },
        preferred_pronoun: null,
        reg_passwd__: { sensitive_string_value: encPassword },
        sex: null,
        use_custom_gender: false,
        username: { sensitive_string_value: username }
      },
      waterfall_id: waterfallId
    }
  };

  const result = await postGraphql(
    tokens,
    'useCAARegistrationFormSubmitMutation',
    DOC_ID_FORM_SUBMIT,
    variables
  );

  const data = result.data as Record<string, unknown> | undefined;
  const regResult = data?.caa_registration_homepage_submit as Record<string, unknown> | undefined;

  if (!regResult) {
    throw new Error(`[INSTAGRAM] Unexpected registration response: ${JSON.stringify(result).slice(0, 500)}`);
  }

  const errors = regResult.errors as Record<string, unknown> | undefined;
  const creationErrors = (errors?.creation_errors as string[]) ?? [];
  if (creationErrors.length > 0) {
    throw new Error(`[INSTAGRAM] Registration errors: ${creationErrors.join(', ')}`);
  }

  const context = regResult.context as Record<string, unknown> | undefined;
  const contextToken = context?.ntf_context as string | undefined;

  if (regResult.status !== 'SUCCESS' || !contextToken) {
    throw new Error(
      `[INSTAGRAM] Registration did not return context token. Status: ${regResult.status}, Response: ${JSON.stringify(regResult).slice(0, 500)}`
    );
  }

  console.log(`[INSTAGRAM] Registration submitted — context token: ${contextToken.slice(0, 40)}...`);
  progress('Registration accepted', `Instagram returned context token — confirmation code required`);

  return { contextToken, machineId: tokens.machineId };
}

// ---------------------------------------------------------------------------
// Confirmation
// ---------------------------------------------------------------------------

export async function confirmInstagramAccount(
  contextToken: string,
  code: string,
  machineId: string,
  onProgress?: ProgressCallback
): Promise<{ userId: string | null }> {
  const progress = onProgress ?? (() => {});

  console.log(`[INSTAGRAM] Submitting confirmation code: ${code}...`);
  progress('Preparing confirmation', 'Loading fresh session tokens for confirmation request...');

  // We need a fresh set of tokens to submit the confirmation
  const tokens = await loadSignupPage();
  // Use the machine_id from the original registration
  tokens.machineId = machineId;

  const clientMutationId = crypto.randomUUID();

  const variables = {
    input: {
      client_mutation_id: clientMutationId,
      actor_id: '0',
      conf_code: { sensitive_string_value: code },
      ig_reg_data: contextToken,
      machine_id: machineId,
      youth_consent_decision_time: null
    }
  };

  progress('Submitting confirmation code', `POST /api/graphql — useCAAFBConfirmationFormSubmitMutation (code: ${code})`);

  const result = await postGraphql(
    tokens,
    'useCAAFBConfirmationFormSubmitMutation',
    DOC_ID_CONFIRMATION,
    variables
  );

  const data = result.data as Record<string, unknown> | undefined;
  const confirm = data?.xfb_caa_registration_confirmation_submit as Record<string, unknown> | undefined;
  const createdUserId = (confirm?.created_user_id as string) ?? null;

  if (createdUserId) {
    console.log(`[INSTAGRAM] Account created! User ID: ${createdUserId}`);
    progress('Account created', `Instagram user ID: ${createdUserId}`);
  } else {
    console.warn(`[INSTAGRAM] Confirmation response: ${JSON.stringify(result).slice(0, 500)}`);
    progress('Confirmation submitted', 'Awaiting final confirmation from Instagram...');
  }

  return { userId: createdUserId };
}
