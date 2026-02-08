#!/usr/bin/env python3
"""
MCP Registry Data Visualizer & Stats

Query and visualize data from the extracted MCP Registry SQLite database.
Uses the shared db.py module.
"""

import json
import csv
from pathlib import Path
import argparse
from typing import Optional, Dict, Any, List

from db import DATABASE_PATH, get_connection


# ==================== STATS FUNCTIONS ====================

def get_stats(db_path: Path = DATABASE_PATH) -> Dict[str, Any]:
    """Get summary statistics from the database."""
    conn = get_connection(db_path)
    cursor = conn.cursor()
    
    stats = {}
    
    # Total servers
    cursor.execute("SELECT COUNT(*) as count FROM servers")
    stats["total_servers"] = cursor.fetchone()["count"]
    
    # By status
    cursor.execute("SELECT status, COUNT(*) as count FROM servers GROUP BY status")
    stats["by_status"] = {row["status"]: row["count"] for row in cursor.fetchall()}
    
    # By package/registry type
    cursor.execute("""
        SELECT registry_type, COUNT(DISTINCT server_name) as count 
        FROM server_packages 
        WHERE registry_type != ''
        GROUP BY registry_type
    """)
    stats["by_package_type"] = {row["registry_type"]: row["count"] for row in cursor.fetchall()}
    
    # By transport type
    cursor.execute("""
        SELECT transport_type, COUNT(DISTINCT server_name) as count 
        FROM server_packages 
        WHERE transport_type != ''
        GROUP BY transport_type
    """)
    stats["by_transport"] = {row["transport_type"]: row["count"] for row in cursor.fetchall()}
    
    # Servers with remotes
    cursor.execute("SELECT COUNT(DISTINCT server_name) as count FROM server_remotes")
    stats["with_remote_url"] = cursor.fetchone()["count"]
    
    # Servers requiring auth (has secret env vars)
    cursor.execute("""
        SELECT COUNT(DISTINCT server_name) as count 
        FROM environment_variables 
        WHERE is_secret = 1
    """)
    stats["requires_auth"] = cursor.fetchone()["count"]
    
    # Tools stats
    cursor.execute("SELECT COUNT(*) as count FROM tools")
    stats["total_tools"] = cursor.fetchone()["count"]
    
    cursor.execute("SELECT COUNT(DISTINCT server_name) as count FROM tools")
    stats["servers_with_tools"] = cursor.fetchone()["count"]
    
    # Resources stats
    cursor.execute("SELECT COUNT(*) as count FROM resources")
    stats["total_resources"] = cursor.fetchone()["count"]
    
    # Prompts stats
    cursor.execute("SELECT COUNT(*) as count FROM prompts")
    stats["total_prompts"] = cursor.fetchone()["count"]
    
    # Recently updated (last 30 days)
    cursor.execute("""
        SELECT COUNT(*) as count FROM servers 
        WHERE updated_at >= datetime('now', '-30 days')
    """)
    stats["updated_last_30_days"] = cursor.fetchone()["count"]
    
    # ==================== ENRICHMENT STATS ====================
    
    # GitHub signals
    try:
        cursor.execute("SELECT COUNT(*) as count FROM github_signals")
        stats["github_enriched"] = cursor.fetchone()["count"]
        
        cursor.execute("SELECT SUM(stars) as total FROM github_signals")
        stats["total_github_stars"] = cursor.fetchone()["total"] or 0
        
        cursor.execute("SELECT AVG(stars) as avg FROM github_signals WHERE stars > 0")
        result = cursor.fetchone()["avg"]
        stats["avg_github_stars"] = round(result, 1) if result else 0
    except:
        stats["github_enriched"] = 0
    
    # Package downloads
    try:
        cursor.execute("SELECT COUNT(*) as count FROM package_downloads")
        stats["download_stats"] = cursor.fetchone()["count"]
    except:
        stats["download_stats"] = 0
    
    # Backlink scores
    try:
        cursor.execute("SELECT COUNT(*) as count FROM backlink_scores WHERE normalized_score > 0")
        stats["servers_with_scores"] = cursor.fetchone()["count"]
        
        cursor.execute("SELECT MAX(normalized_score) as max FROM backlink_scores")
        result = cursor.fetchone()["max"]
        stats["max_backlink_score"] = round(result, 3) if result else 0
    except:
        stats["servers_with_scores"] = 0
    
    conn.close()
    return stats


