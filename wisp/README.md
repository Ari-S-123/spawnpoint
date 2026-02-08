# Wisp: The MCP Tool Gateway

Wisp is a unified interface for discovering and executing 2,000+ MCP tools. It turns the fragmented MCP ecosystem into a single JSON API.

### 🚀 Gateway for Agents

Wisp is designed to be a drop-in solution for AI agents.

- **Dynamic Discovery**: Discover 2,000+ tools on the fly via `/search`.
- **Self-Awareness**: Check available API tokens via `/keys` to inform agent planning.
- **Unified Execution**: Call any tool (Stdio, HTTP, Docker) via a simple `/call` POST.

**[See the Agent Integration Guide →](./AGENT_GUIDE.md)** | **[Advanced Inspiration & Concepts →](./INSPIRATION.md)**

### Start Backend Server

```bash
uv run uvicorn server:app --host 0.0.0.0 --port 8000
```

### Start Discovery UI (Wisp Explorer)

```bash
cd client && npm run dev
```

### Start Example Agent (Autonomous Demo)

```bash
cd example_agent && npm run dev
```
