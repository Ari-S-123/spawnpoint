import asyncio
import sys
import os

# Add the sdk directory to sys.path so we can import wisp_sdk
sys.path.append(os.path.join(os.getcwd(), "sdk"))

from wisp_sdk.client import WispClient
from wisp_sdk.errors import WispError

async def main():
    client = WispClient()
    
    print("--- Testing Connection & Keys ---")
    try:
        keys = await client.get_available_keys()
        print(f"✅ Connected! Available keys: {len(keys)}")
    except Exception as e:
        print(f"❌ Connection failed: {e}")
        return

    print("\n--- Testing Search ---")
    try:
        # Search for something general
        result = await client.search("wikipedia")
        print(f"✅ Search successful. Found {result.total_candidates} candidates.")
        if result.results:
            first = result.results[0]
            print(f"   Top result: {first.name} (Score: {first.score:.2f})")
            print(f"   Server: {first.server.name}")
    except Exception as e:
        print(f"❌ Search failed: {e}")

if __name__ == "__main__":
    asyncio.run(main())