def print_stats(stats: Dict[str, Any]):
    """Pretty print statistics."""
    print("\n" + "=" * 50)
    print("📊 MCP Registry Statistics")
    print("=" * 50)
    
    print(f"\n📦 Total Servers: {stats['total_servers']}")
    print(f"   • Requires Auth: {stats.get('requires_auth', 0)}")
    print(f"   • With Remote URL: {stats.get('with_remote_url', 0)}")
    
    print("\n📈 By Status:")
    for status, count in stats.get("by_status", {}).items():
        print(f"   • {status or 'unknown'}: {count}")
    
    print("\n📦 By Package Type:")
    for pkg_type, count in stats.get("by_package_type", {}).items():
        print(f"   • {pkg_type}: {count}")
    
    print("\n🚀 By Transport:")
    for transport, count in stats.get("by_transport", {}).items():
        print(f"   • {transport}: {count}")
    
    print(f"\n🔧 Extracted Data:")
    print(f"   • Tools: {stats.get('total_tools', 0)} (from {stats.get('servers_with_tools', 0)} servers)")
    print(f"   • Resources: {stats.get('total_resources', 0)}")
    print(f"   • Prompts: {stats.get('total_prompts', 0)}")
    
    # Enrichment stats
    if stats.get('github_enriched', 0) > 0:
        print(f"\n⭐ GitHub Enrichment:")
        print(f"   • Servers enriched: {stats.get('github_enriched', 0)}")
        print(f"   • Total stars: {stats.get('total_github_stars', 0):,}")
        print(f"   • Avg stars: {stats.get('avg_github_stars', 0):.1f}")
    
    if stats.get('download_stats', 0) > 0:
        print(f"\n📈 Package Downloads:")
        print(f"   • Packages tracked: {stats.get('download_stats', 0)}")
    
    if stats.get('servers_with_scores', 0) > 0:
        print(f"\n🎯 Backlink Scores:")
        print(f"   • Servers with scores: {stats.get('servers_with_scores', 0)}")
        print(f"   • Max score: {stats.get('max_backlink_score', 0):.3f}")
    
    print(f"\n🕐 Updated in last 30 days: {stats.get('updated_last_30_days', 0)}")
    print()


def top_servers(db_path: Path = DATABASE_PATH, metric: str = "stars", limit: int = 20) -> List[Dict]:
    """Get top servers by a specific metric."""
    conn = get_connection(db_path)
    cursor = conn.cursor()
    
    if metric == "stars":
        cursor.execute("""
            SELECT s.name, s.description, gs.stars, gs.forks, gs.open_issues
            FROM servers s
            JOIN github_signals gs ON s.name = gs.server_name
            WHERE gs.stars > 0
            ORDER BY gs.stars DESC
            LIMIT ?
        """, (limit,))
    elif metric == "score":
        cursor.execute("""
            SELECT s.name, s.description, bs.normalized_score as score, bs.raw_score
            FROM servers s
            JOIN backlink_scores bs ON s.name = bs.server_name
            WHERE bs.normalized_score > 0
            ORDER BY bs.normalized_score DESC
            LIMIT ?
        """, (limit,))
    elif metric == "downloads":
        cursor.execute("""
            SELECT s.name, s.description, pd.downloads_last_month, pd.registry_type
            FROM servers s
            JOIN package_downloads pd ON s.name = pd.server_name
            WHERE pd.downloads_last_month > 0
            ORDER BY pd.downloads_last_month DESC
            LIMIT ?
        """, (limit,))
    elif metric == "tools":
        cursor.execute("""
            SELECT s.name, s.description, COUNT(t.id) as tool_count
            FROM servers s
            JOIN tools t ON s.name = t.server_name
            GROUP BY s.name
            ORDER BY tool_count DESC
            LIMIT ?
        """, (limit,))
    else:
        cursor.execute("""
            SELECT s.name, s.description, s.updated_at
            FROM servers s
            ORDER BY s.updated_at DESC
            LIMIT ?
        """, (limit,))
    
    servers = [dict(s) for s in cursor.fetchall()]
    conn.close()
    return servers


