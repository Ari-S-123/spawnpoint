#!/usr/bin/env python3
"""
MCP Server Enrichment Module

Enriches server data with external signals:
1. GitHub signals (stars, issues, commits, contributors)
2. NPM download counts
3. PyPI download counts
4. Docker Hub pull counts
5. Glama registry cross-listing
6. Known service pricing heuristics
7. Library dependency counts (libraries.io)
8. Config file references (GitHub code search)

Usage:
  python enrich.py github [--db path] [--token TOKEN]   # Enrich with GitHub data
  python enrich.py npm [--db path]                      # Enrich with NPM downloads
  python enrich.py pypi [--db path]                     # Enrich with PyPI downloads
  python enrich.py docker [--db path]                   # Enrich with Docker pulls
  python enrich.py glama [--db path]                    # Cross-reference with Glama
  python enrich.py dependents [--db path] [--api-key]   # Library dependency counts
  python enrich.py config-refs [--db path] [--token]    # Config file references
  python enrich.py all [--db path]                      # Run all enrichments
  python enrich.py stats [--db path]                    # Show enrichment stats
"""


import argparse
import json
import logging
import math
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Dict, List, Tuple
from urllib.parse import urlparse
from dotenv import load_dotenv


from concurrent.futures import ThreadPoolExecutor, as_completed
import requests
import numpy as np  # For more robust percentiles if needed, but we'll use a simple helper
from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, TimeRemainingColumn, MofNCompleteColumn

from db import DATABASE_PATH, get_connection, init_database
# from relevance import RelevanceEngine
# from retriever import Retriever

# Load environment variables from .env file
load_dotenv()

# ==================== LOGGING SETUP ====================

LOG_FILE = Path(__file__).parent / "enrich.log"

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s | %(levelname)s | %(message)s',
    handlers=[
        logging.FileHandler(LOG_FILE),
        logging.StreamHandler()  # Also print to console
    ]
)
logger = logging.getLogger(__name__)

# Reduce noise from requests library
logging.getLogger("urllib3").setLevel(logging.WARNING)


# ==================== RATE LIMIT HELPERS ====================

def with_retry(
    func_name: str,
    max_retries: int = 3,
    base_delay: float = 30.0,
    status_code: int = None,
    response: requests.Response = None
) -> Tuple[bool, float]:
    """
    Helper to determine if we should retry and how long to wait.
    
    Returns (should_retry, wait_time).
    
    Usage:
        should_retry, wait_time = with_retry("libraries.io", retry_count, 30.0, 429, response)
        if should_retry:
            time.sleep(wait_time)
            return fetch_data(..., retry_count + 1)
    """
    # This is a simple helper - the actual retry logic is in each function
    pass


def exponential_backoff_request(
    url: str,
    headers: Dict = None,
    params: Dict = None,
    timeout: int = 15,
    max_retries: int = 3,
    base_delay: float = 30.0,
    service_name: str = "API"
) -> Optional[requests.Response]:
    """
    Make an HTTP GET request with exponential backoff on rate limits (429) and server errors (5xx).
    
    Args:
        url: URL to request
        headers: Optional request headers
        params: Optional query parameters
        timeout: Request timeout in seconds
        max_retries: Maximum number of retries
        base_delay: Base delay in seconds (doubles each retry)
        service_name: Name for logging
    
    Returns:
        Response object on success, None on failure after retries
    """
    headers = headers or {}
    
    for attempt in range(max_retries + 1):
        try:
            response = requests.get(url, headers=headers, params=params, timeout=timeout)
            
            # Success
            if response.status_code == 200:
                return response
            
            # Not found - don't retry
            if response.status_code == 404:
                logger.info(f"{service_name} 404: {url}")
                return response
            
            # Rate limited or server error - retry with backoff
            if response.status_code in (429, 500, 502, 503, 504):
                if attempt < max_retries:
                    wait_time = base_delay * (2 ** attempt)
                    logger.warning(f"{service_name} {response.status_code}: retrying in {wait_time}s (attempt {attempt + 1}/{max_retries})")
                    print(f" [{response.status_code}, waiting {wait_time}s]", end="")
                    time.sleep(wait_time)
                    continue
                else:
                    logger.error(f"{service_name} {response.status_code}: max retries exceeded for {url}")
                    return response
            
            # Other error - log and return
            logger.warning(f"{service_name} {response.status_code}: {url}")
            return response
            
        except requests.exceptions.Timeout:
            if attempt < max_retries:
                wait_time = base_delay * (2 ** attempt)
                logger.warning(f"{service_name} timeout: retrying in {wait_time}s (attempt {attempt + 1}/{max_retries})")
                time.sleep(wait_time)
                continue
            else:
                logger.error(f"{service_name} timeout: max retries exceeded for {url}")
                return None
                
        except Exception as e:
            logger.error(f"{service_name} error for {url}: {e}")
            return None
    
    return None


# ==================== ENRICHMENT STATUS TRACKING ====================

def categorize_enrichment_failure(status_code: int = None, error_message: str = None) -> tuple:
    """
    Categorize an enrichment failure as permanent or transient.
    
    Returns: (status, failure_reason)
    """
    # Check HTTP status codes first
    if status_code:
        if status_code == 404:
            return "permanent_failure", "not_found_404"
        elif status_code in (401, 403):
            return "permanent_failure", "auth_required"
        elif status_code == 429:
            return "transient_failure", "rate_limited"
        elif status_code >= 500:
            return "transient_failure", f"server_error_{status_code}"
    
    # Check error messages
    if error_message:
        error_lower = error_message.lower()
        
        # Permanent failures
        if "not found" in error_lower or "404" in error_lower:
            return "permanent_failure", "not_found"
        if "does not exist" in error_lower:
            return "permanent_failure", "does_not_exist"
        if "package not found" in error_lower:
            return "permanent_failure", "package_not_found"
        if "repository not found" in error_lower:
            return "permanent_failure", "repo_not_found"
        
        # Transient failures
        if "timeout" in error_lower:
            return "transient_failure", "timeout"
        if "rate limit" in error_lower:
            return "transient_failure", "rate_limited"
        if "connection" in error_lower:
            return "transient_failure", "connection_error"
    
    # Default to transient
    return "transient_failure", "unknown"


def update_enrichment_status(
    conn,
    server_name: str,
    enrichment_type: str,
    success: bool,
    failure_reason: str = None
):
    """Update the enrichment status for a server."""
    cursor = conn.cursor()
    now = datetime.now(timezone.utc).isoformat()
    
    if success:
        cursor.execute("""
            INSERT INTO enrichment_status 
            (server_name, enrichment_type, status, failure_reason, last_attempted_at, retry_count)
            VALUES (?, ?, 'success', NULL, ?, 0)
            ON CONFLICT(server_name, enrichment_type) DO UPDATE SET
                status = 'success',
                failure_reason = NULL,
                last_attempted_at = excluded.last_attempted_at,
                retry_count = 0
        """, (server_name, enrichment_type, now))
    else:
        status, reason = categorize_enrichment_failure(error_message=failure_reason)
        cursor.execute("""
            INSERT INTO enrichment_status 
            (server_name, enrichment_type, status, failure_reason, last_attempted_at, retry_count)
            VALUES (?, ?, ?, ?, ?, 1)
            ON CONFLICT(server_name, enrichment_type) DO UPDATE SET
                status = excluded.status,
                failure_reason = excluded.failure_reason,
                last_attempted_at = excluded.last_attempted_at,
                retry_count = enrichment_status.retry_count + 1
        """, (server_name, enrichment_type, status, reason, now))
    
    conn.commit()


def get_permanent_failures(conn, enrichment_type: str) -> set:
    """Get server names with permanent failures for an enrichment type."""
    cursor = conn.cursor()
    cursor.execute("""
        SELECT server_name FROM enrichment_status 
        WHERE enrichment_type = ? AND status = 'permanent_failure'
    """, (enrichment_type,))
    return {row['server_name'] for row in cursor.fetchall()}


# ==================== DATABASE SCHEMA EXTENSION ====================


def create_enrichment_schema(conn):
    """Create additional tables for enrichment data."""
    cursor = conn.cursor()
    
    # GitHub signals
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS github_signals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            server_name TEXT UNIQUE NOT NULL,
            repo_owner TEXT,
            repo_name TEXT,
            stars INTEGER,
            forks INTEGER,
            open_issues INTEGER,
            watchers INTEGER,
            subscribers INTEGER,
            last_push TIMESTAMP,
            created_at TIMESTAMP,
            license TEXT,
            language TEXT,
            topics TEXT,
            is_archived BOOLEAN DEFAULT FALSE,
            is_fork BOOLEAN DEFAULT FALSE,
            default_branch TEXT,
            enriched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (server_name) REFERENCES servers(name)
        )
    """)
    
    # Package download counts
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS package_downloads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            server_name TEXT NOT NULL,
            registry_type TEXT NOT NULL,
            package_name TEXT NOT NULL,
            downloads_last_day INTEGER,
            downloads_last_week INTEGER,
            downloads_last_month INTEGER,
            total_downloads INTEGER,
            enriched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(server_name, registry_type, package_name),
            FOREIGN KEY (server_name) REFERENCES servers(name)
        )
    """)
    
    # Cross-listing in other registries
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS cross_listings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            server_name TEXT NOT NULL,
            registry_name TEXT NOT NULL,
            registry_id TEXT,
            registry_url TEXT,
            attributes TEXT,
            license_name TEXT,
            license_url TEXT,
            enriched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(server_name, registry_name),
            FOREIGN KEY (server_name) REFERENCES servers(name)
        )
    """)
    
    # Service cost heuristics
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS service_cost_hints (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            server_name TEXT UNIQUE NOT NULL,
            requires_paid_service BOOLEAN DEFAULT FALSE,
            paid_services TEXT,
            free_tier_available BOOLEAN,
            cost_estimate TEXT,
            notes TEXT,
            enriched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (server_name) REFERENCES servers(name)
        )
    """)
    
    # Indexes
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_github_stars ON github_signals(stars)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_github_push ON github_signals(last_push)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_downloads_server ON package_downloads(server_name)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_crosslist_server ON cross_listings(server_name)")
    
    conn.commit()


# ==================== GITHUB ENRICHMENT ====================

def parse_github_url(url: str) -> Optional[Tuple[str, str]]:
    """Extract owner and repo from a GitHub URL."""
    if not url:
        return None
    
    # Handle various GitHub URL formats
    patterns = [
        r'github\.com[/:]([^/]+)/([^/\.]+)',  # https://github.com/owner/repo or git@github.com:owner/repo
        r'raw\.githubusercontent\.com/([^/]+)/([^/]+)',  # Raw content URLs
    ]
    
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            owner = match.group(1)
            repo = match.group(2).rstrip('.git')
            return (owner, repo)
    
    return None


