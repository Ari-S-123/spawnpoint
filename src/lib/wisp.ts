const WISP_URL = process.env.WISP_URL ?? 'http://localhost:8000';

export type ServerInfo = {
  name: string;
  description: string | null;
};

export type Tool = {
  tool_id: number;
  name: string;
  title: string | null;
  description: string | null;
  input_schema: Record<string, unknown> | null;
  requires_auth: boolean;
  server: ServerInfo;
  relevance: number;
  quality: number;
  score: number;
};

export type SearchResult = {
  query: string;
  page: number;
  limit: number;
  total_candidates: number;
  results: Tool[];
};

export type CallRequest = {
  server_name: string;
  tool_name: string;
  arguments: Record<string, unknown>;
};

async function wispFetch(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${WISP_URL}${path}`, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail ?? `Wisp API error: ${res.status}`);
  }
  return res;
}

export async function getAvailableKeys(): Promise<string[]> {
  const res = await wispFetch('/keys');
  const data = await res.json();
  return data.available_keys;
}

export async function searchTools(query: string, page = 1, limit = 10): Promise<SearchResult> {
  const params = new URLSearchParams({ query, page: String(page), limit: String(limit) });
  const res = await wispFetch(`/search?${params}`);
  return res.json();
}

export async function callTool(request: CallRequest): Promise<unknown> {
  const res = await wispFetch('/call', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request)
  });
  return res.json();
}