def print_top_servers(servers: List[Dict], metric: str):
    """Pretty print top servers."""
    print("\n" + "=" * 70)
    print(f"🏆 Top Servers by {metric.title()}")
    print("=" * 70)
    
    for i, server in enumerate(servers, 1):
        name = server['name'][:40]
        if metric == "stars":
            value = f"⭐ {server.get('stars', 0):,}"
        elif metric == "score":
            value = f"🎯 {server.get('score', 0):.3f}"
        elif metric == "downloads":
            value = f"📈 {server.get('downloads_last_month', 0):,}/mo"
        elif metric == "tools":
            value = f"🔧 {server.get('tool_count', 0)} tools"
        else:
            value = server.get('updated_at', '')
        
        print(f"  {i:2}. {name:40} {value}")
    print()


# ==================== LIST FUNCTIONS ====================

def list_servers(db_path: Path = DATABASE_PATH, limit: int = 20, search: Optional[str] = None) -> List[Dict]:

    """List servers from the database."""
    conn = get_connection(db_path)
    cursor = conn.cursor()
    
    query = """
        SELECT s.name, s.description, s.status, s.updated_at, s.repository_url,
               (SELECT COUNT(*) FROM environment_variables ev 
                WHERE ev.server_name = s.name AND ev.is_secret = 1) as auth_vars,
               (SELECT COUNT(*) FROM tools t WHERE t.server_name = s.name) as tool_count
        FROM servers s
    """
    params = []
    
    if search:
        query += " WHERE s.name LIKE ? OR s.description LIKE ?"
        params = [f"%{search}%", f"%{search}%"]
    
    query += " ORDER BY s.updated_at DESC LIMIT ?"
    params.append(limit)
    
    cursor.execute(query, params)
    servers = [dict(s) for s in cursor.fetchall()]
    
    conn.close()
    return servers


def list_tools(db_path: Path = DATABASE_PATH, limit: int = 50, search: Optional[str] = None) -> List[Dict]:
    """List extracted tools from the database."""
    conn = get_connection(db_path)
    cursor = conn.cursor()
    
    query = """
        SELECT t.server_name, t.tool_name, t.title, t.description,
               (SELECT COUNT(*) FROM environment_variables ev 
                WHERE ev.server_name = t.server_name AND ev.is_secret = 1) > 0 as requires_auth
        FROM tools t
    """
    params = []
    
    if search:
        query += " WHERE t.tool_name LIKE ? OR t.description LIKE ?"
        params = [f"%{search}%", f"%{search}%"]
    
    query += " ORDER BY t.server_name, t.tool_name LIMIT ?"
    params.append(limit)
    
    cursor.execute(query, params)
    tools = [dict(t) for t in cursor.fetchall()]
    
    conn.close()
    return tools


def print_servers(servers: List[Dict]):
    """Pretty print server list."""
    print("\n" + "=" * 80)
    print("📋 MCP Servers")
    print("=" * 80)
    
    for server in servers:
        auth = "🔒" if server.get('auth_vars', 0) > 0 else "🔓"
        tools = f"[{server.get('tool_count', 0)} tools]" if server.get('tool_count', 0) > 0 else ""
        print(f"\n{auth} {server['name']} {tools}")
        if server.get('description'):
            desc = server['description'][:100] + "..." if len(server.get('description', '')) > 100 else server.get('description', '')
            print(f"   {desc}")
        print(f"   Status: {server.get('status', 'unknown')} | Updated: {server.get('updated_at', 'unknown')}")
    print()


def print_tools(tools: List[Dict]):
    """Pretty print tool list."""
    print("\n" + "=" * 80)
    print("🔧 MCP Tools")
    print("=" * 80)
    
    for tool in tools:
        auth = "🔒" if tool.get('requires_auth') else "🔓"
        title = f" ({tool['title']})" if tool.get('title') else ""
        print(f"\n{auth} {tool['server_name']} → {tool['tool_name']}{title}")
        if tool.get('description'):
            desc = tool['description'][:100] + "..." if len(tool.get('description', '')) > 100 else tool.get('description', '')
            print(f"   {desc}")
    print()


# ==================== DETAILS FUNCTIONS ====================