def fetch_github_data(owner: str, repo: str, token: Optional[str] = None) -> Tuple[Optional[Dict], Optional[str]]:
    """
    Fetch repository data from GitHub API with exponential backoff.
    
    Returns: (data, error_message) - data is None on failure
    """
    headers = {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "MCP-Registry-Enricher"
    }
    if token:
        headers["Authorization"] = f"token {token}"
    
    url = f"https://api.github.com/repos/{owner}/{repo}"
    response = exponential_backoff_request(
        url=url,
        headers=headers,
        timeout=10,
        max_retries=3,
        base_delay=5.0,  # GitHub rate limits are per-minute, so shorter delays
        service_name="GitHub"
    )
    
    if response is not None and response.status_code == 200:
        return response.json(), None
    elif response is not None:
        return None, f"HTTP {response.status_code}"
    return None, "Request failed"



def enrich_github(db_path: Path = DATABASE_PATH, token: Optional[str] = None, limit: Optional[int] = None, skip_failures: bool = True, progress: Optional[Progress] = None, query: Optional[str] = None):
    """
    Enrich servers with GitHub repository data.
    
    Args:
        skip_failures: If True (default), skip servers with permanent failures from previous runs.
                      Set to False (via --clean) to retry all servers.
    """
    conn = init_database(db_path)
    create_enrichment_schema(conn)
    cursor = conn.cursor()
    
    # Get permanent failures to skip (unless skip_failures is False)
    permanent_failures = get_permanent_failures(conn, "github") if skip_failures else set()
    if permanent_failures:
        print(f"  Skipping {len(permanent_failures)} servers with permanent failures")
    
    # Get servers with GitHub repository URLs that haven't been enriched recently
    sql_query = """
        SELECT s.name, s.repository_url 
        FROM servers s
        LEFT JOIN github_signals gs ON s.name = gs.server_name
        WHERE s.repository_url LIKE '%github.com%'
          AND (gs.enriched_at IS NULL 
               OR gs.enriched_at < datetime('now', '-7 days'))
    """
    if limit:
        sql_query += f" LIMIT {limit}"
    cursor.execute(sql_query)
    
    servers = cursor.fetchall()
    # Filter out permanent failures
    servers = [s for s in servers if s['name'] not in permanent_failures]
    
    # Filter by query if provided
    if query:
        if query.startswith('='):
            q = query[1:].lower()
            servers = [s for s in servers if q == s['name'].lower()]
        else:
            q = query.lower()
            servers = [s for s in servers if q in s['name'].lower()]
    
    if progress:
        task_id = progress.add_task("[cyan]Enriching GitHub...", total=len(servers))
    else:
        print(f"\nEnriching {len(servers)} servers with GitHub data...")
        task_id = None

    
    token = token or os.environ.get('GITHUB_TOKEN')
    
    # Check rate limit
    if not token:
        print("Note: Without a GitHub token, rate limit is 60 requests/hour")
        print("      Set GITHUB_TOKEN env var for 5000 requests/hour")
    
    
    enriched = 0
    failed = 0
    for server in servers:
        server_name = server['name']
        repo_url = server['repository_url']
        
        parsed = parse_github_url(repo_url)
        if not parsed:
            continue
            
        owner, repo = parsed
        
        if progress:
            progress.update(task_id, advance=1, description=f"[cyan]GitHub: {server_name}")
        else:
            print(f"  {server_name} ({owner}/{repo})...", end=" ", flush=True)
        
        data, error = fetch_github_data(owner, repo, token)
        if data:
            stars = data.get('stargazers_count', 0)
            # ... database update ...
            license_name = data.get('license', {}).get('spdx_id') if data.get('license') else None
            topics = json.dumps(data.get('topics', []))
            
            cursor.execute("""
                INSERT OR REPLACE INTO github_signals 
                (server_name, repo_owner, repo_name, stars, forks, open_issues,
                 watchers, subscribers, last_push, created_at, license, language,
                 topics, is_archived, is_fork, default_branch, enriched_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                server_name,
                owner,
                repo,
                data.get('stargazers_count', 0),
                data.get('forks_count', 0),
                data.get('open_issues_count', 0),
                data.get('watchers_count', 0),
                data.get('subscribers_count', 0),
                data.get('pushed_at'),
                data.get('created_at'),
                license_name,
                data.get('language'),
                topics,
                data.get('archived', False),
                data.get('fork', False),
                data.get('default_branch'),
                datetime.now(timezone.utc).isoformat()
            ))
            if progress:
                progress.console.print(f"  [cyan]GitHub:[/cyan] {server_name} ({owner}/{repo}) [green]✓ {data.get('stargazers_count', 0)}⭐[/green]")
            else:
                print(f"✓ {data.get('stargazers_count', 0)}⭐")
            enriched += 1
        else:
            if progress:
                progress.console.print(f"  [cyan]GitHub:[/cyan] {server_name} ({owner}/{repo}) [red]✗ ({error})[/red]")
            else:
                print(f"✗ ({error})")
            failed += 1
        
        # Rate limiting - be nice to GitHub
        time.sleep(0.5)
    
    conn.commit()
    conn.close()
    if not progress:
        print(f"\n✓ Enriched {enriched} servers with GitHub data ({failed} failures)")
    elif task_id is not None:
        progress.update(task_id, visible=False)


# ==================== NPM ENRICHMENT ====================

def fetch_npm_downloads(package_name: str) -> Optional[Dict]:
    """Fetch download counts from NPM with exponential backoff."""
    base_url = "https://api.npmjs.org/downloads/point"
    
    # Get last-week downloads
    week_resp = exponential_backoff_request(
        url=f"{base_url}/last-week/{package_name}",
        timeout=10,
        max_retries=2,
        base_delay=5.0,
        service_name="npm"
    )
    
    if week_resp is None or week_resp.status_code != 200:
        return None
    
    week_data = week_resp.json()
    
    # Also get last-month and last-day
    month_resp = exponential_backoff_request(f"{base_url}/last-month/{package_name}", timeout=10, max_retries=1, base_delay=2.0, service_name="npm")
    day_resp = exponential_backoff_request(f"{base_url}/last-day/{package_name}", timeout=10, max_retries=1, base_delay=2.0, service_name="npm")
    
    month_data = month_resp.json() if month_resp and month_resp.status_code == 200 else {}
    day_data = day_resp.json() if day_resp and day_resp.status_code == 200 else {}
    
    return {
        'downloads_last_day': day_data.get('downloads', 0),
        'downloads_last_week': week_data.get('downloads', 0),
        'downloads_last_month': month_data.get('downloads', 0)
    }



def enrich_npm(db_path: Path = DATABASE_PATH, limit: Optional[int] = None, skip_failures: bool = True, progress: Optional[Progress] = None, query: Optional[str] = None):
    """Enrich servers with NPM download counts."""
    conn = init_database(db_path)
    create_enrichment_schema(conn)
    cursor = conn.cursor()
    
    # Get permanent failures to skip
    permanent_failures = get_permanent_failures(conn, "npm") if skip_failures else set()
    if permanent_failures:
        print(f"  Skipping {len(permanent_failures)} servers with permanent failures")
    
    # Get NPM packages
    query = """
        SELECT DISTINCT sp.server_name, sp.identifier
        FROM server_packages sp
        LEFT JOIN package_downloads pd 
            ON sp.server_name = pd.server_name 
            AND sp.identifier = pd.package_name
            AND pd.registry_type = 'npm'
        WHERE sp.registry_type = 'npm'
          AND (pd.enriched_at IS NULL 
               OR pd.enriched_at < datetime('now', '-1 days'))
    """
    if limit:
        query += f" LIMIT {limit}"
    cursor.execute(query)
    
    packages = cursor.fetchall()
    packages = [p for p in packages if p['server_name'] not in permanent_failures]
    
    # Filter by query if provided
    if query:
        q = query.lower()
        packages = [p for p in packages if q in p['server_name'].lower()]
    
    if progress:
        task_id = progress.add_task("[green]Enriching NPM...", total=len(packages))
    else:
        print(f"\nEnriching {len(packages)} NPM packages...")
        task_id = None

    
    enriched = 0
    failed = 0
    for pkg in packages:
        server_name = pkg['server_name']
        package_name = pkg['identifier']
        
        if progress:
            progress.update(task_id, advance=1, description=f"[green]NPM: {package_name}")
        else:
            print(f"  {package_name}...", end=" ", flush=True)
        
        data = fetch_npm_downloads(package_name)
        if data:
            cursor.execute("""
                INSERT OR REPLACE INTO package_downloads 
                (server_name, registry_type, package_name, 
                 downloads_last_day, downloads_last_week, downloads_last_month, enriched_at)
                VALUES (?, 'npm', ?, ?, ?, ?, ?)
            """, (
                server_name,
                package_name,
                data['downloads_last_day'],
                data['downloads_last_week'],
                data['downloads_last_month'],
                datetime.now(timezone.utc).isoformat()
            ))
            update_enrichment_status(conn, server_name, "npm", True)
            if progress:
                progress.console.print(f"  [green]NPM:[/green] {package_name} [green]✓ {data['downloads_last_week']:,}/week[/green]")
            else:
                print(f"✓ {data['downloads_last_week']:,}/week")
            enriched += 1
        else:
            update_enrichment_status(conn, server_name, "npm", False, "package_not_found")
            if progress:
                progress.console.print(f"  [green]NPM:[/green] {package_name} [red]✗ (Not found)[/red]")
            else:
                print("✗")
            failed += 1
        
        time.sleep(0.1)  # Be nice
    
    conn.commit()
    conn.close()
    if not progress:
        print(f"\n✓ Enriched {enriched} NPM packages ({failed} failures)")
    elif task_id is not None:
        progress.update(task_id, visible=False)


# ==================== PYPI ENRICHMENT ====================

def fetch_pypi_downloads(package_name: str) -> Optional[Dict]:
    """Fetch download counts from PyPI Stats with exponential backoff."""
    response = exponential_backoff_request(
        url=f"https://pypistats.org/api/packages/{package_name}/recent",
        timeout=10,
        max_retries=2,
        base_delay=5.0,
        service_name="PyPI"
    )
    
    if response is not None and response.status_code == 200:
        data = response.json().get('data', {})
        return {
            'downloads_last_day': data.get('last_day', 0),
            'downloads_last_week': data.get('last_week', 0),
            'downloads_last_month': data.get('last_month', 0)
        }
    return None


def enrich_pypi(db_path: Path = DATABASE_PATH, limit: Optional[int] = None, skip_failures: bool = True, progress: Optional[Progress] = None, query: Optional[str] = None):
    """Enrich servers with PyPI download counts."""
    conn = init_database(db_path)
    create_enrichment_schema(conn)
    cursor = conn.cursor()
    
    # Get permanent failures to skip
    permanent_failures = get_permanent_failures(conn, "pypi") if skip_failures else set()
    if permanent_failures:
        print(f"  Skipping {len(permanent_failures)} servers with permanent failures")
    
    query = """
        SELECT DISTINCT sp.server_name, sp.identifier
        FROM server_packages sp
        LEFT JOIN package_downloads pd 
            ON sp.server_name = pd.server_name 
            AND sp.identifier = pd.package_name
            AND pd.registry_type = 'pypi'
        WHERE sp.registry_type = 'pypi'
          AND (pd.enriched_at IS NULL 
               OR pd.enriched_at < datetime('now', '-1 days'))
    """
    if limit:
        query += f" LIMIT {limit}"
    cursor.execute(query)
    
    packages = cursor.fetchall()
    packages = [p for p in packages if p['server_name'] not in permanent_failures]
    
    # Filter by query if provided
    if query:
        q = query.lower()
        packages = [p for p in packages if q in p['server_name'].lower()]

    if progress:
        task_id = progress.add_task("[blue]Enriching PyPI...", total=len(packages))
    else:
        print(f"\nEnriching {len(packages)} PyPI packages...")
        task_id = None
    
    enriched = 0
    failed = 0
    for pkg in packages:
        server_name = pkg['server_name']
        package_name = pkg['identifier']
        
        if progress:
            progress.update(task_id, advance=1, description=f"[blue]PyPI: {package_name}")
        else:
            print(f"  {package_name}...", end=" ", flush=True)
        
        data = fetch_pypi_downloads(package_name)
        if data:
            cursor.execute("""
                INSERT OR REPLACE INTO package_downloads 
                (server_name, registry_type, package_name, 
                 downloads_last_day, downloads_last_week, downloads_last_month, enriched_at)
                VALUES (?, 'pypi', ?, ?, ?, ?, ?)
            """, (
                server_name,
                package_name,
                data['downloads_last_day'],
                data['downloads_last_week'],
                data['downloads_last_month'],
                datetime.now(timezone.utc).isoformat()
            ))
            update_enrichment_status(conn, server_name, "pypi", True)
            if progress:
                progress.console.print(f"  [blue]PyPI:[/blue] {package_name} [green]✓ {data['downloads_last_week']:,}/week[/green]")
            else:
                print(f"✓ {data['downloads_last_week']:,}/week")
            enriched += 1
        else:
            update_enrichment_status(conn, server_name, "pypi", False, "package_not_found")
            if progress:
                progress.console.print(f"  [blue]PyPI:[/blue] {package_name} [red]✗ (Not found)[/red]")
            else:
                print("✗")
            failed += 1
        
        time.sleep(0.2)
    
    conn.commit()
    conn.close()
    if not progress:
        print(f"\n✓ Enriched {enriched} PyPI packages ({failed} failures)")
    elif task_id is not None:
        progress.update(task_id, visible=False)


# ==================== DOCKER ENRICHMENT ====================

def fetch_docker_pulls(image: str) -> Optional[int]:
    """Fetch pull count from Docker Hub with exponential backoff."""
    # Parse image name (namespace/repo or library/repo)
    parts = image.split('/')
    if len(parts) == 1:
        namespace = 'library'
        repo = parts[0]
    else:
        namespace = parts[0]
        repo = '/'.join(parts[1:])
    
    # Remove tag if present
    repo = repo.split(':')[0]
    
    response = exponential_backoff_request(
        url=f"https://hub.docker.com/v2/repositories/{namespace}/{repo}",
        timeout=10,
        max_retries=2,
        base_delay=5.0,
        service_name="Docker"
    )
    
    if response is not None and response.status_code == 200:
        return response.json().get('pull_count', 0)
    return None


def enrich_docker(db_path: Path = DATABASE_PATH, limit: Optional[int] = None, skip_failures: bool = True, progress: Optional[Progress] = None, query: Optional[str] = None):
    """Enrich servers with Docker Hub pull counts."""
    conn = init_database(db_path)
    create_enrichment_schema(conn)
    cursor = conn.cursor()
    
    # Get permanent failures to skip
    permanent_failures = get_permanent_failures(conn, "docker") if skip_failures else set()
    if permanent_failures:
        print(f"  Skipping {len(permanent_failures)} servers with permanent failures")
    
    query = """
        SELECT DISTINCT sp.server_name, sp.identifier
        FROM server_packages sp
        LEFT JOIN package_downloads pd 
            ON sp.server_name = pd.server_name 
            AND sp.identifier = pd.package_name
            AND pd.registry_type = 'docker'
        WHERE sp.registry_type = 'oci'
          AND (pd.enriched_at IS NULL 
               OR pd.enriched_at < datetime('now', '-1 days'))
    """
    if limit:
        query += f" LIMIT {limit}"
    cursor.execute(query)
    
    packages = cursor.fetchall()
    packages = [p for p in packages if p['server_name'] not in permanent_failures]
    if progress:
        task_id = progress.add_task("[yellow]Enriching Docker...", total=len(packages))
    else:
        print(f"\nEnriching {len(packages)} Docker images...")
        task_id = None
    
    enriched = 0
    failed = 0
    for pkg in packages:
        server_name = pkg['server_name']
        image_name = pkg['identifier']
        
        if progress:
            progress.update(task_id, advance=1, description=f"[yellow]Docker: {image_name}")
        else:
            print(f"  {image_name}...", end=" ", flush=True)
        
        pulls = fetch_docker_pulls(image_name)
        if pulls is not None:
            cursor.execute("""
                INSERT OR REPLACE INTO package_downloads 
                (server_name, registry_type, package_name, total_downloads, enriched_at)
                VALUES (?, 'docker', ?, ?, ?)
            """, (
                server_name,
                image_name,
                pulls,
                datetime.now(timezone.utc).isoformat()
            ))
            update_enrichment_status(conn, server_name, "docker", True)
            if progress:
                progress.console.print(f"  [yellow]Docker:[/yellow] {image_name} [green]✓ {pulls:,} pulls[/green]")
            else:
                print(f"✓ {pulls:,} pulls")
            enriched += 1
        else:
            update_enrichment_status(conn, server_name, "docker", False, "image_not_found")
            if progress:
                progress.console.print(f"  [yellow]Docker:[/yellow] {image_name} [red]✗ (Not found)[/red]")
            else:
                print("✗")
            failed += 1
        
        time.sleep(0.2)
    
    conn.commit()
    conn.close()
    if not progress:
        print(f"\n✓ Enriched {enriched} Docker images ({failed} failures)")
    elif task_id is not None:
        progress.update(task_id, visible=False)


# ==================== GLAMA CROSS-LISTING ====================

def fetch_glama_servers(cursor: str = None, limit: int = 100) -> Tuple[List[Dict], Optional[str]]:
    """Fetch servers from Glama registry."""
    try:
        params = {}
        if cursor:
            params['cursor'] = cursor
        
        response = requests.get(
            "https://glama.ai/api/mcp/v1/servers",
            params=params,
            timeout=15
        )
        
        if response.status_code == 200:
            data = response.json()
            servers = data.get('servers', [])
            page_info = data.get('pageInfo', {})
            next_cursor = page_info.get('endCursor') if page_info.get('hasNextPage') else None
            return servers, next_cursor
        return [], None
    except Exception as e:
        print(f"  Error fetching Glama: {e}")
        return [], None


def enrich_glama(db_path: Path = DATABASE_PATH, progress: Optional[Progress] = None, query: Optional[str] = None):
    """Cross-reference servers with Glama registry."""
    conn = init_database(db_path)
    create_enrichment_schema(conn)
    cursor = conn.cursor()
    
    if progress:
        task_id = progress.add_task("[magenta]Fetching Glama registry...", total=None)
    else:
        print("\nFetching Glama registry...")
        task_id = None
    
    # Fetch all Glama servers
    all_glama = []
    next_cursor = None
    page = 0
    
    while True:
        servers, next_cursor = fetch_glama_servers(next_cursor)
        all_glama.extend(servers)
        page += 1
        if progress:
            progress.update(task_id, description=f"[magenta]Glama Page {page}: {len(all_glama)} servers")
        else:
            print(f"  Page {page}: {len(servers)} servers (total: {len(all_glama)})")
        
        if not next_cursor:
            break
        time.sleep(0.5)
    
    if progress:
        progress.update(task_id, description=f"[magenta]Cross-referencing {len(all_glama)} Glama servers...", total=len(all_glama))
    else:
        print(f"\nCross-referencing {len(all_glama)} Glama servers...")
    
    # Get our server names for matching
    cursor.execute("SELECT name, repository_url FROM servers")
    our_servers = {s['name']: s for s in cursor.fetchall()}
    
    # Filter by query if provided
    if query:
        q = query.lower()
        our_servers = {name: data for name, data in our_servers.items() if q in name.lower()}
    
    matched = 0
    for glama_server in all_glama:
        if progress:
            progress.update(task_id, advance=1)
        
        # Match by name or repo URL
        glama_name = glama_server.get('name', '')
        glama_slug = glama_server.get('slug', '')
        glama_repo = glama_server.get('repository', {}).get('url', '')
        
        # Match strategies
        match_name = None
        
        # 1. Exact name match
        if glama_name in our_servers:
            match_name = glama_name
        elif glama_slug in our_servers:
            match_name = glama_slug
        else:
            # 2. Repository URL match
            for our_name, our_data in our_servers.items():
                if our_data['repository_url'] and glama_repo:
                    # Normalize and compare
                    our_repo = our_data['repository_url'].lower().rstrip('/')
                    gl_repo = glama_repo.lower().rstrip('/')
                    if our_repo == gl_repo or our_repo.endswith(gl_repo) or gl_repo.endswith(our_repo):
                        match_name = our_name
                        break
        
        if match_name:
            spdx = glama_server.get('spdxLicense', {})
            cursor.execute("""
                INSERT OR REPLACE INTO cross_listings 
                (server_name, registry_name, registry_id, registry_url, 
                 attributes, license_name, license_url, enriched_at)
                VALUES (?, 'glama', ?, ?, ?, ?, ?, ?)
            """, (
                match_name,
                glama_server.get('id'),
                glama_server.get('url'),
                json.dumps(glama_server.get('attributes', [])),
                spdx.get('name') if spdx else None,
                spdx.get('url') if spdx else None,
                datetime.now(timezone.utc).isoformat()
            ))
            matched += 1
    
    conn.commit()
    conn.close()
    if not progress:
        print(f"\n✓ Matched {matched} servers with Glama registry")
    elif task_id is not None:
        progress.update(task_id, visible=False)


# ==================== SERVICE COST HEURISTICS ====================

# Known paid services (require paid API keys)
KNOWN_PAID_SERVICES = {
    'openai': ('OpenAI', False, 'Pay-per-token, ~$0.002-0.12/1K tokens'),
    'anthropic': ('Anthropic Claude', False, 'Pay-per-token, ~$0.003-0.075/1K tokens'),
    'cohere': ('Cohere', True, 'Free tier: 100 calls/min'),
    'replicate': ('Replicate', True, 'Free tier available, then pay-per-use'),
    'huggingface': ('Hugging Face', True, 'Free tier for inference API'),
    'pinecone': ('Pinecone', True, 'Free tier: 1 index'),
    'weaviate': ('Weaviate Cloud', True, 'Free sandbox available'),
    'supabase': ('Supabase', True, 'Free tier: 500MB'),
    'firebase': ('Firebase', True, 'Generous free tier'),
    'stripe': ('Stripe', False, 'Transaction fees only'),
    'twilio': ('Twilio', True, 'Free trial credits'),
    'sendgrid': ('SendGrid', True, 'Free: 100 emails/day'),
    'aws': ('AWS', True, 'Free tier for 12 months'),
    'gcp': ('Google Cloud', True, 'Free tier + $300 credit'),
    'azure': ('Azure', True, 'Free tier + $200 credit'),
    'notion': ('Notion', True, 'Free for personal use'),
    'slack': ('Slack', True, 'Free tier available'),
    'discord': ('Discord', True, 'Free for bots'),
    'github': ('GitHub', True, 'Free for public repos'),
    'gitlab': ('GitLab', True, 'Free tier available'),
    'jira': ('Jira', True, 'Free for small teams'),
    'linear': ('Linear', True, 'Free tier available'),
    'airtable': ('Airtable', True, 'Free tier available'),
    'figma': ('Figma', True, 'Free for 3 files'),
    'spotify': ('Spotify', True, 'Free API access'),
    'twitter': ('Twitter/X', True, 'Free: 1500 tweets/mo'),
    'google': ('Google APIs', True, 'Various free tiers'),
    'brave': ('Brave Search', True, 'Free: 2000 queries/mo'),
    'perplexity': ('Perplexity', False, 'Pay-per-query'),
    'exa': ('Exa', True, 'Free tier available'),
    'serpapi': ('SerpAPI', True, 'Free: 100 searches/mo'),
    'wolfram': ('Wolfram Alpha', True, 'Free: 2000/mo non-commercial'),
}


def analyze_service_costs(db_path: Path = DATABASE_PATH, progress: Optional[Progress] = None, query: Optional[str] = None):
    """Analyze servers for service cost requirements based on env vars."""
    conn = init_database(db_path)
    create_enrichment_schema(conn)
    cursor = conn.cursor()
    
    sql = """
        SELECT s.name, GROUP_CONCAT(ev.var_name) as secret_vars
        FROM servers s
        LEFT JOIN environment_variables ev ON s.name = ev.server_name AND ev.is_secret = 1
    """
    if query:
        sql += f" WHERE s.name LIKE '%{query}%'"
    sql += " GROUP BY s.name"
    
    if progress:
        task_id = progress.add_task("[orange3]Analyzing costs...", total=None)
    else:
        print("\nAnalyzing service cost requirements...")
        task_id = None
    
    # Get servers with their secret env vars
    cursor.execute(sql)
    
    analyzed = 0
    servers = cursor.fetchall()
    if progress:
        progress.update(task_id, total=len(servers))
        
    for server in servers:
        if progress:
            progress.update(task_id, advance=1)
        server_name = server['name']
        secret_vars = server['secret_vars'] or ''
        
        # Check which known services are required
        paid_services = []
        has_free_tier = True
        
        vars_lower = secret_vars.lower()
        for service_key, (service_name, free_available, pricing) in KNOWN_PAID_SERVICES.items():
            if service_key in vars_lower:
                paid_services.append(service_name)
                if not free_available:
                    has_free_tier = False
        
        if paid_services or secret_vars:
            requires_paid = len(paid_services) > 0 and not all(
                KNOWN_PAID_SERVICES.get(s.lower(), (None, True, None))[1] 
                for s in paid_services
            )
            
            cursor.execute("""
                INSERT OR REPLACE INTO service_cost_hints 
                (server_name, requires_paid_service, paid_services, 
                 free_tier_available, notes, enriched_at)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (
                server_name,
                requires_paid,
                json.dumps(paid_services) if paid_services else None,
                has_free_tier if paid_services else None,
                f"Secret vars: {secret_vars}" if secret_vars and not paid_services else None,
                datetime.now(timezone.utc).isoformat()
            ))
            analyzed += 1
    
    conn.commit()
    conn.close()
    if not progress:
        print(f"\n✓ Analyzed {analyzed} servers for service costs")
    elif task_id is not None:
        progress.update(task_id, visible=False)


