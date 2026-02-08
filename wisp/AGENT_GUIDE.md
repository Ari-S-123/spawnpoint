# Building Agents with Wisp

Wisp is a **Tool Gateway** that allows any agent to discover and execute 2,000+ MCP tools via a single, clean API. You don't need to manage API keys, transport protocols (stdio/SSE), or environment variables—Wisp handles it all.

---

## 1. The Core Loop

Wisp enables a "Discovery-First" agent architecture: 0. **Know Capability**: Agent starts by checking available keys via `/keys` to know what it is _powered_ to do.

1. **Discover**: Agent searches Wisp for tools by intent (e.g., "how do I search github issues?").
2. **Select**: Agent picks the best tool that matches its unlocked capabilities.
3. **Execute**: Agent calls the tool through Wisp's `/call` endpoint.

---

## 2. API Integration

### Capability Discovery

Know what API keys are loaded in the Gateway. Use this to prune tool choices or inform the LLM of its "superpowers".

```bash
curl "http://localhost:8000/keys"
```

### Discovery

Find tools semantically.

```bash
curl "http://localhost:8000/search?query=weather+forecast&limit=1"
```

### Execution

Call any tool using the `server_name` and `tool_name` from the search result.

```bash
curl -X POST http://localhost:8000/call \
  -H "Content-Type: application/json" \
  -d '{
    "server_name": "weather-server",
    "tool_name": "get_forecast",
    "arguments": {"city": "San Francisco"}
  }'
```

---

## 3. Drop-in Agent Example (Python)

This snippet shows how to build an agent that dynamically finds and uses tools it didn't know existed 5 seconds ago.

```python
import requests

WISP_URL = "http://localhost:8000"

def wisp_agent(user_intent: str):
    # 0. KNOW CAPABILITIES
    # An agent might do this once at startup to inform its system prompt
    caps = requests.get(f"{WISP_URL}/keys").json()
    print(f"Available 'Superpowers': {caps['available_keys']}")

    # 1. DISCOVER
    print(f"Finding tools for: {user_intent}...")
    search = requests.get(f"{WISP_URL}/search", params={"query": user_intent, "limit": 1}).json()

    if not search["results"]:
        return "No tools found."

    tool = search["results"][0]
    print(f"Using Tool: {tool['name']} from {tool['server']['name']}")

    # 2. EXECUTE (Example with hardcoded args, but usually LLM would generate these)
    # The LLM would use tool['input_schema'] to format these arguments.
    response = requests.post(f"{WISP_URL}/call", json={
        "server_name": tool["server"]["name"],
        "tool_name": tool["name"],
        "arguments": {"owner": "google", "repo": "jax"} # Tailored to the tool
    })

    return response.json()

# Example: "How do I check a repository's star count?"
# Wisp finds 'get_repo' from 'github-mcp' and executes it.
```

---

## 4. Why Use Wisp for Agents?

| Feature            | Without Wisp                               | With Wisp                                  |
| :----------------- | :----------------------------------------- | :----------------------------------------- |
| **API Keys**       | You must manage `.env` for 50+ providers   | Wisp handles all keys centrally            |
| **Tool Knowledge** | You must hardcode tool definitions         | Dynamic semantic discovery                 |
| **Protocols**      | You write logic for Stdio, Docker, and SSE | Unified JSON REST API                      |
| **Self-Awareness** | Agent guesses what it can do               | `/keys` tells agent its exact powers       |
| **Self-Healing**   | If a tool is deprecated, your agent breaks | Agent just searches for the next best tool |

---

## 5. Live Demo: The Discovery Agent

Check out the `./example_agent` directory for a fully functioning React demo of this loop. It demonstrates how to pivot from a user's natural language intent to a high-quality tool execution in fewer than 100 lines of code.

---

## Next Steps

- Add your keys to `data/.env` to unlock premium tools.
- Use the `/search` endpoint to build a dynamic tool-kit for your LLM system.