def get_server_details(db_path: Path, server_name: str) -> Optional[Dict]:
    """Get full details for a specific server."""
    conn = get_connection(db_path)
    cursor = conn.cursor()
    
    # Get server
    cursor.execute("SELECT * FROM servers WHERE name = ?", (server_name,))
    server = cursor.fetchone()
    if not server:
        conn.close()
        return None
    
    result = dict(server)
    result.pop('raw_json', None)  # Remove raw JSON for cleaner output
    
    # Get packages
    cursor.execute("SELECT * FROM server_packages WHERE server_name = ?", (server_name,))
    result["packages"] = [dict(p) for p in cursor.fetchall()]
    
    # Get remotes
    cursor.execute("SELECT * FROM server_remotes WHERE server_name = ?", (server_name,))
    result["remotes"] = [dict(r) for r in cursor.fetchall()]
    
    # Get environment variables
    cursor.execute("SELECT * FROM environment_variables WHERE server_name = ?", (server_name,))
    result["environment_variables"] = [dict(e) for e in cursor.fetchall()]
    
    # Get tools
    cursor.execute("SELECT * FROM tools WHERE server_name = ?", (server_name,))
    result["tools"] = [dict(t) for t in cursor.fetchall()]
    
    # Get resources
    cursor.execute("SELECT * FROM resources WHERE server_name = ?", (server_name,))
    result["resources"] = [dict(r) for r in cursor.fetchall()]
    
    # Get prompts
    cursor.execute("SELECT * FROM prompts WHERE server_name = ?", (server_name,))
    result["prompts"] = [dict(p) for p in cursor.fetchall()]
    
    # Get icons
    cursor.execute("SELECT * FROM server_icons WHERE server_name = ?", (server_name,))
    result["icons"] = [dict(i) for i in cursor.fetchall()]
    
    conn.close()
    return result


def get_tool_details(db_path: Path, tool_name: str) -> List[Dict]:
    """Get details for tools matching a name."""
    conn = get_connection(db_path)
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT t.*, s.description as server_description
        FROM tools t
        JOIN servers s ON t.server_name = s.name
        WHERE t.tool_name LIKE ?
    """, (f"%{tool_name}%",))
    
    tools = []
    for row in cursor.fetchall():
        tool = dict(row)
        
        # Get parameters
        cursor.execute("""
            SELECT * FROM tool_parameters 
            WHERE server_name = ? AND tool_name = ?
        """, (tool['server_name'], tool['tool_name']))
        tool['parameters'] = [dict(p) for p in cursor.fetchall()]
        
        tools.append(tool)
    
    conn.close()
    return tools


# ==================== EXPORT FUNCTIONS ====================

def export_to_csv(db_path: Path = DATABASE_PATH, output_path: Optional[Path] = None):
    """Export servers to CSV for external visualization tools."""
    if output_path is None:
        output_path = db_path.parent / "mcp_servers.csv"
    
    conn = get_connection(db_path)
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT 
            s.name, 
            s.description, 
            s.version,
            s.status, 
            s.is_latest,
            s.repository_url,
            s.published_at, 
            s.updated_at,
            GROUP_CONCAT(DISTINCT sp.registry_type) as package_types,
            (SELECT COUNT(*) FROM environment_variables ev 
             WHERE ev.server_name = s.name AND ev.is_secret = 1) as auth_vars,
            (SELECT COUNT(*) FROM tools t WHERE t.server_name = s.name) as tool_count
        FROM servers s
        LEFT JOIN server_packages sp ON s.name = sp.server_name
        GROUP BY s.name
        ORDER BY s.updated_at DESC
    """)
    
    rows = cursor.fetchall()
    
    with open(output_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow([
            'name', 'description', 'version', 'status', 'is_latest', 
            'repository_url', 'published_at', 'updated_at', 'package_types',
            'requires_auth', 'tool_count'
        ])
        for row in rows:
            writer.writerow([
                row['name'],
                row['description'],
                row['version'],
                row['status'],
                row['is_latest'],
                row['repository_url'],
                row['published_at'],
                row['updated_at'],
                row['package_types'],
                row['auth_vars'] > 0,
                row['tool_count']
            ])
    
    conn.close()
    print(f"✓ Exported {len(rows)} servers to {output_path}")


def export_to_json(db_path: Path = DATABASE_PATH, output_path: Optional[Path] = None):
    """Export all data to JSON for web visualization."""
    if output_path is None:
        output_path = db_path.parent / "mcp_data.json"
    
    conn = get_connection(db_path)
    cursor = conn.cursor()
    
    # Get all servers with their related data
    cursor.execute("SELECT * FROM servers ORDER BY updated_at DESC")
    servers = []
    
    for row in cursor.fetchall():
        server = dict(row)
        server_name = server['name']
        server.pop('raw_json', None)
        
        # Get packages
        cursor.execute("""
            SELECT registry_type, identifier, version, transport_type, transport_url 
            FROM server_packages WHERE server_name = ?
        """, (server_name,))
        server['packages'] = [dict(p) for p in cursor.fetchall()]
        
        # Get remotes
        cursor.execute("SELECT transport_type, url FROM server_remotes WHERE server_name = ?", (server_name,))
        server['remotes'] = [dict(r) for r in cursor.fetchall()]
        
        # Get env vars
        cursor.execute("""
            SELECT var_name, description, is_required, is_secret 
            FROM environment_variables WHERE server_name = ?
        """, (server_name,))
        server['environment_variables'] = [dict(e) for e in cursor.fetchall()]
        
        # Get tools
        cursor.execute("""
            SELECT tool_name, title, description, input_schema 
            FROM tools WHERE server_name = ?
        """, (server_name,))
        tools = []
        for t in cursor.fetchall():
            tool = dict(t)
            if tool.get('input_schema'):
                tool['input_schema'] = json.loads(tool['input_schema'])
            tools.append(tool)
        server['tools'] = tools
        
        # Get resources
        cursor.execute("SELECT uri, name, description, mime_type FROM resources WHERE server_name = ?", (server_name,))
        server['resources'] = [dict(r) for r in cursor.fetchall()]
        
        # Get prompts
        cursor.execute("SELECT prompt_name, description FROM prompts WHERE server_name = ?", (server_name,))
        server['prompts'] = [dict(p) for p in cursor.fetchall()]
        
        servers.append(server)
    
    # Summary stats
    stats = get_stats(db_path)
    
    output = {
        'extracted_at': servers[0].get('extracted_at') if servers else None,
        'stats': stats,
        'servers': servers
    }
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2, default=str)
    
    conn.close()
    print(f"✓ Exported {len(servers)} servers to {output_path}")