# ==================== LIBRARIES.IO DEPENDENTS ====================

def fetch_librariesio_data(platform: str, package: str, api_key: Optional[str] = None) -> Optional[Dict]:
    """
    Fetch package data from libraries.io API with exponential backoff.
    
    Returns dependents_count, dependent_repos_count, and sourcerank.
    """
    params = {}
    if api_key:
        params['api_key'] = api_key
    
    response = exponential_backoff_request(
        url=f"https://libraries.io/api/{platform}/{package}",
        params=params,
        timeout=15,
        max_retries=3,
        base_delay=30.0,  # libraries.io has strict rate limits
        service_name="libraries.io"
    )
    
    if response is not None and response.status_code == 200:
        data = response.json()
        return {
            'dependents_count': data.get('dependents_count', 0),
            'dependent_repos_count': data.get('dependent_repos_count', 0),
            'sourcerank': data.get('rank'),
        }
    return None



def enrich_dependents(db_path: Path = DATABASE_PATH, api_key: Optional[str] = None, limit: Optional[int] = None, skip_failures: bool = True, progress: Optional[Progress] = None, query: Optional[str] = None):
    """
    Enrich npm/PyPI packages with dependent counts from libraries.io.
    
    This provides "vote" signals - how many other packages/repos depend on this.
    """
    conn = init_database(db_path)
    cursor = conn.cursor()
    
    # Get permanent failures to skip
    permanent_failures = get_permanent_failures(conn, "dependents") if skip_failures else set()
    if permanent_failures:
        print(f"  Skipping {len(permanent_failures)} servers with permanent failures")
    
    # Get API key from env if not provided
    api_key = api_key or os.environ.get('LIBRARIES_IO_API_KEY')
    
    if not api_key:
        print("Note: No LIBRARIES_IO_API_KEY set. Using unauthenticated requests (lower rate limit)")
    
    # Map our registry types to libraries.io platform names
    platform_map = {
        'npm': 'npm',
        'pypi': 'pypi',
    }
    
    # Get packages that haven't been enriched recently
    query = """
        SELECT DISTINCT sp.server_name, sp.identifier, sp.registry_type
        FROM server_packages sp
        LEFT JOIN dependency_signals ds 
            ON sp.server_name = ds.server_name 
            AND sp.identifier = ds.package_name
        WHERE sp.registry_type IN ('npm', 'pypi')
          AND (ds.enriched_at IS NULL 
               OR ds.enriched_at < datetime('now', '-7 days'))
    """
    if limit:
        query += f" LIMIT {limit}"
    cursor.execute(query)
    
    packages = cursor.fetchall()
    packages = [p for p in packages if p['server_name'] not in permanent_failures]
    if progress:
        task_id = progress.add_task("[white]Enriching Dependents...", total=len(packages))
    else:
        print(f"\nEnriching {len(packages)} packages with dependency data from libraries.io...")
        task_id = None
    
    enriched = 0
    failed = 0
    for pkg in packages:
        server_name = pkg['server_name']
        package_name = pkg['identifier']
        registry_type = pkg['registry_type']
        platform = platform_map.get(registry_type, registry_type)
        
        if progress:
            progress.update(task_id, advance=1, description=f"[white]Dependents: {package_name}")
        else:
            print(f"  {package_name} ({platform})...", end=" ", flush=True)
        
        data = fetch_librariesio_data(platform, package_name, api_key)
        if data:
            cursor.execute("""
                INSERT OR REPLACE INTO dependency_signals 
                (server_name, package_name, platform, dependents_count, 
                 dependent_repos_count, sourcerank, enriched_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                server_name,
                package_name,
                platform,
                data['dependents_count'],
                data['dependent_repos_count'],
                data['sourcerank'],
                datetime.now(timezone.utc).isoformat()
            ))
            if progress:
                deps = data['dependents_count'] or 0
                repos = data['dependent_repos_count'] or 0
                progress.console.print(f"  [white]Dependents:[/white] {package_name} ({platform}) [green]✓ {deps} pkg deps, {repos} repo deps[/green]")
            else:
                deps = data['dependents_count'] or 0
                repos = data['dependent_repos_count'] or 0
                print(f"✓ {deps} pkg deps, {repos} repo deps")
            enriched += 1
        else:
            update_enrichment_status(conn, server_name, "dependents", False, "package_not_found")
            if progress:
                progress.console.print(f"  [white]Dependents:[/white] {package_name} ({platform}) [red]✗ (Not found)[/red]")
            else:
                print("✗")
            failed += 1
        
        # Rate limiting - libraries.io allows 60/min with key, be conservative
        time.sleep(1.5)
    
    conn.commit()
    conn.close()
    if not progress:
        print(f"\n✓ Enriched {enriched} packages with dependency data ({failed} failures)")
    elif task_id is not None:
        progress.update(task_id, visible=False)


# ==================== GITHUB CODE SEARCH (CONFIG FILES) ====================

# MCP client config files to search for
MCP_CONFIG_FILES = {
    "claude_desktop": "claude_desktop_config.json",
    "cursor": "mcp.json",
    "windsurf": "mcp_config.json",
    "cline": "cline_mcp_settings.json",
}


def search_github_code(query: str, token: Optional[str] = None, retry_count: int = 0) -> Tuple[int, List[str]]:
    """
    Search GitHub code for a query with exponential backoff.
    
    Returns (total_count, list of repo full_names).
    GitHub code search has strict rate limits: 10 requests/min unauthenticated, 30/min authenticated.
    """
    headers = {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "MCP-Registry-Enricher"
    }
    if token:
        headers["Authorization"] = f"token {token}"
    
    try:
        response = requests.get(
            "https://api.github.com/search/code",
            params={"q": query, "per_page": 10},
            headers=headers,
            timeout=15
        )
        
        if response.status_code == 200:
            data = response.json()
            total = data.get('total_count', 0)
            repos = []
            for item in data.get('items', []):
                repo_name = item.get('repository', {}).get('full_name', '')
                if repo_name and repo_name not in repos:
                    repos.append(repo_name)
            return total, repos
        
        elif response.status_code == 403:
            # Rate limited - wait and retry
            if retry_count < 3:
                # Get reset time from headers
                reset_time = response.headers.get('X-RateLimit-Reset', '')
                remaining = response.headers.get('X-RateLimit-Remaining', '0')
                
                if reset_time:
                    try:
                        reset_ts = int(reset_time)
                        now = int(time.time())
                        wait_secs = max(reset_ts - now + 5, 30)  # Wait until reset + 5s buffer
                        wait_secs = min(wait_secs, 120)  # Cap at 2 minutes
                    except:
                        wait_secs = 60 * (2 ** retry_count)  # Fallback: 60s, 120s, 240s
                else:
                    wait_secs = 60 * (2 ** retry_count)
                
                logger.warning(f"GitHub code search rate limited, waiting {wait_secs}s (retry {retry_count + 1}/3)")
                print(f" [rate limited, waiting {wait_secs}s]", end="", flush=True)
                time.sleep(wait_secs)
                return search_github_code(query, token, retry_count + 1)
            else:
                logger.error(f"GitHub code search: max retries exceeded for query: {query[:50]}")
                print(f"  Rate limited (max retries)")
                return 0, []
        
        elif response.status_code == 422:
            # Unprocessable - query issue
            return 0, []
        else:
            logger.warning(f"GitHub code search {response.status_code}: {query[:50]}")
            return 0, []
            
    except Exception as e:
        logger.error(f"GitHub code search error: {e}")
        print(f"  Error: {e}")
        return 0, []


def enrich_config_refs(db_path: Path = DATABASE_PATH, token: Optional[str] = None, limit: Optional[int] = None, skip_failures: bool = True, progress: Optional[Progress] = None, query: Optional[str] = None):
    """
    Find repos that reference MCP servers in config files.
    
    Searches GitHub for server/package names in MCP client config files.
    This is a strong signal of actual usage.
    """
    import signal
    
    conn = init_database(db_path)
    cursor = conn.cursor()
    
    # Get permanent failures to skip
    permanent_failures = get_permanent_failures(conn, "config_refs") if skip_failures else set()
    if permanent_failures:
        print(f"  Skipping {len(permanent_failures)} servers with permanent failures")
    
    # Handle Ctrl+C gracefully - save progress before exiting
    def handle_interrupt(signum, frame):
        print("\n\n⚠️ Interrupted! Saving progress...")
        conn.commit()
        conn.close()
        print("✓ Progress saved. Run again to continue from where you left off.")
        exit(0)
    
    signal.signal(signal.SIGINT, handle_interrupt)
    
    # Get token from env if not provided
    token = token or os.environ.get('GITHUB_TOKEN')
    
    if not token:
        print("Warning: No GITHUB_TOKEN set. Code search requires authentication.")
        print("         Set GITHUB_TOKEN env var to enable this feature.")
        conn.close()
        return
    
    # Get servers with packages to search for - prioritize by GitHub stars
    sql = """
        SELECT DISTINCT s.name, s.repository_url, 
               GROUP_CONCAT(DISTINCT sp.identifier) as packages,
               COALESCE(gs.stars, 0) as stars
        FROM servers s
        LEFT JOIN server_packages sp ON s.name = sp.server_name
        LEFT JOIN config_references cr ON s.name = cr.server_name
        LEFT JOIN github_signals gs ON s.name = gs.server_name
        WHERE (cr.enriched_at IS NULL 
               OR cr.enriched_at < datetime('now', '-7 days'))
    """
    if query:
        sql += f" AND s.name LIKE '%{query}%'"
    sql += """
        GROUP BY s.name
        ORDER BY COALESCE(gs.stars, 0) DESC, s.name
    """
    if limit:
        sql += f" LIMIT {limit}"
    cursor.execute(sql)
    
    servers = cursor.fetchall()
    servers = [s for s in servers if s['name'] not in permanent_failures]
    if progress:
        task_id = progress.add_task("[bright_black]Searching configs...", total=len(servers))
    else:
        print(f"\nSearching GitHub for config file references to {len(servers)} servers...")
        task_id = None
    
    # Get server's own repo to exclude self-references
    def get_own_repo(repo_url: str) -> Optional[str]:
        if not repo_url or 'github.com' not in repo_url:
            return None
        match = re.search(r'github\.com[/:]([^/]+/[^/\.]+)', repo_url)
        return match.group(1) if match else None
    
    enriched = 0
    processed = 0
    for server in servers:
        server_name = server['name']
        packages = (server['packages'] or '').split(',')
        own_repo = get_own_repo(server['repository_url'])
        
        # Build search terms - use package names or server name
        search_terms = [p.strip() for p in packages if p.strip()]
        if not search_terms:
            search_terms = [server_name]
        
        stars = server['stars']
        if progress:
            progress.update(task_id, advance=1, description=f"[bright_black]Configs: {server_name}")
        else:
            print(f"\n  [{processed+1}/{len(servers)}] {server_name} ({stars}⭐):")
        
        for config_type, config_file in MCP_CONFIG_FILES.items():
            # Use the first search term for now
            search_term = search_terms[0] if search_terms else server_name
            
            # Build query: "package_name" filename:config_file
            search_query = f'"{search_term}" filename:{config_file}'
            
            total, repos = search_github_code(search_query, token)
            
            # Exclude self-references
            if own_repo:
                repos = [r for r in repos if r.lower() != own_repo.lower()]
                # Adjust count (approximate - we can't know exact without fetching all)
                if own_repo.lower() in [r.lower() for r in repos]:
                    total = max(0, total - 1)
            
            # Save result (even if 0) so we don't re-query this combination
            cursor.execute("""
                INSERT OR REPLACE INTO config_references 
                (server_name, search_term, config_type, reference_count, 
                 sample_repos, enriched_at)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (
                server_name,
                search_term,
                config_type,
                total,
                json.dumps(repos[:5]) if repos else None,
                datetime.now(timezone.utc).isoformat()
            ))
            
            if total > 0:
                if progress:
                    progress.console.print(f"  [bright_black]Configs:[/bright_black] {server_name} [green]✓ {config_type}: {total} repos[/green]")
                else:
                    print(f"    {config_type}: {total} repos")
                enriched += 1
            
            # Rate limiting - GitHub search is 30/min
            time.sleep(2.5)
        
        processed += 1
        # Commit every 10 servers to save progress
        if processed % 10 == 0:
            conn.commit()
            logger.info(f"Committed progress: {processed}/{len(servers)} servers processed")
    
    conn.commit()
    conn.close()
    if not progress:
        print(f"\n✓ Found config references for {enriched} server/config combinations")
    elif task_id is not None:
        progress.update(task_id, visible=False)


