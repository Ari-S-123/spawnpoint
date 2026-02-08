import asyncio
import os
import json
from mcp import ClientSession
from mcp.client.stdio import stdio_client, StdioServerParameters
from dotenv import load_dotenv

load_dotenv()

async def debug_server(command, args, cwd=None, env=None):
    full_env = os.environ.copy()
    if env:
        full_env.update(env)
    
    server_params = StdioServerParameters(
        command=command,
        args=args,
        env=full_env,
        cwd=cwd
    )
    
    print(f"Running: {command} {' '.join(args)} (cwd={cwd})")
    try:
        async with stdio_client(server_params) as (read, write):
            async with ClientSession(read, write) as session:
                await asyncio.wait_for(session.initialize(), timeout=10)
                tools = await session.list_tools()
                print(f"Success! Found {len(tools.tools)} tools.")
                for t in tools.tools[:3]:
                    print(f" - {t.name}")
    except Exception as e:
        print(f"Failed: {type(e).__name__}: {e}")

if __name__ == "__main__":
    # Test IP2Location
    asyncio.run(debug_server("uv", ["run", "src/server.py"], cwd="/Users/sbae703/dev/github_pkgs/mcp/mcp-ip2location-io"))
    
    print("\n--- Testing Urlbox ---")
    asyncio.run(debug_server("npx", ["-y", "@urlbox/screenshot-mcp"]))