def export_tools_json(db_path: Path = DATABASE_PATH, output_path: Optional[Path] = None):
    """Export just tools to JSON."""
    if output_path is None:
        output_path = db_path.parent / "mcp_tools.json"
    
    conn = get_connection(db_path)
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT t.*, s.description as server_description,
               (SELECT COUNT(*) FROM environment_variables ev 
                WHERE ev.server_name = t.server_name AND ev.is_secret = 1) > 0 as requires_auth
        FROM tools t
        JOIN servers s ON t.server_name = s.name
        ORDER BY t.server_name, t.tool_name
    """)
    
    tools = []
    for row in cursor.fetchall():
        tool = dict(row)
        
        # Parse input schema
        if tool.get('input_schema'):
            tool['input_schema'] = json.loads(tool['input_schema'])
        
        # Get parameters
        cursor.execute("""
            SELECT param_name, param_type, description, is_required, default_value, enum_values
            FROM tool_parameters 
            WHERE server_name = ? AND tool_name = ?
        """, (tool['server_name'], tool['tool_name']))
        tool['parameters'] = [dict(p) for p in cursor.fetchall()]
        
        tools.append(tool)
    
    output = {
        'total_tools': len(tools),
        'tools': tools
    }
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2, default=str)
    
    conn.close()
    print(f"✓ Exported {len(tools)} tools to {output_path}")


def main():
    parser = argparse.ArgumentParser(description="MCP Registry Data Visualizer & Stats")
    subparsers = parser.add_subparsers(dest="command", help="Available commands")
    
    # Stats command
    stats_parser = subparsers.add_parser("stats", help="Show statistics from extracted data")
    stats_parser.add_argument("--db", type=str, default=str(DATABASE_PATH), help="Database path")
    
    # List servers command
    list_parser = subparsers.add_parser("servers", help="List servers from database")
    list_parser.add_argument("--search", type=str, help="Search filter")
    list_parser.add_argument("--limit", type=int, default=20, help="Number of results")
    list_parser.add_argument("--db", type=str, default=str(DATABASE_PATH), help="Database path")
    
    # List tools command
    tools_parser = subparsers.add_parser("tools", help="List extracted tools")
    tools_parser.add_argument("--search", type=str, help="Search filter")
    tools_parser.add_argument("--limit", type=int, default=50, help="Number of results")
    tools_parser.add_argument("--db", type=str, default=str(DATABASE_PATH), help="Database path")
    
    # Server details command
    server_parser = subparsers.add_parser("server", help="Get details for a specific server")
    server_parser.add_argument("name", type=str, help="Server name")
    server_parser.add_argument("--db", type=str, default=str(DATABASE_PATH), help="Database path")
    
    # Tool details command
    tool_parser = subparsers.add_parser("tool", help="Get details for a specific tool")
    tool_parser.add_argument("name", type=str, help="Tool name (partial match)")
    tool_parser.add_argument("--db", type=str, default=str(DATABASE_PATH), help="Database path")
    
    # Export CSV command
    csv_parser = subparsers.add_parser("csv", help="Export servers to CSV")
    csv_parser.add_argument("--output", type=str, help="Output CSV path")
    csv_parser.add_argument("--db", type=str, default=str(DATABASE_PATH), help="Database path")
    
    # Export JSON command
    json_parser = subparsers.add_parser("json", help="Export all data to JSON")
    json_parser.add_argument("--output", type=str, help="Output JSON path")
    json_parser.add_argument("--db", type=str, default=str(DATABASE_PATH), help="Database path")
    
    # Export tools JSON command
    tools_json_parser = subparsers.add_parser("tools-json", help="Export tools to JSON")
    tools_json_parser.add_argument("--output", type=str, help="Output JSON path")
    tools_json_parser.add_argument("--db", type=str, default=str(DATABASE_PATH), help="Database path")
    
    # Top servers command
    top_parser = subparsers.add_parser("top", help="Show top servers by metric")
    top_parser.add_argument("--by", type=str, default="stars", 
                           choices=["stars", "score", "downloads", "tools"],
                           help="Metric to rank by (default: stars)")
    top_parser.add_argument("--limit", type=int, default=20, help="Number of results")
    top_parser.add_argument("--db", type=str, default=str(DATABASE_PATH), help="Database path")
    
    args = parser.parse_args()

    
    if args.command == "stats":
        stats = get_stats(Path(args.db))
        print_stats(stats)
    elif args.command == "servers":
        servers = list_servers(Path(args.db), limit=args.limit, search=args.search)
        print_servers(servers)
    elif args.command == "tools":
        tools = list_tools(Path(args.db), limit=args.limit, search=args.search)
        print_tools(tools)
    elif args.command == "server":
        details = get_server_details(Path(args.db), args.name)
        if details:
            print(json.dumps(details, indent=2, default=str))
        else:
            print(f"Server '{args.name}' not found")
    elif args.command == "tool":
        tools = get_tool_details(Path(args.db), args.name)
        if tools:
            print(json.dumps(tools, indent=2, default=str))
        else:
            print(f"No tools matching '{args.name}' found")
    elif args.command == "csv":
        output = Path(args.output) if args.output else None
        export_to_csv(Path(args.db), output)
    elif args.command == "json":
        output = Path(args.output) if args.output else None
        export_to_json(Path(args.db), output)
    elif args.command == "tools-json":
        output = Path(args.output) if args.output else None
        export_tools_json(Path(args.db), output)
    elif args.command == "top":
        servers = top_servers(Path(args.db), metric=args.by, limit=args.limit)
        print_top_servers(servers, args.by)
    else:
        parser.print_help()
        print("\nExample usage:")
        print("  python visualize.py stats              # Show summary statistics")
        print("  python visualize.py servers --limit 10 # List top 10 servers")
        print("  python visualize.py top --by stars     # Top servers by GitHub stars")
        print("  python visualize.py top --by score     # Top servers by backlink score")
        print("  python visualize.py tools --search git # Search tools")
        print("  python visualize.py server <name>      # Get server details")
        print("  python visualize.py tool <name>        # Get tool details")
        print("  python visualize.py csv                # Export to CSV")
        print("  python visualize.py json               # Export all to JSON")
        print("  python visualize.py tools-json         # Export tools to JSON")


if __name__ == "__main__":
    main()