# ==================== BACKLINK SCORING ====================

# Tier weights (normalized to ~1.0 scale)
TIER_WEIGHTS = {
    "tier1_config": 1.0,      # MCP config files (highest signal)
    "tier2_dependency": 0.8,  # Package dependencies
    "tier3_deployment": 0.6,  # Docker/K8s/CI
    "tier4_curated": 0.3,     # Awesome lists, curated collections
    "tier5_mention": 0.1,     # Tutorials, examples, mentions
}

# Map config types to tiers
CONFIG_TYPE_TO_TIER = {
    "claude_desktop": "tier1_config",
    "cursor": "tier1_config",
    "windsurf": "tier1_config",
    "cline": "tier1_config",
}


def compute_recency_factor(pushed_at: Optional[str], decay_rate: float = 0.5) -> float:
    """
    Compute recency factor using exponential decay.
    
    decay_rate = 0.5 means:
      - pushed today: 1.0
      - pushed 1 year ago: ~0.6
      - pushed 2 years ago: ~0.37
    """
    if not pushed_at:
        return 0.5  # Unknown = assume moderate age
    
    try:
        if isinstance(pushed_at, str):
            # Parse ISO format
            pushed_date = datetime.fromisoformat(pushed_at.replace('Z', '+00:00'))
        else:
            pushed_date = pushed_at
        
        now = datetime.now(pushed_date.tzinfo) if pushed_date.tzinfo else datetime.now(timezone.utc)
        years_ago = (now - pushed_date).days / 365.0
        
        return math.exp(-decay_rate * years_ago)
    except:
        return 0.5


