#!/usr/bin/env python3
"""
Continuous HTTP Server for Tool Discovery

Exposes the Retriever functionality via a FastAPI web server.
"""

import json
import os
import asyncio
from pathlib import Path
from typing import Optional, Dict, Any, List

from fastapi import FastAPI, Query, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import sys
import uvicorn
from dotenv import load_dotenv

# Add data directory to sys.path to allow imports
sys.path.append(str(Path(__file__).parent / "server"))

from mcp import ClientSession
from mcp.client.stdio import stdio_client, StdioServerParameters
from mcp.client.streamable_http import streamable_http_client

# Load environment variables from data/.env
ENV_PATH = Path(__file__).parent / "server" / ".env"
load_dotenv(dotenv_path=ENV_PATH)

try:
    from data.retriever import Retriever
    from data.db import get_connection, DATABASE_PATH
    from data.mcp_client import resolve_env_vars
except ImportError:
    # Fallback if run from data directory or if PYTHONPATH is set differently
    from retriever import Retriever
    from db import get_connection, DATABASE_PATH
    from mcp_client import resolve_env_vars

from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup logic
    print("🚀 Pre-loading embedding model...")
    retriever.warmup()
    print("✓ Model loaded and ready.")
    yield
    # Shutdown logic (none needed)

app = FastAPI(
    title="Wisp Tool Discovery API",
    description="Continuously running server for discovering the best MCP servers and tools.",
    version="0.1.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For development, allow all. Can be restricted to ["http://localhost:5173"]
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Retriever
# Note: In a production environment, you might want to handle DB connection pooling
# or use a dependency injection pattern.
retriever = Retriever()

@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}

@app.get("/keys")
async def list_available_keys():
    """
    Returns a list of API keys/tokens defined in .tokens.
    Useful for agents to know their capabilities.
    """
    tokens_path = Path(__file__).parent / "server" / ".tokens"
    if not tokens_path.exists():
        # Fallback to check server/.tokens if data/.tokens doesn't exist (due to recent path changes)
        tokens_path = Path(__file__).parent / "server" / ".tokens"
        
    if not tokens_path.exists():
        return {"available_keys": []}
    
    with open(tokens_path, "r") as f:
        lines = f.readlines()
    
    # Filter out comments and empty lines
    keys = []
    for line in lines:
        clean = line.strip()
        if clean and not clean.startswith("#"):
            keys.append(clean)
            
    return {"available_keys": keys}

@app.get("/search")
async def search_tools(
    query: str = Query(..., description="The search query for tools or servers"),
    page: int = Query(1, ge=1, description="Page number for results"),
    limit: int = Query(10, ge=1, le=100, description="Number of results per page")
):
    """
    Search for tools matching the query.
    Returns hydrated tool metadata, server information, and relevance scores.
    """
    try:
        results = retriever.retrieve(query, page=page, limit=limit)
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error during retrieval: {str(e)}")

@app.get("/servers/{server_name:path}/tools")
async def list_server_tools(server_name: str):
    """
    List all tools available on a specific server.
    """
    try:
        tools = retriever.get_tools_for_server(server_name)
        return {"server": server_name, "tools": tools}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving tools for server: {str(e)}")

class CallRequest(BaseModel):
    server_name: str
    tool_name: str
    arguments: Dict[str, Any] = {}

async def get_server_connection_info(server_name: str) -> Dict[str, Any]:
    """Fetch connection info for a server from the database."""
    conn = get_connection()
    cursor = conn.cursor()
    
    # Check for remote HTTP endpoint
    cursor.execute("""
        SELECT transport_type, url, headers_json 
        FROM server_remotes WHERE server_name = ?
    """, (server_name,))
    remote = cursor.fetchone()
    if remote:
        headers_json = remote["headers_json"]
        headers = json.loads(headers_json) if headers_json else None
        if headers:
            headers = resolve_env_vars(headers)
            
        return {
            "method": "remote",
            "url": remote["url"],
            "headers": headers
        }
    
    # Check for stdio package
    cursor.execute("""
        SELECT registry_type, identifier, runtime_hint 
        FROM server_packages WHERE server_name = ? AND transport_type = 'stdio'
    """, (server_name,))
    pkg = cursor.fetchone()
    if pkg:
        return {
            "method": "stdio",
            "registry": pkg["registry_type"],
            "identifier": pkg["identifier"],
            "runtime_hint": pkg["runtime_hint"]
        }
        
    # Check for local source
    cursor.execute("""
        SELECT command, args_json, working_dir, env_json 
        FROM server_local_sources WHERE server_name = ?
    """, (server_name,))
    local = cursor.fetchone()
    if local:
        return {
            "method": "local",
            "command": local["command"],
            "args": json.loads(local["args_json"]) if local["args_json"] else [],
            "cwd": local["working_dir"],
            "env": json.loads(local["env_json"]) if local["env_json"] else {}
        }
        
    conn.close()
    return None

def build_stdio_command(server_info: Dict) -> tuple[str, list[str]]:
    """Build the command and args for a stdio server."""
    registry = server_info.get('registry', '')
    identifier = server_info.get('identifier', '')
    runtime_hint = server_info.get('runtime_hint', '')
    
    if runtime_hint:
        return runtime_hint, [identifier]
    
    if registry == 'npm':
        return 'npx', ['-y', '--quiet', identifier]
    elif registry == 'pypi':
        return 'uvx', ['--quiet', identifier]
    elif registry == 'oci':
        return 'docker', ['run', '--rm', '-i', identifier]
    return 'npx', ['-y', '--quiet', identifier]

@app.post("/call")
async def call_tool(request: CallRequest):
    """
    Execute a tool on an MCP server.
    """
    info = await get_server_connection_info(request.server_name)
    if not info:
        raise HTTPException(status_code=404, detail=f"Connection info for server '{request.server_name}' not found.")
    
    timeout = 60
    
    try:
        if info["method"] == "remote":
            import httpx
            http_client = None
            if info.get("headers"):
                http_client = httpx.AsyncClient(headers=info.get("headers"))
                
            async with streamable_http_client(info["url"], http_client=http_client) as (read, write, _):
                async with ClientSession(read, write) as session:
                    await asyncio.wait_for(session.initialize(), timeout=timeout)
                    result = await asyncio.wait_for(
                        session.call_tool(request.tool_name, request.arguments), 
                        timeout=timeout
                    )
                    return result.model_dump() if hasattr(result, "model_dump") else result
                    
        elif info["method"] == "stdio" or info["method"] == "local":
            if info["method"] == "stdio":
                command, args = build_stdio_command(info)
                env = os.environ.copy()
                cwd = None
            else:
                command = info["command"]
                args = info["args"]
                env = os.environ.copy()
                env.update(info["env"])
                cwd = info["cwd"]
            
            # Ensure API keys from current environment are passed
            # (they were already loaded via load_dotenv)
            
            server_params = StdioServerParameters(
                command=command,
                args=args,
                env=env,
                cwd=cwd
            )
            
            async with stdio_client(server_params) as (read, write):
                async with ClientSession(read, write) as session:
                    await asyncio.wait_for(session.initialize(), timeout=timeout)
                    result = await asyncio.wait_for(
                        session.call_tool(request.tool_name, request.arguments), 
                        timeout=timeout
                    )
                    return result.model_dump() if hasattr(result, "model_dump") else result
                    
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Tool execution timed out.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
