#!/usr/bin/env python3
"""
MCP Server Tool Extraction

Extracts tools, resources, and prompts from MCP servers and saves them to the database.
This is a simplified CLI wrapper around the mcp_client module.

Usage:
    python extract_tools.py                           # Extract from ALL servers (includes auth)
    python extract_tools.py --remote-only             # Only remote HTTP servers
    python extract_tools.py --local-only              # Only stdio (npm, pypi, docker)
    python extract_tools.py --limit 100               # Limit to 100 servers
    python extract_tools.py --clean                   # Re-extract all (ignore previous)
    python extract_tools.py --skip-auth               # Skip servers requiring auth
    python extract_tools.py --remote-only --limit 50  # Chain flags
    python extract_tools.py --clean --limit 100       # Re-extract first 100
    python extract_tools.py stats                     # Show extraction statistics
    python extract_tools.py list                      # List connectable servers
"""


import argparse
import asyncio
import sys
from pathlib import Path

# Import from mcp_client
try:
    from mcp_client import (
        MCP_SDK_AVAILABLE,
        extract_all_tools,
        show_extraction_stats,
        get_connectable_servers,
        extract_from_server,
        init_database
    )
    from db import DATABASE_PATH, get_connection
except ImportError as e:
    print(f"Error importing mcp_client: {e}")
    print("Make sure mcp_client.py is in the same directory.")
    sys.exit(1)


def list_servers(db_path: Path, include_auth: bool = False, show_all: bool = True):
    """List all connectable servers."""
    conn = get_connection(db_path)
    servers = get_connectable_servers(conn, skip_auth=not include_auth, skip_extracted=False)
    
    remote = [s for s in servers if s.get('connection_method') == 'remote']
    stdio = [s for s in servers if s.get('connection_method') == 'stdio']
    
    print(f"\n🌐 Remote servers: {len(remote)}")
    for s in remote[:20]:
        auth = "🔒" if s.get('requires_auth') else "🔓"
        url = s.get('url', '')[:50]
        print(f"   {auth} {s['name']}: {url}...")
    if len(remote) > 20:
        print(f"   ... and {len(remote) - 20} more")
    
    print(f"\n💻 Stdio servers: {len(stdio)}")
    for s in stdio[:10]:
        print(f"   • {s['name']}: {s.get('registry_type', '')}:{s.get('identifier', '')}")
    if len(stdio) > 10:
        print(f"   ... and {len(stdio) - 10} more")
    
    print(f"\n📊 Total: {len(servers)} connectable servers")
    conn.close()


async def run_extraction(
    db_path: Path,
    limit: int = None,
    remote_only: bool = False,
    local_only: bool = False,
    skip_auth: bool = False,
    skip_extracted: bool = True,
    timeout: int = 30,
    query: str = None
):
    """Run the extraction process."""
    if not MCP_SDK_AVAILABLE:
        print("Error: MCP SDK not installed.")
        print("Install with: pip install mcp")
        return
    
    # Determine max servers
    max_servers = limit if limit else 1000000  # Effectively unlimited
    
    # Determine server types
    if remote_only:
        include_stdio = False
        server_type = "Remote only"
    elif local_only:
        include_stdio = True  # Will filter after
        server_type = "Local (stdio) only"
    else:
        include_stdio = True
        server_type = "All (remote + stdio)"
    
    print(f"\n🔧 MCP Tool Extraction")
    print(f"=" * 50)
    print(f"Server types: {server_type}")
    print(f"Auth servers: {'Skipped' if skip_auth else 'Included'}")
    print(f"Skip already done: {'Yes' if skip_extracted else 'No (--clean)'}")
    print(f"Limit: {limit if limit else 'All'}")
    print(f"Timeout: {timeout}s")
    print(f"=" * 50)
    
    await extract_all_tools(
        db_path=db_path,
        max_servers=max_servers,
        remote_only=remote_only,
        skip_auth=skip_auth,
        skip_extracted=skip_extracted,
        timeout=timeout,
        query=query
    )


def main():
    parser = argparse.ArgumentParser(
        description="Extract tools from MCP servers",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python extract_tools.py                  # Extract from ALL servers (includes auth)
  python extract_tools.py --remote-only    # Only remote HTTP servers
  python extract_tools.py --local-only     # Only stdio (npm, pypi, docker)
  python extract_tools.py --limit 50       # Limit to 50 servers
  python extract_tools.py --clean          # Re-extract all (ignore previous)
  python extract_tools.py --skip-auth      # Skip servers requiring auth
  python extract_tools.py stats            # Show current extraction stats
  python extract_tools.py list             # List connectable servers
        """
    )
    
    # Subcommands for info
    subparsers = parser.add_subparsers(dest="command", help="Commands")
    
    # stats subcommand
    stats_parser = subparsers.add_parser("stats", help="Show extraction statistics")
    stats_parser.add_argument("--db", type=str, default=str(DATABASE_PATH),
                              help="Path to database file")
    
    # list subcommand
    list_parser = subparsers.add_parser("list", help="List connectable servers")
    list_parser.add_argument("--db", type=str, default=str(DATABASE_PATH),
                             help="Path to database file")
    list_parser.add_argument("--include-auth", action="store_true",
                             help="Include servers requiring authentication")
    
    # Main extraction options (when no subcommand)
    parser.add_argument("--db", type=str, default=str(DATABASE_PATH),
                        help="Path to database file")
    parser.add_argument("--limit", type=int, default=None,
                        help="Maximum servers to try (default: all)")
    parser.add_argument("--timeout", type=int, default=30,
                        help="Connection timeout in seconds (default: 30)")
    parser.add_argument("--query", type=str, default=None,
                        help="Filter servers by name (substring match)")
    
    # Server type options (mutually exclusive)
    type_group = parser.add_mutually_exclusive_group()
    type_group.add_argument("--remote-only", action="store_true",
                            help="Only try remote HTTP/SSE servers")
    type_group.add_argument("--local-only", action="store_true",
                            help="Only try local stdio servers (npm/pypi/docker)")
    
    # Other flags
    parser.add_argument("--skip-auth", action="store_true",
                        help="Skip servers that require authentication")
    parser.add_argument("--clean", action="store_true",
                        help="Re-extract all servers, ignoring previously extracted")
    
    args = parser.parse_args()
    db_path = Path(args.db)
    
    # Handle subcommands
    if args.command == "stats":
        show_extraction_stats(db_path)
        return
    
    if args.command == "list":
        list_servers(db_path, include_auth=args.include_auth)
        return
    
    # Run extraction (default command)
    asyncio.run(run_extraction(
        db_path=db_path,
        limit=args.limit,
        remote_only=args.remote_only,
        local_only=args.local_only,
        skip_auth=args.skip_auth,
        skip_extracted=not args.clean,
        timeout=args.timeout,
        query=args.query
    ))


if __name__ == "__main__":
    main()