def compute_quality_factor(is_archived: bool, is_fork: bool, stars: int) -> float:
    """
    Compute quality factor based on repo characteristics.
    
    Penalizes archived repos and forks.
    """
    factor = 1.0
    
    if is_archived:
        factor *= 0.2
    if is_fork:
        factor *= 0.5
    
    return factor


def compute_edge_score(
    tier_weight: float,
    stars: int,
    pushed_at: Optional[str],
    is_archived: bool = False,
    is_fork: bool = False
) -> float:
    """
    Compute edge score for a single backlink reference.
    
    Formula: tier_weight × log1p(stars) × recency × quality
    """
    star_factor = 1.0 + math.log1p(stars)  # ensure 0 stars still contributes 1.0
    recency = compute_recency_factor(pushed_at)
    quality = compute_quality_factor(is_archived, is_fork, stars)
    
    return tier_weight * star_factor * recency * quality


def normalize_score(raw_score: float, k: float = 0.1) -> float:
    """
    Normalize raw score to [0, 1) using asymptotic squashing.
    
    Formula: 1 - exp(-k * raw_score)
    
    With k=0.1:
      - raw=0  → 0.00
      - raw=5  → 0.39
      - raw=10 → 0.63
      - raw=20 → 0.86
      - raw=50 → 0.99
    """
    return 1 - math.exp(-k * raw_score)


