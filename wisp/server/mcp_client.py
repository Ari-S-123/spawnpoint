#!/usr/bin/env python3
"""
MCP Client for Connecting to Servers and Fetching Tool Definitions

Supports both:
1. Stdio transport (local packages via npx, uvx, docker)
2. Streamable HTTP transport (remote servers)

Uses the official MCP Python SDK for proper protocol compliance.
"""

import asyncio
import json
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any, List, Tuple
import argparse
from dotenv import load_dotenv

# Load environment variables from .env in the same directory
load_dotenv(dotenv_path=Path(__file__).parent / ".env")

# Check for MCP SDK
try:
    from mcp import ClientSession
    from mcp.client.stdio import stdio_client, StdioServerParameters
    from mcp.client.streamable_http import streamable_http_client
    MCP_SDK_AVAILABLE = True
except ImportError:
    MCP_SDK_AVAILABLE = False
    print("Warning: MCP SDK not installed. Install with: pip install mcp")

from db import DATABASE_PATH, get_connection, init_database


def save_tools(conn, server_name: str, tools: List[Dict]):
    """Save extracted tools to database."""
    cursor = conn.cursor()
    
    for tool in tools:
        tool_name = tool.get('name', '')
        title = tool.get('title', '')
        description = tool.get('description', '')
        input_schema = json.dumps(tool.get('inputSchema', {}))
        output_schema = json.dumps(tool.get('outputSchema', {})) if tool.get('outputSchema') else None
        
        cursor.execute("""
            INSERT OR REPLACE INTO tools 
            (server_name, tool_name, title, description, input_schema, output_schema, extracted_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            server_name,
            tool_name,
            title,
            description,
            input_schema,
            output_schema,
            datetime.utcnow().isoformat()
        ))
        
        # Extract and save parameters
        schema = tool.get('inputSchema', {})
        properties = schema.get('properties', {})
        required = schema.get('required', [])
        
        # Clear existing parameters for this tool
        cursor.execute(
            "DELETE FROM tool_parameters WHERE server_name = ? AND tool_name = ?",
            (server_name, tool_name)
        )
        
        for param_name, param_info in properties.items():
            cursor.execute("""
                INSERT INTO tool_parameters 
                (server_name, tool_name, param_name, param_type, description, 
                 is_required, default_value, enum_values)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                server_name,
                tool_name,
                param_name,
                param_info.get('type', ''),
                param_info.get('description', ''),
                param_name in required,
                json.dumps(param_info.get('default')) if 'default' in param_info else None,
                json.dumps(param_info.get('enum')) if 'enum' in param_info else None
            ))
    
    conn.commit()


