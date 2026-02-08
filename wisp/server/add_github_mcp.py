#!/usr/bin/env python3
"""
Register the GitHub MCP server in the Wisp database.
"""

import sqlite3
import json
from pathlib import Path
from datetime import datetime

DATABASE_PATH = Path(__file__).parent / "mcp_registry.db"

def add_github_server():
    """Add GitHub MCP server to the database."""
    print(f"🎯 Registering GitHub MCP Server")
    print("="*60)
    
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    server_name = "github"
    
    # 1. Insert into servers table
    cursor.execute("SELECT name FROM servers WHERE name = ?", (server_name,))
    if cursor.fetchone():
        print(f"  ⏭️  github - already exists. Updating...")
        cursor.execute("""
            UPDATE servers SET 
                description = ?, 
                repository_url = ?, 
                extracted_at = ?
            WHERE name = ?
        """, (
            "GitHub MCP Server - Discover and manage repositories, issues, and PRs.",
            "https://github.com/github/mcp-server",
            datetime.now().isoformat(),
            server_name
        ))
    else:
        cursor.execute("""
            INSERT INTO servers (name, description, repository_url, extracted_at)
            VALUES (?, ?, ?, ?)
        """, (
            server_name,
            "GitHub MCP Server - Discover and manage repositories, issues, and PRs.",
            "https://github.com/github/mcp-server",
            datetime.now().isoformat()
        ))
        print(f"  ✅ github - server entry added")

    # 2. Add remote endpoint to server_remotes
    headers = {"Authorization": "Bearer ${GITHUB_TOKEN}"}
    cursor.execute("DELETE FROM server_remotes WHERE server_name = ?", (server_name,))
    cursor.execute("""
        INSERT INTO server_remotes (server_name, transport_type, url, headers_json)
        VALUES (?, ?, ?, ?)
    """, (
        server_name,
        "streamable-http",
        "https://api.githubcopilot.com/mcp/",
        json.dumps(headers)
    ))
    print(f"  ✅ github - remote endpoint added (with GITHUB_TOKEN header)")

    # 3. Add environment variable requirement
    cursor.execute("DELETE FROM environment_variables WHERE server_name = ?", (server_name,))
    cursor.execute("""
        INSERT INTO environment_variables (server_name, var_name, description, is_required, is_secret)
        VALUES (?, ?, ?, ?, ?)
    """, (
        server_name,
        "GITHUB_TOKEN",
        "GitHub Personal Access Token",
        True,
        True
    ))
    print(f"  ✅ github - auth requirement documented")

    conn.commit()
    conn.close()
    print("\n✓ GitHub MCP server registered successfully.")

if __name__ == "__main__":
    add_github_server()
