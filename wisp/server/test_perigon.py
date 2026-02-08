import asyncio
import traceback
from mcp import ClientSession
from mcp.client.sse import sse_client

async def test_perigon():
    url = "https://mcp.perigon.io/v1/mcp"
    print(f"Connecting to {url}...")
    try:
        async with sse_client(url) as (read, write):
            async with ClientSession(read, write) as session:
                await asyncio.wait_for(session.initialize(), timeout=10)
                tools = await session.list_tools()
                print(f"Success! Found {len(tools.tools)} tools.")
    except Exception as e:
        if hasattr(e, "exceptions"):
            for sub in e.exceptions:
                print(f"Sub-exception: {type(sub).__name__}: {sub}")
                traceback.print_exception(type(sub), sub, sub.__traceback__)
        else:
            print(f"Failed: {type(e).__name__}: {e}")
            traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_perigon())
