#!/usr/bin/env python3
"""
MCP Registry Data Extractor

Extracts all server data from the MCP Registry API and stores it in SQLite.
Uses the shared db.py schema.
"""

import requests
import json
from datetime import datetime
from typing import Optional, Generator
from pathlib import Path
import argparse

from db import DATABASE_PATH, init_database


# Constants
MCP_REGISTRY_BASE_URL = "https://registry.modelcontextprotocol.io/v0.1"
DEFAULT_LIMIT = 100  # Max allowed by API


def fetch_servers(
    limit: int = DEFAULT_LIMIT,
    search: Optional[str] = None,
    version: Optional[str] = None
) -> Generator[dict, None, None]:
    """
    Fetch all servers from the MCP Registry with pagination.
    
    Yields each server entry as a dictionary.
    """
    cursor = None
    total_fetched = 0
    
    while True:
        params = {"limit": limit}
        if cursor:
            params["cursor"] = cursor
        if search:
            params["search"] = search
        if version:
            params["version"] = version
            
        response = requests.get(
            f"{MCP_REGISTRY_BASE_URL}/servers",
            params=params,
            headers={"Accept": "application/json"}
        )
        response.raise_for_status()
        
        data = response.json()
        servers = data.get("servers", [])
        metadata = data.get("metadata", {})
        
        for server in servers:
            yield server
            total_fetched += 1
        
        print(f"  Fetched {total_fetched} servers so far...")
        
        # Check for next page
        cursor = metadata.get("nextCursor")
        if not cursor or not servers:
            break
    
    print(f"Total servers fetched: {total_fetched}")


def extract_server_data(server_entry: dict) -> dict:
    """Extract relevant fields from a server entry."""
    meta = server_entry.get("_meta", {})
    registry_meta = meta.get("io.modelcontextprotocol.registry/official", {})
    server = server_entry.get("server", {})
    repository = server.get("repository", {})
    
    return {
        "name": server.get("name", ""),
        "description": server.get("description", ""),
        "version": server.get("version", ""),
        "schema_url": server.get("$schema", ""),
        "repository_url": repository.get("url", ""),
        "repository_source": repository.get("source", ""),
        "website_url": server.get("websiteUrl", ""),
        "is_latest": registry_meta.get("isLatest", False),
        "status": registry_meta.get("status", ""),
        "published_at": registry_meta.get("publishedAt"),
        "updated_at": registry_meta.get("updatedAt"),
        "icons": server.get("icons", []),
        "packages": server.get("packages", []),
        "remotes": server.get("remotes", []),
        "raw_json": json.dumps(server_entry)
    }


def save_server(conn, server_data: dict):
    """Save a server and its related data to the database."""
    cursor = conn.cursor()
    server_name = server_data["name"]
    
    # Insert or update main server record
    cursor.execute("""
        INSERT OR REPLACE INTO servers 
        (name, description, version, schema_url, repository_url, repository_source,
         website_url, is_latest, status, published_at, updated_at, raw_json, extracted_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        server_name,
        server_data["description"],
        server_data["version"],
        server_data["schema_url"],
        server_data["repository_url"],
        server_data["repository_source"],
        server_data["website_url"],
        server_data["is_latest"],
        server_data["status"],
        server_data["published_at"],
        server_data["updated_at"],
        server_data["raw_json"],
        datetime.utcnow().isoformat()
    ))
    
    # Clear existing related data for this server
    cursor.execute("DELETE FROM server_icons WHERE server_name = ?", (server_name,))
    cursor.execute("DELETE FROM server_packages WHERE server_name = ?", (server_name,))
    cursor.execute("DELETE FROM server_remotes WHERE server_name = ?", (server_name,))
    cursor.execute("DELETE FROM environment_variables WHERE server_name = ?", (server_name,))
    
    # Insert icons
    for icon in server_data.get("icons", []):
        cursor.execute("""
            INSERT INTO server_icons (server_name, src, mime_type, theme, sizes)
            VALUES (?, ?, ?, ?, ?)
        """, (
            server_name,
            icon.get("src", ""),
            icon.get("mimeType", ""),
            icon.get("theme", ""),
            json.dumps(icon.get("sizes", []))
        ))
    
    # Insert packages and environment variables
    for package in server_data.get("packages", []):
        transport = package.get("transport", {})
        
        cursor.execute("""
            INSERT INTO server_packages 
            (server_name, registry_type, identifier, version, transport_type, 
             transport_url, runtime_hint, file_sha256, raw_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            server_name,
            package.get("registryType", ""),
            package.get("identifier", ""),
            package.get("version", ""),
            transport.get("type", ""),
            transport.get("url", ""),
            package.get("runtimeHint", ""),
            package.get("fileSha256", ""),
            json.dumps(package)
        ))
        
        # Extract environment variables from packages
        for env_var in package.get("environmentVariables", []):
            cursor.execute("""
                INSERT INTO environment_variables 
                (server_name, var_name, description, is_required, is_secret, 
                 format, default_value, choices)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                server_name,
                env_var.get("name", ""),
                env_var.get("description", ""),
                env_var.get("isRequired", False),
                env_var.get("isSecret", False),
                env_var.get("format", ""),
                env_var.get("default", ""),
                json.dumps(env_var.get("choices", []))
            ))
    
    # Insert remotes
    for remote in server_data.get("remotes", []):
        headers = remote.get("headers", [])
        cursor.execute("""
            INSERT INTO server_remotes (server_name, transport_type, url, headers_json)
            VALUES (?, ?, ?, ?)
        """, (
            server_name,
            remote.get("type", ""),
            remote.get("url", ""),
            json.dumps(headers) if headers else None
        ))


def extract_all(db_path: Path = DATABASE_PATH, search: Optional[str] = None):
    """Extract all servers from the registry and save to database."""
    print(f"Creating/connecting to database: {db_path}")
    conn = init_database(db_path)
    
    print("Fetching servers from MCP Registry...")
    server_count = 0
    
    for server_entry in fetch_servers(search=search, version="latest"):
        server_data = extract_server_data(server_entry)
        save_server(conn, server_data)
        server_count += 1
    
    conn.commit()
    conn.close()
    
    print(f"\n✓ Successfully extracted {server_count} servers to {db_path}")


def main():
    parser = argparse.ArgumentParser(description="MCP Registry Data Extractor")
    parser.add_argument("--search", type=str, help="Search filter for server names")
    parser.add_argument("--db", type=str, default=str(DATABASE_PATH), help="Database path")
    
    args = parser.parse_args()
    extract_all(Path(args.db), search=args.search)


if __name__ == "__main__":
    main()
