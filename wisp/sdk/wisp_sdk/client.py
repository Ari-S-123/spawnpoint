import aiohttp
import asyncio
from typing import List, Dict, Any, Optional
from .models import SearchResult, CallRequest
from .errors import WispAPIError, WispTimeoutError, WispConnectionError, WispError

class WispClient:
    def __init__(self, base_url: str = "http://localhost:8000"):
        self.base_url = base_url.rstrip("/")

    async def _handle_response(self, response: aiohttp.ClientResponse) -> Dict[str, Any]:
        if response.ok:
            return await response.json()
        
        status = response.status
        try:
            error_body = await response.json()
            detail = error_body.get("detail", response.reason)
        except Exception:
            detail = await response.text()

        if status == 504:
            raise WispTimeoutError(f"Request timed out: {detail}")
        
        raise WispAPIError(detail, status)

    async def get_available_keys(self) -> List[str]:
        """Fetch list of available API keys from the gateway."""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(f"{self.base_url}/keys") as resp:
                    data = await self._handle_response(resp)
                    return data.get("available_keys", [])
        except aiohttp.ClientError as e:
            raise WispConnectionError(f"Failed to connect to Wisp: {str(e)}")

    async def search(self, query: str, page: int = 1, limit: int = 10) -> SearchResult:
        """Search for tools in the Wisp Gateway."""
        params = {
            "query": query,
            "page": str(page),
            "limit": str(limit)
        }
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(f"{self.base_url}/search", params=params) as resp:
                    data = await self._handle_response(resp)
                    return SearchResult(**data)
        except aiohttp.ClientError as e:
            raise WispConnectionError(f"Failed to connect to Wisp: {str(e)}")

    async def list_tools(self, server_name: str) -> List[str]:
        """List all tools for a specific server."""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(f"{self.base_url}/servers/{server_name}/tools") as resp:
                    data = await self._handle_response(resp)
                    return data.get("tools", [])
        except aiohttp.ClientError as e:
            raise WispConnectionError(f"Failed to connect to Wisp: {str(e)}")

    async def call(self, server_name: str, tool_name: str, arguments: Dict[str, Any] = None) -> Any:
        """Execute a tool on a connected server."""
        payload = {
            "server_name": server_name,
            "tool_name": tool_name,
            "arguments": arguments or {}
        }
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(f"{self.base_url}/call", json=payload) as resp:
                    return await self._handle_response(resp)
        except aiohttp.ClientError as e:
            raise WispConnectionError(f"Failed to connect to Wisp: {str(e)}")