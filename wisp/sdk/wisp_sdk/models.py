from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field

class ServerInfo(BaseModel):
    name: str
    description: Optional[str] = None

class Tool(BaseModel):
    tool_id: int
    name: str
    title: Optional[str] = None
    description: Optional[str] = None
    input_schema: Optional[Dict[str, Any]] = None
    requires_auth: bool
    server: ServerInfo
    relevance: float
    quality: float
    score: float

class SearchResult(BaseModel):
    query: str
    page: int
    limit: int
    total_candidates: int
    results: List[Tool]

class CallRequest(BaseModel):
    server_name: str
    tool_name: str
    arguments: Dict[str, Any] = Field(default_factory=dict)