def save_resources(conn, server_name: str, resources: List[Dict]):
    """Save extracted resources to database."""
    cursor = conn.cursor()
    
    for resource in resources:
        cursor.execute("""
            INSERT OR REPLACE INTO resources 
            (server_name, uri, name, description, mime_type, extracted_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (
            server_name,
            str(resource.get('uri', '')),
            resource.get('name', ''),
            resource.get('description', ''),
            resource.get('mimeType', ''),
            datetime.utcnow().isoformat()
        ))
    
    conn.commit()


def save_prompts(conn, server_name: str, prompts: List[Dict]):
    """Save extracted prompts to database."""
    cursor = conn.cursor()
    
    for prompt in prompts:
        cursor.execute("""
            INSERT OR REPLACE INTO prompts 
            (server_name, prompt_name, description, arguments_json, extracted_at)
            VALUES (?, ?, ?, ?, ?)
        """, (
            server_name,
            prompt.get('name', ''),
            prompt.get('description', ''),
            json.dumps(prompt.get('arguments', [])),
            datetime.utcnow().isoformat()
        ))
    
    conn.commit()


def log_connection(
    conn, 
    server_name: str, 
    connection_type: str,
    url_or_command: str,
    success: bool,
    error_message: Optional[str] = None,
    tools_count: int = 0,
    resources_count: int = 0,
    prompts_count: int = 0
):
    """Log a connection attempt."""
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO connection_log 
        (server_name, connection_type, url_or_command, success, error_message, 
         tools_count, resources_count, prompts_count, attempted_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        server_name,
        connection_type,
        url_or_command,
        success,
        error_message,
        tools_count,
        resources_count,
        prompts_count,
        datetime.utcnow().isoformat()
    ))
    conn.commit()


def categorize_failure(error_message: str) -> Tuple[str, str]:
    """
    Categorize an error message into failure type.
    
    Returns: (failure_category, failure_reason)
    
    Categories:
    - permanent: Won't ever succeed (package not found, invalid URL, etc.)
    - transient: Might succeed later (timeout, connection refused, rate limit, etc.)
    - auth_required: Needs authentication (401/403)
    """
    if not error_message:
        return "unknown", "no error message"
    
    error_lower = error_message.lower()
    
    # Permanent failures - don't retry
    permanent_patterns = [
        ("not found", "package_not_found"),
        ("404", "http_404"),
        ("could not determine executable", "no_executable"),
        ("no such file or directory", "file_not_found"),
        ("package not found", "package_not_found"),
        ("module not found", "module_not_found"),
        ("registry error", "registry_error"),
        ("invalid url", "invalid_url"),
    ]
    
    for pattern, reason in permanent_patterns:
        if pattern in error_lower:
            return "permanent", reason
    
    # Auth required - might work with auth later
    auth_patterns = [
        ("401", "http_401"),
        ("403", "http_403"),
        ("unauthorized", "unauthorized"),
        ("forbidden", "forbidden"),
        ("authentication required", "auth_required"),
    ]
    
    for pattern, reason in auth_patterns:
        if pattern in error_lower:
            return "auth_required", reason
    
    # Docker/container issues - environment specific
    docker_patterns = [
        ("docker", "docker_not_running"),
        ("container", "container_error"),
        ("daemon", "daemon_not_running"),
    ]
    
    for pattern, reason in docker_patterns:
        if pattern in error_lower:
            return "permanent", reason  # Mark as permanent since Docker isn't set up
    
    # Everything else is transient - retry later
    transient_patterns = [
        ("timeout", "timeout"),
        ("timed out", "timeout"),
        ("connection refused", "connection_refused"),
        ("connection reset", "connection_reset"),
        ("rate limit", "rate_limited"),
        ("500", "http_500"),
        ("502", "http_502"),
        ("503", "http_503"),
        ("504", "http_504"),
        ("server error", "server_error"),
    ]
    
    for pattern, reason in transient_patterns:
        if pattern in error_lower:
            return "transient", reason
    
    # MCP SDK / protocol errors - server implementation is broken, treat as permanent
    protocol_errors = [
        ("taskgroup", "mcp_protocol_error"),
        ("sub-exception", "mcp_protocol_error"),
        ("unhandled errors", "mcp_protocol_error"),
        ("too many values to unpack", "mcp_response_error"),
        ("cannot unpack", "mcp_response_error"),
        ("not enough values", "mcp_response_error"),
        ("unexpected keyword argument", "mcp_sdk_error"),
        ("type error", "mcp_type_error"),
        ("attribute error", "mcp_attribute_error"),
        ("json decode", "mcp_invalid_response"),
        ("invalid json", "mcp_invalid_response"),
    ]
    
    for pattern, reason in protocol_errors:
        if pattern in error_lower:
            return "permanent", reason  # Server is broken, won't fix itself
    
    # Default to transient for truly unknown errors
    return "transient", "unknown_error"


def update_extraction_status(
    conn,
    server_name: str,
    success: bool,
    connection_method: str,
    error_message: Optional[str] = None,
    tools_count: int = 0,
    resources_count: int = 0,
    prompts_count: int = 0
):
    """
    Update the extraction status for a server.
    This is the single source of truth for whether we should retry a server.
    """
    cursor = conn.cursor()
    now = datetime.utcnow().isoformat()
    
    if success:
        cursor.execute("""
            INSERT INTO tool_extraction_status 
            (server_name, status, failure_category, failure_reason, 
             tools_count, resources_count, prompts_count, connection_method,
             last_attempted_at, last_successful_at, retry_count)
            VALUES (?, 'success', NULL, NULL, ?, ?, ?, ?, ?, ?, 0)
            ON CONFLICT(server_name) DO UPDATE SET
                status = 'success',
                failure_category = NULL,
                failure_reason = NULL,
                tools_count = excluded.tools_count,
                resources_count = excluded.resources_count,
                prompts_count = excluded.prompts_count,
                connection_method = excluded.connection_method,
                last_attempted_at = excluded.last_attempted_at,
                last_successful_at = excluded.last_successful_at,
                retry_count = 0
        """, (server_name, tools_count, resources_count, prompts_count, 
              connection_method, now, now))
    else:
        failure_category, failure_reason = categorize_failure(error_message)
        status = 'permanent_failure' if failure_category == 'permanent' else 'transient_failure'
        
        cursor.execute("""
            INSERT INTO tool_extraction_status 
            (server_name, status, failure_category, failure_reason, 
             tools_count, resources_count, prompts_count, connection_method,
             last_attempted_at, last_successful_at, retry_count)
            VALUES (?, ?, ?, ?, 0, 0, 0, ?, ?, NULL, 1)
            ON CONFLICT(server_name) DO UPDATE SET
                status = excluded.status,
                failure_category = excluded.failure_category,
                failure_reason = excluded.failure_reason,
                connection_method = excluded.connection_method,
                last_attempted_at = excluded.last_attempted_at,
                retry_count = tool_extraction_status.retry_count + 1
        """, (server_name, status, failure_category, failure_reason, 
              connection_method, now))
    
    conn.commit()


# ==================== ASYNC MCP CLIENT FUNCTIONS ====================

async def fetch_from_stdio(
    server_name: str,
    command: str,
    args: List[str],
    env: Optional[Dict[str, str]] = None,
    timeout: int = 30,
    cwd: Optional[str] = None
) -> Tuple[List[Dict], List[Dict], List[Dict], Optional[str]]:
    """
    Connect to a local MCP server via stdio and fetch tools/resources/prompts.
    
    Returns: (tools, resources, prompts, error_message)
    """
    if not MCP_SDK_AVAILABLE:
        return [], [], [], "MCP SDK not installed"
    
    try:
        # Merge provided env with current process environment
        full_env = os.environ.copy()
        if env:
            full_env.update(env)
            
        server_params = StdioServerParameters(
            command=command,
            args=args,
            env=full_env,
            cwd=cwd
        )
        
        async with stdio_client(server_params) as (read, write):
            async with ClientSession(read, write) as session:
                # Initialize the connection
                await asyncio.wait_for(session.initialize(), timeout=timeout)
                
                # Fetch tools
                tools_result = await asyncio.wait_for(session.list_tools(), timeout=timeout)
                tools = [t.model_dump() for t in tools_result.tools] if tools_result.tools else []
                
                # Fetch resources
                try:
                    resources_result = await asyncio.wait_for(session.list_resources(), timeout=timeout)
                    resources = [r.model_dump() for r in resources_result.resources] if resources_result.resources else []
                except Exception:
                    resources = []
                
                # Fetch prompts
                try:
                    prompts_result = await asyncio.wait_for(session.list_prompts(), timeout=timeout)
                    prompts = [p.model_dump() for p in prompts_result.prompts] if prompts_result.prompts else []
                except Exception:
                    prompts = []
                
                return tools, resources, prompts, None
                
    except asyncio.TimeoutError:
        return [], [], [], f"Connection timed out after {timeout}s"
    except Exception as e:
        return [], [], [], str(e)


async def fetch_from_http(
    server_name: str,
    url: str,
    headers: Optional[Dict[str, str]] = None,
    timeout: int = 30
) -> Tuple[List[Dict], List[Dict], List[Dict], Optional[str]]:
    """
    Connect to a remote MCP server via streamable HTTP and fetch tools/resources/prompts.
    
    Returns: (tools, resources, prompts, error_message)
    """
    if not MCP_SDK_AVAILABLE:
        return [], [], [], "MCP SDK not installed"
    
    try:
        import httpx
        
        # Create custom httpx client with headers if provided
        http_client = None
        if headers:
            http_client = httpx.AsyncClient(headers=headers)
        
        async with streamable_http_client(url, http_client=http_client) as (read, write, _):
            async with ClientSession(read, write) as session:
                # Initialize the connection
                await asyncio.wait_for(session.initialize(), timeout=timeout)
                
                # Fetch tools
                tools_result = await asyncio.wait_for(session.list_tools(), timeout=timeout)
                tools = [t.model_dump() for t in tools_result.tools] if tools_result.tools else []
                
                # Fetch resources
                try:
                    resources_result = await asyncio.wait_for(session.list_resources(), timeout=timeout)
                    resources = [r.model_dump() for r in resources_result.resources] if resources_result.resources else []
                except Exception:
                    resources = []
                
                # Fetch prompts
                try:
                    prompts_result = await asyncio.wait_for(session.list_prompts(), timeout=timeout)
                    prompts = [p.model_dump() for p in prompts_result.prompts] if prompts_result.prompts else []
                except Exception:
                    prompts = []
                
                return tools, resources, prompts, None
                
    except asyncio.TimeoutError:
        return [], [], [], f"Connection timed out after {timeout}s"
    except Exception as e:
        return [], [], [], str(e)


# ==================== EXTRACTION FUNCTIONS ====================

def get_connectable_servers(
    conn, 
    skip_auth: bool = True, 
    skip_extracted: bool = True,
    query: Optional[str] = None
) -> List[Dict]:
    """
    Get list of servers that can potentially be connected to.
    
    Args:
        skip_auth: If True, skip servers that require authentication (env vars marked as secret)
        skip_extracted: If True, skip servers already successfully extracted or with permanent failures
    
    Returns servers with either:
    - Remote HTTP/SSE endpoints
    - Stdio packages (npm, pypi, docker)
    """
    cursor = conn.cursor()
    
    # Get servers to skip based on extraction status
    already_extracted = set()
    permanent_failures = set()
    
    if skip_extracted:
        # Skip successful extractions (have tools)
        cursor.execute("""
            SELECT DISTINCT server_name FROM tools
        """)
        already_extracted = {row['server_name'] for row in cursor.fetchall()}
        
        # Skip permanent failures (won't ever succeed)
        cursor.execute("""
            SELECT server_name FROM tool_extraction_status 
            WHERE status = 'permanent_failure'
        """)
        permanent_failures = {row['server_name'] for row in cursor.fetchall()}
        
        if already_extracted:
            print(f"  Skipping {len(already_extracted)} servers with existing tools")
        if permanent_failures:
            print(f"  Skipping {len(permanent_failures)} servers with permanent failures")
    
    skip_set = already_extracted | permanent_failures
    
    servers = []
    
    # Get servers with remote endpoints
    cursor.execute("""
        SELECT DISTINCT 
            s.name,
            sr.transport_type,
            sr.url,
            sr.headers_json,
            'remote' as connection_method
        FROM servers s
        JOIN server_remotes sr ON s.name = sr.server_name
        WHERE sr.url IS NOT NULL AND sr.url != ''
    """)
    
    for row in cursor.fetchall():
        server_name = row['name']
        
        # Skip already extracted or permanent failures
        if server_name in skip_set:
            continue
        
        # Check if requires auth - add flag but don't skip
        cursor.execute("""
            SELECT COUNT(*) as cnt FROM environment_variables 
            WHERE server_name = ? AND is_secret = 1
        """, (server_name,))
        requires_auth = cursor.fetchone()['cnt'] > 0
        
        if skip_auth and requires_auth:
            continue
        
        server_dict = dict(row)
        server_dict['requires_auth'] = requires_auth
        servers.append(server_dict)
    
    # Get servers with stdio packages
    cursor.execute("""
        SELECT DISTINCT 
            s.name,
            sp.registry_type,
            sp.identifier,
            sp.version,
            sp.runtime_hint,
            sp.transport_type,
            'stdio' as connection_method
        FROM servers s
        JOIN server_packages sp ON s.name = sp.server_name
        WHERE sp.transport_type = 'stdio'
    """)
    
    for row in cursor.fetchall():
        server_name = row['name']
        
        # Skip already extracted or permanent failures
        if server_name in skip_set:
            continue
            
        if skip_auth:
            cursor.execute("""
                SELECT COUNT(*) as cnt FROM environment_variables 
                WHERE server_name = ? AND is_secret = 1
            """, (server_name,))
            if cursor.fetchone()['cnt'] > 0:
                continue
        
        servers.append(dict(row))
    
    # Get servers with local source paths
    cursor.execute("""
        SELECT DISTINCT 
            s.name,
            sls.command,
            sls.args_json,
            sls.working_dir,
            sls.env_json,
            'local' as connection_method
        FROM servers s
        JOIN server_local_sources sls ON s.name = sls.server_name
    """)
    
    for row in cursor.fetchall():
        server_name = row['name']
        
        # Skip already extracted or permanent failures
        if server_name in skip_set:
            continue
        
        servers.append(dict(row))
    
    # Apply query filter if provided
    if query:
        query = query.lower()
        servers = [s for s in servers if query in s['name'].lower()]
        
    return servers


def build_stdio_command(server: Dict) -> Tuple[str, List[str]]:
    """Build the command and args for a stdio server based on registry type."""
    registry = server.get('registry_type', '')
    identifier = server.get('identifier', '')
    runtime_hint = server.get('runtime_hint', '')
    
    if runtime_hint:
        # Use the provided runtime hint
        return runtime_hint, [identifier]
    
    if registry == 'npm':
        return 'npx', ['-y', '--quiet', identifier]
    elif registry == 'pypi':
        return 'uvx', ['--quiet', identifier]
    elif registry == 'oci':
        return 'docker', ['run', '--rm', '-i', identifier]
    else:
        # Unknown, try npx
        return 'npx', ['-y', '--quiet', identifier]


import re

def resolve_env_vars(data: Any) -> Any:
    """Recursively resolve 'ENV:VAR_NAME', '${VAR_NAME}', or '${input:VAR_NAME}' strings."""
    if isinstance(data, dict):
        return {k: resolve_env_vars(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [resolve_env_vars(i) for i in data]
    elif isinstance(data, str):
        # Handle ENV:VAR_NAME
        if data.startswith("ENV:"):
            return os.environ.get(data[4:], data)
            
        # Handle ${input:VAR_NAME} or ${VAR_NAME}
        # Regular expression for ${...}
        pattern = r'\${(?:input:)?([^}]+)}'
        
        def replace_match(match):
            var_name = match.group(1)
            val = os.environ.get(var_name)
            if val is not None:
                return val
            return match.group(0) # Keep original if not found
            
        return re.sub(pattern, replace_match, data)
        
    return data


async def extract_from_server(
    conn,
    server: Dict,
    timeout: int = 30
) -> bool:
    """
    Attempt to extract tools/resources/prompts from a single server.
    Returns True if successful.
    """
    server_name = server['name']
    connection_method = server.get('connection_method', '')
    
    tools, resources, prompts, error = [], [], [], None
    url_or_command = ""
    
    if connection_method == 'remote':
        url = server.get('url', '')
        url_or_command = url
        transport_type = server.get('transport_type', 'streamable-http')
        
        headers = None
        if server.get('headers_json'):
            headers = json.loads(server['headers_json'])
            headers = resolve_env_vars(headers)
        
        print(f"  Connecting to {server_name} via {transport_type}...")
        tools, resources, prompts, error = await fetch_from_http(
            server_name, url, headers=headers, timeout=timeout
        )
        
    elif connection_method == 'stdio':
        command, args = build_stdio_command(server)
        url_or_command = f"{command} {' '.join(args)}"
        
        print(f"  Starting {server_name} via {command}...")
        tools, resources, prompts, error = await fetch_from_stdio(
            server_name, command, args, timeout=timeout
        )
    
    elif connection_method == 'local':
        # Local source - run from cloned repo
        command = server.get('command', 'node')
        args_json = server.get('args_json', '[]')
        args = json.loads(args_json) if args_json else []
        working_dir = server.get('working_dir')
        env_json = server.get('env_json', '{}')
        env = json.loads(env_json) if env_json else {}
        env = resolve_env_vars(env)
        
        url_or_command = f"{command} {' '.join(args)}"
        
        print(f"  Starting {server_name} via local source ({command})...")
        tools, resources, prompts, error = await fetch_from_stdio(
            server_name, command, args, timeout=timeout, cwd=working_dir, env=env
        )
    
    # Log the connection attempt
    success = error is None and (len(tools) > 0 or len(resources) > 0 or len(prompts) > 0)
    log_connection(
        conn,
        server_name,
        connection_method,
        url_or_command,
        success,
        error,
        len(tools),
        len(resources),
        len(prompts)
    )
    
    # Update extraction status (used for skip logic)
    update_extraction_status(
        conn,
        server_name,
        success,
        connection_method,
        error,
        len(tools),
        len(resources),
        len(prompts)
    )
    
    if success:
        save_tools(conn, server_name, tools)
        save_resources(conn, server_name, resources)
        save_prompts(conn, server_name, prompts)
        print(f"  ✓ {server_name}: {len(tools)} tools, {len(resources)} resources, {len(prompts)} prompts")
        return True
    else:
        print(f"  ✗ {server_name}: {error or 'No data returned'}")
        return False


async def extract_all_tools(
    db_path: Path = DATABASE_PATH,
    max_servers: int = 50,
    remote_only: bool = True,
    skip_auth: bool = True,
    skip_extracted: bool = True,
    timeout: int = 30,
    query: Optional[str] = None
):
    """
    Extract tools from all connectable servers.
    
    Args:
        db_path: Path to database
        max_servers: Maximum servers to try
        remote_only: Only try remote HTTP servers (faster, no local install)
        skip_auth: Skip servers that require authentication
        skip_extracted: Skip servers that already have tools in DB
        timeout: Connection timeout in seconds
    """
    conn = init_database(db_path)
    
    servers = get_connectable_servers(
        conn, 
        skip_auth=skip_auth, 
        skip_extracted=skip_extracted,
        query=query
    )
    
    if remote_only:
        servers = [s for s in servers if s.get('connection_method') == 'remote']
    
    servers = servers[:max_servers]
    
    print(f"\nAttempting to connect to {len(servers)} servers...")
    print("=" * 60)
    
    success_count = 0
    for server in servers:
        try:
            if await extract_from_server(conn, server, timeout=timeout):
                success_count += 1
        except Exception as e:
            print(f"  ✗ {server['name']}: Unexpected error - {e}")
    
    print("=" * 60)
    print(f"Successfully extracted from {success_count}/{len(servers)} servers")
    
    conn.close()


# ==================== STATS ====================

def show_extraction_stats(db_path: Path = DATABASE_PATH):
    """Show statistics about extracted tools/resources/prompts."""
    conn = get_connection(db_path)
    cursor = conn.cursor()
    
    print("\n" + "=" * 50)
    print("🔧 MCP Server Extraction Statistics")
    print("=" * 50)
    
    # Servers with tools
    cursor.execute("SELECT COUNT(DISTINCT server_name) as cnt FROM tools")
    print(f"\n📦 Servers with tools extracted: {cursor.fetchone()['cnt']}")
    
    # Total tools
    cursor.execute("SELECT COUNT(*) as cnt FROM tools")
    print(f"🔧 Total tools: {cursor.fetchone()['cnt']}")
    
    # Total resources
    cursor.execute("SELECT COUNT(*) as cnt FROM resources")
    print(f"📄 Total resources: {cursor.fetchone()['cnt']}")
    
    # Total prompts
    cursor.execute("SELECT COUNT(*) as cnt FROM prompts")
    print(f"💬 Total prompts: {cursor.fetchone()['cnt']}")
    
    # Connection stats
    cursor.execute("SELECT COUNT(*) as cnt FROM connection_log WHERE success = 1")
    successful = cursor.fetchone()['cnt']
    cursor.execute("SELECT COUNT(*) as cnt FROM connection_log WHERE success = 0")
    failed = cursor.fetchone()['cnt']
    print(f"\n📊 Connection attempts: {successful} successful, {failed} failed")
    
    # Top tools by server
    print("\n🏆 Top servers by tool count:")
    cursor.execute("""
        SELECT server_name, COUNT(*) as tool_count 
        FROM tools 
        GROUP BY server_name 
        ORDER BY tool_count DESC 
        LIMIT 10
    """)
    for row in cursor.fetchall():
        print(f"   • {row['server_name']}: {row['tool_count']} tools")
    
    conn.close()


def main():
    parser = argparse.ArgumentParser(description="MCP Client - Extract tools from MCP servers")
    subparsers = parser.add_subparsers(dest="command", help="Available commands")
    
    # Extract command
    extract_parser = subparsers.add_parser("extract", help="Extract tools from MCP servers")
    extract_parser.add_argument("--db", type=str, default=str(DATABASE_PATH), help="Database path")
    extract_parser.add_argument("--max", type=int, default=50, help="Max servers to try")
    extract_parser.add_argument("--timeout", type=int, default=30, help="Connection timeout")
    extract_parser.add_argument("--include-stdio", action="store_true", help="Also try stdio servers (requires npm/uvx/docker)")
    extract_parser.add_argument("--include-auth", action="store_true", help="Include servers requiring auth")
    
    # Single server command
    single_parser = subparsers.add_parser("single", help="Extract from a single server URL")
    single_parser.add_argument("url", type=str, help="Server URL")
    single_parser.add_argument("--name", type=str, default="manual", help="Server name to use")
    single_parser.add_argument("--db", type=str, default=str(DATABASE_PATH), help="Database path")
    
    # Stats command
    stats_parser = subparsers.add_parser("stats", help="Show extraction statistics")
    stats_parser.add_argument("--db", type=str, default=str(DATABASE_PATH), help="Database path")
    
    # List connectable
    list_parser = subparsers.add_parser("list", help="List connectable servers")
    list_parser.add_argument("--db", type=str, default=str(DATABASE_PATH), help="Database path")
    list_parser.add_argument("--include-auth", action="store_true", help="Include servers requiring auth")
    
    args = parser.parse_args()
    
    if args.command == "extract":
        if not MCP_SDK_AVAILABLE:
            print("Error: MCP SDK not installed. Install with: pip install mcp")
            sys.exit(1)
        asyncio.run(extract_all_tools(
            db_path=Path(args.db),
            max_servers=args.max,
            remote_only=not args.include_stdio,
            skip_auth=not args.include_auth,
            timeout=args.timeout
        ))
    elif args.command == "single":
        if not MCP_SDK_AVAILABLE:
            print("Error: MCP SDK not installed. Install with: pip install mcp")
            sys.exit(1)
        conn = init_database(Path(args.db))
        server = {
            'name': args.name,
            'url': args.url,
            'connection_method': 'remote',
            'transport_type': 'streamable-http'
        }
        asyncio.run(extract_from_server(conn, server))
        conn.close()
    elif args.command == "stats":
        show_extraction_stats(Path(args.db))
    elif args.command == "list":
        conn = get_connection(Path(args.db))
        servers = get_connectable_servers(conn, skip_auth=not args.include_auth)
        print(f"\nConnectable servers: {len(servers)}")
        for s in servers[:50]:
            method = s.get('connection_method', '')
            if method == 'remote':
                print(f"  🌐 {s['name']} → {s.get('url', '')}")
            else:
                print(f"  💻 {s['name']} → {s.get('registry_type', '')}:{s.get('identifier', '')}")
        conn.close()
    else:
        parser.print_help()
        print("\nWorkflow:")
        print("  1. python extract.py               # Extract servers from registry")
        print("  2. python mcp_client.py list       # See connectable servers")
        print("  3. python mcp_client.py extract    # Connect & extract tools")
        print("  4. python mcp_client.py stats      # View extraction stats")


if __name__ == "__main__":
    main()