def fetch_repo_metadata(owner: str, repo: str, token: Optional[str] = None) -> Optional[Dict]:
    """Fetch repo metadata from GitHub for scoring."""
    headers = {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "MCP-Registry-Enricher"
    }
    if token:
        headers["Authorization"] = f"token {token}"
    
    try:
        response = requests.get(
            f"https://api.github.com/repos/{owner}/{repo}",
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            return {
                'stars': data.get('stargazers_count', 0),
                'pushed_at': data.get('pushed_at'),
                'is_archived': data.get('archived', False),
                'is_fork': data.get('fork', False),
            }
        return None
    except:
        return None


def compute_backlink_scores(db_path: Path = DATABASE_PATH, token: Optional[str] = None, progress: Optional[Progress] = None, query: Optional[str] = None):
    """
    Compute and store backlink scores for all servers.
    
    This aggregates signals from:
    1. Config file references (with repo quality weighting)
    2. Package dependencies (from libraries.io)
    
    The final score is normalized to [0, 1) using asymptotic squashing.
    """
    conn = init_database(db_path)
    cursor = conn.cursor()
    
    token = token or os.environ.get('GITHUB_TOKEN')
    
    if progress:
        score_task_id = progress.add_task("[bold white]Computing backlink scores...", total=None)
    else:
        print("\nComputing backlink scores...")
        score_task_id = None
        
    # ========== Stage 1: Parallel Metadata Pre-fetching ==========
    # Collect all unique referencer repos from all config references
    cursor.execute("SELECT DISTINCT sample_repos FROM config_references WHERE sample_repos IS NOT NULL")
    all_sample_repos = set()
    for row in cursor.fetchall():
        repos = json.loads(row['sample_repos'])
        all_sample_repos.update(repos)
    
    # Filter repos that already have metadata cached
    if all_sample_repos:
        cursor.execute(f"SELECT referencer_repo FROM backlink_edges WHERE repo_stars IS NOT NULL AND referencer_repo IN ({','.join(['?']*len(all_sample_repos))})", list(all_sample_repos))
        cached_repos = {row['referencer_repo'] for row in cursor.fetchall()}
        missing_repos = sorted(list(all_sample_repos - cached_repos))
    else:
        missing_repos = []
        
    if missing_repos:
        if progress:
            meta_task_id = progress.add_task("[cyan]Gathering repo metadata...", total=len(missing_repos))
        else:
            print(f"Gathering metadata for {len(missing_repos)} new referencer repositories...")
            meta_task_id = None
            
        def fetch_meta(repo_fullname):
            parts = repo_fullname.split('/')
            if len(parts) == 2:
                meta = fetch_repo_metadata(parts[0], parts[1], token)
                if meta:
                    return repo_fullname, meta
            return repo_fullname, None

        # Fetch missing metadata in parallel
        # Note: GitHub search limit is low, but GET repo metadata is higher (5000/hr)
        # We use a reasonable thread pool size
        with ThreadPoolExecutor(max_workers=10) as executor:
            future_to_repo = {executor.submit(fetch_meta, repo): repo for repo in missing_repos}
            for future in as_completed(future_to_repo):
                repo_fullname, meta = future.result()
                if meta:
                    # Update cache table immediately (as a synthetic edge for now to store metadata)
                    # This ensures metadata is available for the main loop
                    cursor.execute("""
                        INSERT OR IGNORE INTO backlink_edges
                        (server_name, referencer_repo, tier, repo_stars, repo_pushed_at, is_archived, is_fork, created_at)
                        VALUES ('__cache__', ?, 'metadata_cache', ?, ?, ?, ?, ?)
                    """, (
                        repo_fullname,
                        meta['stars'],
                        meta['pushed_at'],
                        meta['is_archived'],
                        meta['is_fork'],
                        datetime.now(timezone.utc).isoformat()
                    ))
                    # Also update existing edges if they exist but lack metadata
                    cursor.execute("""
                        UPDATE backlink_edges 
                        SET repo_stars = ?, repo_pushed_at = ?, is_archived = ?, is_fork = ?
                        WHERE referencer_repo = ? AND repo_stars IS NULL
                    """, (meta['stars'], meta['pushed_at'], meta['is_archived'], meta['is_fork'], repo_fullname))
                
                if progress:
                    progress.update(meta_task_id, advance=1, description=f"[cyan]Metadata: {repo_fullname}")
            
        conn.commit()
        if progress:
            progress.update(meta_task_id, visible=False)

    # ========== Stage 2: Scoring Loop (Now hitting DB cache) ==========
    # Get all servers
    cursor.execute("SELECT name, repository_url FROM servers")
    servers = cursor.fetchall()
    
    # Filter by query if provided
    if query:
        q = query.lower()
        servers = [s for s in servers if q in s['name'].lower()]
        
    if progress:
        progress.update(score_task_id, total=len(servers))
    
    # Store results for second pass normalization
    server_raw_results = {}
    computed = 0
    
    for server in servers:
        server_name = server['name']
        if progress:
            progress.update(score_task_id, advance=1, description=f"[bold white]Scoring: {server_name}")
            
        own_repo = None
        
        # Extract own repo to exclude self-references
        repo_url = server['repository_url']
        if repo_url and 'github.com' in repo_url:
            match = re.search(r'github\.com[/:]([^/]+/[^/\.]+)', repo_url)
            if match:
                own_repo = match.group(1).lower()
        
        tier_contributions = {
            'tier1': 0.0,
            'tier2': 0.0,
            'tier3': 0.0,
            'tier4': 0.0,
        }
        unique_repos = set()
        edges_to_store = []
        
        # ========== Process config references (Tier 1) ==========
        cursor.execute("""
            SELECT config_type, reference_count, sample_repos
            FROM config_references
            WHERE server_name = ?
        """, (server_name,))
        
        for ref in cursor.fetchall():
            config_type = ref['config_type']
            sample_repos = json.loads(ref['sample_repos']) if ref['sample_repos'] else []
            tier = CONFIG_TYPE_TO_TIER.get(config_type, "tier1_config")
            tier_weight = TIER_WEIGHTS.get(tier, 0.5)
            
            # For each sample repo, compute edge score
            # (We only have sample repos, not all - this is an approximation)
            for repo_fullname in sample_repos:
                if not repo_fullname:
                    continue
                    
                # Skip self-references
                if own_repo and repo_fullname.lower() == own_repo:
                    continue
                
                # Dedupe: one repo contributes once per tier
                repo_tier_key = (repo_fullname.lower(), tier)
                if repo_tier_key in unique_repos:
                    continue
                unique_repos.add(repo_tier_key)
                
                # Try to get repo metadata (now guaranteed to be in DB if we pre-fetched)
                cursor.execute("""
                    SELECT repo_stars, repo_pushed_at, is_archived, is_fork
                    FROM backlink_edges
                    WHERE referencer_repo = ? AND repo_stars IS NULL
                    UNION
                    SELECT repo_stars, repo_pushed_at, is_archived, is_fork
                    FROM backlink_edges
                    WHERE referencer_repo = ? AND repo_stars IS NOT NULL
                    LIMIT 1
                """, (repo_fullname, repo_fullname))
                existing = cursor.fetchone()
                
                if existing and existing['repo_stars'] is not None:
                    stars = existing['repo_stars']
                    pushed_at = existing['repo_pushed_at']
                    is_archived = existing['is_archived']
                    is_fork = existing['is_fork']
                else:
                    # Fallback (shouldn't happen often now)
                    stars, pushed_at, is_archived, is_fork = 0, None, False, False
                
                edge_score = compute_edge_score(tier_weight, stars, pushed_at, is_archived, is_fork)
                tier_contributions['tier1'] += edge_score
                
                edges_to_store.append({
                    'server_name': server_name,
                    'referencer_repo': repo_fullname,
                    'tier': tier,
                    'tier_weight': tier_weight,
                    'repo_stars': stars,
                    'repo_pushed_at': pushed_at,
                    'is_archived': is_archived,
                    'is_fork': is_fork,
                    'edge_score': edge_score,
                })
        
        # ========== Process dependency signals (Tier 2) ==========
        cursor.execute("""
            SELECT package_name, platform, dependents_count, dependent_repos_count, sourcerank
            FROM dependency_signals
            WHERE server_name = ?
        """, (server_name,))
        
        for dep in cursor.fetchall():
            # For dependencies, we don't have individual repos
            # Use aggregate count with a synthetic edge score
            dependents = dep['dependents_count'] or 0
            repos = dep['dependent_repos_count'] or 0
            sourcerank = dep['sourcerank'] or 0
            
            # Create a synthetic score based on dependent count
            # log1p to dampen very high counts
            tier_weight = TIER_WEIGHTS['tier2_dependency']
            
            # Each dependent contributes a small amount
            # Use sqrt to dampen large numbers
            dep_score = tier_weight * math.log1p(dependents) * math.sqrt(1 + repos / 100)
            tier_contributions['tier2'] += dep_score
        
        # ========== Compute raw score ==========
        raw_score = sum(tier_contributions.values())
        server_raw_results[server_name] = {
            'raw_score': raw_score,
            'tier_contributions': tier_contributions,
            'edges_to_store': edges_to_store,
            'unique_repos_count': len(set(r.split('/')[0] + '/' + r.split('/')[1] if '/' in r else r 
                                         for r, _ in unique_repos))
        }
        
        if raw_score > 0:
            computed += 1

    # ========== Stage 3: Percentile Normalization & DB Update ==========
    # Calculate 99th percentile of log1p(raw_score)
    all_log_raws = [math.log1p(res['raw_score']) for res in server_raw_results.values() if res['raw_score'] > 0]
    
    if all_log_raws:
        sorted_log_raws = sorted(all_log_raws)
        # 99th percentile as the "1.0" benchmark
        q99_log_raw = max(sorted_log_raws[int(len(sorted_log_raws) * 0.99)], 1e-6)
    else:
        q99_log_raw = 1.0

    if progress:
        progress.update(score_task_id, description="[bold white]Finalizing scores...", advance=0)

    for server_name, res in server_raw_results.items():
        raw_score = res['raw_score']
        log_raw = math.log1p(raw_score)
        normalized = min(1.0, log_raw / q99_log_raw) if raw_score > 0 else 0.0
        
        # Store edges
        for edge in res['edges_to_store']:
            cursor.execute("""
                INSERT OR REPLACE INTO backlink_edges
                (server_name, referencer_repo, tier, tier_weight, repo_stars, 
                 repo_pushed_at, is_archived, is_fork, edge_score, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                edge['server_name'],
                edge['referencer_repo'],
                edge['tier'],
                edge['tier_weight'],
                edge['repo_stars'],
                edge['repo_pushed_at'],
                edge['is_archived'],
                edge['is_fork'],
                edge['edge_score'],
                datetime.now(timezone.utc).isoformat()
            ))
            
        # Store aggregated score
        cursor.execute("""
            INSERT OR REPLACE INTO backlink_scores
            (server_name, raw_score, normalized_score, tier1_contribution, 
             tier2_contribution, tier3_contribution, tier4_contribution, 
             unique_repos, computed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            server_name,
            raw_score,
            normalized,
            res['tier_contributions']['tier1'],
            res['tier_contributions']['tier2'],
            res['tier_contributions']['tier3'],
            res['tier_contributions']['tier4'],
            res['unique_repos_count'],
            datetime.now(timezone.utc).isoformat()
        ))
        
        if raw_score > 0:
            if progress:
                progress.console.print(f"  [bold white]Scored:[/bold white] {server_name}: raw={raw_score:.2f} → [bold green]normalized={normalized:.3f}[/bold green]")
            else:
                pass # Already printed in pass 1 if needed
    
    conn.commit()
    conn.close()
    if not progress:
        print(f"\n✓ Computed scores for {computed} servers with backlinks")
    elif score_task_id is not None:
        progress.update(score_task_id, visible=False)

# ==================== MARKETPLACE RANKING ====================

TRUSTED_ORGS = {
    'modelcontextprotocol', 'anthropic', 'google', 'openai', 'meta-llama', 
    'microsoft', 'facebook', 'docker', 'hashicorp', 'aws', 'cloudflare',
    'vercel', 'supabase', 'mongodb', 'pinecone', 'elastic'
}

def compute_market_rankings(db_path: Path = DATABASE_PATH, progress: Optional[Progress] = None):
    """
    Compute 0-1 Marketplace Rank for all servers using percentile-normalized pillars.
    """
    conn = get_connection(db_path)
    cursor = conn.cursor()
    
    if progress:
        task_id = progress.add_task("[bold gold1]Computing Marketplace Rankings...", total=None)
    else:
        print("\nComputing Marketplace Rankings...")
        task_id = None

    # 1. Fetch all raw signals
    cursor.execute("""
        SELECT 
            s.name,
            s.repository_url,
            COALESCE(bs.raw_score, 0) as usage_raw,
            COALESCE(gs.stars, 0) as stars,
            COALESCE(gs.forks, 0) as forks,
            gs.last_push,
            COALESCE(pd.downloads_last_week, 0) as downloads,
            (SELECT COUNT(*) FROM environment_variables ev WHERE ev.server_name = s.name AND ev.is_secret = 1) as auth_count,
            gs.repo_owner
        FROM servers s
        LEFT JOIN backlink_scores bs ON s.name = bs.server_name
        LEFT JOIN github_signals gs ON s.name = gs.server_name
        LEFT JOIN (
            SELECT server_name, SUM(downloads_last_week) as downloads_last_week
            FROM package_downloads
            GROUP BY server_name
        ) pd ON s.name = pd.server_name
    """)
    rows = cursor.fetchall()
    
    if progress:
        progress.update(task_id, total=len(rows))

    raw_data = []
    u_vals, r_vals, c_vals = [], [], []
    
    for r in rows:
        # Pillar 1: Usage (Backlinks)
        u_raw = math.log1p(r['usage_raw'])
        u_vals.append(u_raw)
        
        # Pillar 2: Reputation (Stars/Forks)
        # Note: using log10 per user suggestion
        rep_raw = math.log10(1 + r['stars']) + math.log10(1 + r['forks'])
        r_vals.append(rep_raw)
        
        # Pillar 3: Activity (Freshness) - Already bounded 0-1
        now = datetime.now(timezone.utc)
        pushed_at = r['last_push']
        if pushed_at:
            try:
                p_date = datetime.fromisoformat(pushed_at.replace('Z', '+00:00'))
                years_ago = (now - p_date).days / 365.0
                activity = math.exp(-0.5 * years_ago)
            except:
                activity = 0.5
        else:
            activity = 0.5
            
        # Pillar 4: Reach (Downloads)
        reach_raw = math.log10(1 + r['downloads'])
        c_vals.append(reach_raw)
        
        raw_data.append({
            'name': r['name'],
            'u_raw': u_raw,
            'r_raw': rep_raw,
            'activity': activity,
            'c_raw': reach_raw,
            'is_zero_auth': r['auth_count'] == 0,
            'is_verified': (r['repo_owner'] or '').lower() in TRUSTED_ORGS
        })

    # Calculate 99th percentiles for normalization
    def get_q99(vals):
        if not vals: return 1.0
        sorted_v = sorted(vals)
        return max(sorted_v[int(len(sorted_v) * 0.99)], 1e-6)

    q99_u = get_q99(u_vals)
    q99_r = get_q99(r_vals)
    q99_c = get_q99(c_vals)

    # 2. Normalize and compute final scores
    for d in raw_data:
        # Normalize pillars to [0, 1]
        u_norm = min(1.0, d['u_raw'] / q99_u)
        r_norm = min(1.0, d['r_raw'] / q99_r)
        a_norm = d['activity']
        c_norm = min(1.0, d['c_raw'] / q99_c)
        
        # Weighted sum: 0.45U + 0.30R + 0.15A + 0.10C
        composite = (0.45 * u_norm) + (0.30 * r_norm) + (0.15 * a_norm) + (0.10 * c_norm)
        
        # Additive bonuses
        if d['is_zero_auth']:
            composite += 0.05
        if d['is_verified']:
            composite += 0.10
            
        final_score = max(0.0, min(1.0, composite))
        
        cursor.execute("""
            INSERT OR REPLACE INTO market_rankings
            (server_name, total_score, usage_score, reputation_score, activity_score, reach_score, is_zero_auth, is_verified, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            d['name'],
            final_score,
            u_norm,
            r_norm,
            a_norm,
            c_norm,
            1 if d['is_zero_auth'] else 0,
            1 if d['is_verified'] else 0,
            datetime.now(timezone.utc).isoformat()
        ))
        
        if progress:
            progress.update(task_id, advance=1, description=f"[bold gold1]Ranking: {d['name']}")

    conn.commit()
    conn.close()
    
    if not progress:
        print("✓ Marketplace rankings computed.")
    elif task_id is not None:
        progress.update(task_id, visible=False)

# ==================== STATS ====================


def show_enrichment_stats(db_path: Path = DATABASE_PATH):
    """Show enrichment statistics."""
    conn = get_connection(db_path)
    cursor = conn.cursor()
    
    print("\n" + "=" * 60)
    print("📊 Enrichment Statistics")
    print("=" * 60)
    
    # GitHub
    cursor.execute("SELECT COUNT(*) as cnt FROM github_signals")
    gh_count = cursor.fetchone()['cnt']
    cursor.execute("SELECT SUM(stars) as total, MAX(stars) as max FROM github_signals")
    gh_stats = cursor.fetchone()
    print(f"\n⭐ GitHub Signals: {gh_count} servers")
    if gh_stats['total']:
        print(f"   Total stars: {gh_stats['total']:,}")
        print(f"   Max stars: {gh_stats['max']:,}")
    
    # Top starred
    cursor.execute("""
        SELECT server_name, stars, repo_owner, repo_name 
        FROM github_signals 
        ORDER BY stars DESC LIMIT 5
    """)
    top = cursor.fetchall()
    if top:
        print("   Top starred:")
        for r in top:
            print(f"     • {r['repo_owner']}/{r['repo_name']}: {r['stars']:,}⭐")
    
    # Package downloads
    cursor.execute("""
        SELECT registry_type, COUNT(*) as cnt, SUM(downloads_last_week) as weekly
        FROM package_downloads
        GROUP BY registry_type
    """)
    print(f"\n📦 Package Downloads:")
    for row in cursor.fetchall():
        weekly = row['weekly'] or 0
        print(f"   {row['registry_type']}: {row['cnt']} packages ({weekly:,}/week)")
    
    # Cross-listings
    cursor.execute("""
        SELECT registry_name, COUNT(*) as cnt 
        FROM cross_listings 
        GROUP BY registry_name
    """)
    print(f"\n🔗 Cross-Listings:")
    for row in cursor.fetchall():
        print(f"   {row['registry_name']}: {row['cnt']} servers")
    
    # Service costs
    cursor.execute("SELECT COUNT(*) as cnt FROM service_cost_hints WHERE requires_paid_service = 1")
    paid = cursor.fetchone()['cnt']
    cursor.execute("SELECT COUNT(*) as cnt FROM service_cost_hints WHERE free_tier_available = 1")
    free = cursor.fetchone()['cnt']
    print(f"\n💰 Service Costs:")
    print(f"   Requires paid service: {paid}")
    print(f"   Free tier available: {free}")
    
    # Dependency signals (libraries.io)
    try:
        cursor.execute("SELECT COUNT(*) as cnt, SUM(dependents_count) as total_deps FROM dependency_signals")
        dep_stats = cursor.fetchone()
        print(f"\n📊 Dependency Signals (libraries.io):")
        print(f"   Packages with data: {dep_stats['cnt']}")
        if dep_stats['total_deps']:
            print(f"   Total dependents: {dep_stats['total_deps']:,}")
        
        # Top depended-on packages
        cursor.execute("""
            SELECT package_name, platform, dependents_count, dependent_repos_count
            FROM dependency_signals 
            WHERE dependents_count > 0
            ORDER BY dependents_count DESC LIMIT 5
        """)
        top_deps = cursor.fetchall()
        if top_deps:
            print("   Most depended-on:")
            for d in top_deps:
                print(f"     • {d['package_name']}: {d['dependents_count']:,} packages, {d['dependent_repos_count']:,} repos")
    except:
        pass  # Table might not exist yet
    
    # Config file references (GitHub code search)
    try:
        cursor.execute("""
            SELECT config_type, COUNT(*) as cnt, SUM(reference_count) as total_refs
            FROM config_references
            WHERE reference_count > 0
            GROUP BY config_type
        """)
        print(f"\n📁 Config File References:")
        for row in cursor.fetchall():
            print(f"   {row['config_type']}: {row['cnt']} servers ({row['total_refs']:,} total refs)")
        
        # Top referenced servers
        cursor.execute("""
            SELECT server_name, SUM(reference_count) as total
            FROM config_references
            GROUP BY server_name
            ORDER BY total DESC LIMIT 5
        """)
        top_refs = cursor.fetchall()
        if top_refs:
            print("   Most referenced:")
            for r in top_refs:
                print(f"     • {r['server_name']}: {r['total']:,} refs")
    except:
        pass  # Table might not exist yet
    
    # Backlink scores
    try:
        cursor.execute("SELECT COUNT(*) as cnt FROM backlink_scores WHERE normalized_score > 0")
        score_count = cursor.fetchone()['cnt']
        cursor.execute("SELECT AVG(normalized_score) as avg, MAX(normalized_score) as max FROM backlink_scores WHERE normalized_score > 0")
        score_stats = cursor.fetchone()
        print(f"\n🎯 Backlink Scores:")
        print(f"   Servers with scores: {score_count}")
        if score_stats['avg']:
            print(f"   Average score: {score_stats['avg']:.3f}")
            print(f"   Max score: {score_stats['max']:.3f}")
        
        # Distribution
        cursor.execute("""
            SELECT 
                CASE 
                    WHEN normalized_score >= 0.8 THEN 'excellent (0.8+)'
                    WHEN normalized_score >= 0.5 THEN 'good (0.5-0.8)'
                    WHEN normalized_score >= 0.2 THEN 'moderate (0.2-0.5)'
                    ELSE 'low (<0.2)'
                END as tier,
                COUNT(*) as cnt
            FROM backlink_scores
            WHERE normalized_score > 0
            GROUP BY tier
            ORDER BY normalized_score DESC
        """)
        dist = cursor.fetchall()
        if dist:
            print("   Distribution:")
            for d in dist:
                print(f"     • {d['tier']}: {d['cnt']}")
        
        # Top scored servers
        cursor.execute("""
            SELECT server_name, normalized_score, raw_score
            FROM backlink_scores
            ORDER BY normalized_score DESC
            LIMIT 5
        """)
        top = cursor.fetchall()
        if top and top[0]['normalized_score'] > 0:
            print("   Top backlink scores:")
            for t in top:
                if t['normalized_score'] > 0:
                    print(f"     • {t['server_name']}: {t['normalized_score']:.3f} (raw: {t['raw_score']:.2f})")
    except:
        pass  # Table might not exist yet
    
    conn.close()


# ==================== MAIN ====================

def main():
    parser = argparse.ArgumentParser(description="MCP Server Enrichment")
    subparsers = parser.add_subparsers(dest="command", help="Available commands")
    
    # GitHub
    gh_parser = subparsers.add_parser("github", help="Enrich with GitHub data")
    gh_parser.add_argument("--db", type=str, default=str(DATABASE_PATH))
    gh_parser.add_argument("--token", type=str, help="GitHub token (or set GITHUB_TOKEN)")
    gh_parser.add_argument("--limit", type=int, default=None, help="Max records to process (default: all)")
    gh_parser.add_argument("--clean", action="store_true", help="Retry all including permanent failures")
    gh_parser.add_argument("--query", type=str, help="Filter servers by name")
    
    # NPM
    npm_parser = subparsers.add_parser("npm", help="Enrich with NPM downloads")
    npm_parser.add_argument("--db", type=str, default=str(DATABASE_PATH))
    npm_parser.add_argument("--limit", type=int, default=None, help="Max records to process (default: all)")
    npm_parser.add_argument("--clean", action="store_true", help="Retry all including permanent failures")
    npm_parser.add_argument("--query", type=str, help="Filter servers by name")
    
    # PyPI
    pypi_parser = subparsers.add_parser("pypi", help="Enrich with PyPI downloads")
    pypi_parser.add_argument("--db", type=str, default=str(DATABASE_PATH))
    pypi_parser.add_argument("--limit", type=int, default=None, help="Max records to process (default: all)")
    pypi_parser.add_argument("--clean", action="store_true", help="Retry all including permanent failures")
    pypi_parser.add_argument("--query", type=str, help="Filter servers by name")
    
    # Docker
    docker_parser = subparsers.add_parser("docker", help="Enrich with Docker pulls")
    docker_parser.add_argument("--db", type=str, default=str(DATABASE_PATH))
    docker_parser.add_argument("--limit", type=int, default=None, help="Max records to process (default: all)")
    docker_parser.add_argument("--clean", action="store_true", help="Retry all including permanent failures")
    docker_parser.add_argument("--query", type=str, help="Filter servers by name")
    
    # Glama
    glama_parser = subparsers.add_parser("glama", help="Cross-reference with Glama")
    glama_parser.add_argument("--db", type=str, default=str(DATABASE_PATH))
    glama_parser.add_argument("--query", type=str, help="Filter servers by name")
    
    # Service costs
    cost_parser = subparsers.add_parser("costs", help="Analyze service costs")
    cost_parser.add_argument("--db", type=str, default=str(DATABASE_PATH))
    cost_parser.add_argument("--query", type=str, help="Filter servers by name")
    
    # Dependents (libraries.io)
    deps_parser = subparsers.add_parser("dependents", help="Enrich with library dependency counts")
    deps_parser.add_argument("--db", type=str, default=str(DATABASE_PATH))
    deps_parser.add_argument("--api-key", type=str, help="Libraries.io API key (or set LIBRARIES_IO_API_KEY)")
    deps_parser.add_argument("--limit", type=int, default=None, help="Max records to process (default: all)")
    deps_parser.add_argument("--clean", action="store_true", help="Retry all including permanent failures")
    deps_parser.add_argument("--query", type=str, help="Filter servers by name")
    
    # Config refs (GitHub code search)
    config_parser = subparsers.add_parser("config-refs", help="Find config file references on GitHub")
    config_parser.add_argument("--db", type=str, default=str(DATABASE_PATH))
    config_parser.add_argument("--token", type=str, help="GitHub token (or set GITHUB_TOKEN)")
    config_parser.add_argument("--limit", type=int, default=None, help="Max records to process (default: all)")
    config_parser.add_argument("--clean", action="store_true", help="Retry all including permanent failures")
    config_parser.add_argument("--query", type=str, help="Filter servers by name")
    
    # Compute backlink scores
    score_parser = subparsers.add_parser("compute-scores", help="Compute weighted backlink scores")
    score_parser.add_argument("--db", type=str, default=str(DATABASE_PATH))
    score_parser.add_argument("--token", type=str, help="GitHub token for repo metadata")
    score_parser.add_argument("--query", type=str, help="Filter servers by name")
    
    # Compute market rankings
    rank_parser = subparsers.add_parser("compute-market-rankings", help="Compute final 0-1 marketplace ranks")
    rank_parser.add_argument("--db", type=str, default=str(DATABASE_PATH))
    
    # Build search index
    build_parser = subparsers.add_parser("build-index", help="Build FTS and Vector search index")
    build_parser.add_argument("--db", type=str, default=str(DATABASE_PATH))
    
    # Search
    search_parser = subparsers.add_parser("search", help="Search tools using hybrid relevance (CLI view)")
    search_parser.add_argument("query", type=str, help="Search query")
    search_parser.add_argument("--db", type=str, default=str(DATABASE_PATH))
    search_parser.add_argument("--limit", type=int, default=10, help="Number of results")
    
    # Retrieve
    retrieve_parser = subparsers.add_parser("retrieve", help="Discover tools with full metadata (JSON)")
    retrieve_parser.add_argument("query", type=str, help="Search query")
    retrieve_parser.add_argument("--page", type=int, default=1, help="Page number")
    retrieve_parser.add_argument("--limit", type=int, default=5, help="Results per page")
    retrieve_parser.add_argument("--db", type=str, default=str(DATABASE_PATH))
    
    # All
    all_parser = subparsers.add_parser("all", help="Run all enrichments")
    all_parser.add_argument("--db", type=str, default=str(DATABASE_PATH))
    all_parser.add_argument("--limit", type=int, default=None, help="Max records per enrichment (default: all)")
    all_parser.add_argument("--clean", action="store_true", help="Retry all including permanent failures")
    all_parser.add_argument("--query", type=str, help="Filter servers by name")
    
    # Stats
    stats_parser = subparsers.add_parser("stats", help="Show enrichment stats")
    stats_parser.add_argument("--db", type=str, default=str(DATABASE_PATH))
    
    args = parser.parse_args()
    
    # Initialize rich progress
    progress = Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        MofNCompleteColumn(),
        TextColumn("[progress.percentage]{task.percentage:>3.0f}%"),
        TimeRemainingColumn(),
        console=Console(),
    )
    
    if args.command == "github":
        with progress:
            enrich_github(Path(args.db), args.token, args.limit, skip_failures=not args.clean, progress=progress, query=args.query)
    elif args.command == "npm":
        with progress:
            enrich_npm(Path(args.db), args.limit, skip_failures=not args.clean, progress=progress, query=args.query)
    elif args.command == "pypi":
        with progress:
            enrich_pypi(Path(args.db), args.limit, skip_failures=not args.clean, progress=progress, query=args.query)
    elif args.command == "docker":
        with progress:
            enrich_docker(Path(args.db), args.limit, skip_failures=not args.clean, progress=progress, query=args.query)
    elif args.command == "glama":
        with progress:
            enrich_glama(Path(args.db), progress=progress, query=args.query)
    elif args.command == "costs":
        with progress:
            analyze_service_costs(Path(args.db), progress=progress, query=args.query)
    elif args.command == "dependents":
        with progress:
            enrich_dependents(Path(args.db), args.api_key, args.limit, skip_failures=not args.clean, progress=progress, query=args.query)
    elif args.command == "config-refs":
        with progress:
            enrich_config_refs(Path(args.db), args.token, args.limit, skip_failures=not args.clean, progress=progress, query=args.query)
    elif args.command == "compute-scores":
        with progress:
            compute_backlink_scores(Path(args.db), args.token, progress=progress, query=args.query)
    elif args.command == "compute-market-rankings":
        with progress:
            compute_market_rankings(Path(args.db), progress=progress)
    elif args.command == "build-index":
        init_database(Path(args.db), load_vec=True)
        engine = RelevanceEngine(Path(args.db))
        with progress:
            engine.build_search_index(progress)
            engine.update_embeddings(progress)
    elif args.command == "search":
        engine = RelevanceEngine(Path(args.db))
        results = engine.hybrid_search(args.query, limit=args.limit or 10)
        print(f"\nSearch results for: '{args.query}'")
        for i, r in enumerate(results):
            print(f"{i+1}. {r['tool_name']} ({r['server_name']}) - Score: {r['final_score']:.3f} [Rel: {r['relevance']:.3f}, Qual: {r['quality']:.3f}]")
            print(f"   {r['description'][:120]}...")
    elif args.command == "retrieve":
        retriever = Retriever(Path(args.db))
        output = retriever.retrieve(args.query, page=args.page, limit=args.limit)
        print(json.dumps(output, indent=2))
    elif args.command == "all":
        db = Path(args.db)
        skip = not args.clean
        with progress:
            enrich_github(db, limit=args.limit, skip_failures=skip, progress=progress, query=args.query)
            enrich_npm(db, limit=args.limit, skip_failures=skip, progress=progress, query=args.query)
            enrich_pypi(db, limit=args.limit, skip_failures=skip, progress=progress, query=args.query)
            enrich_docker(db, limit=args.limit, skip_failures=skip, progress=progress, query=args.query)
            enrich_glama(db, progress=progress, query=args.query)
            analyze_service_costs(db, progress=progress, query=args.query)
            enrich_dependents(db, limit=args.limit, skip_failures=skip, progress=progress, query=args.query)
            # Note: config-refs and compute-scores not in 'all' due to rate limit usage
        show_enrichment_stats(db)
    elif args.command == "stats":
        show_enrichment_stats(Path(args.db))
    else:
        parser.print_help()
        print("\nWorkflow:")
        print("  1. python extract.py              # Extract from MCP Registry")
        print("  2. python enrich.py all           # Run all enrichments")
        print("  3. python enrich.py stats         # View enrichment stats")


if __name__ == "__main__":
    main()
