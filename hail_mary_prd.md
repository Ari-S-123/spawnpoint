PRD: Rapid Third-Party App Integrations via Composio
Goal

Enable immediate, high-leverage actions across major developer + consumer platforms (email, social, infra, docs) by integrating Composio as a secondary tool provider alongside our existing tool server.

This unlocks real demos, real usage, and agent-level credibility fast.

Non-Goals

Rebuilding native OAuth flows for each app

Long-term permission governance (defer)

Custom UX per integration (uniform action interface only)

Target Integrations (v0)

Use Composio’s prebuilt actions + auth.

Gmail — read/send/search emails

Instagram — post, read profile/media

TikTok — post video, read analytics (if supported)

Sentry — read issues, comment, resolve

Vercel — deployments, logs, env vars

Mintlify — update docs, read pages

User Value

Agents can take real actions, not just browse

Demo-able workflows in minutes (email → deploy → post → docs)

Positions product as action-native, not chat-wrapped

Architecture (Minimal)

Two tool backends, one interface

Agent
├─ Existing Tool Server (internal tools)
└─ Composio Tool Adapter
├─ Auth (OAuth via Composio)
└─ Action Execution (Composio APIs)

Key Principle

Treat Composio as a capability expansion layer, not a replacement.

Tool Routing Logic

At runtime:

Agent requests an action

Router decides:

Internal → existing tool server

External app → Composio

Normalize responses into shared ToolResult schema

API / Interface (Sketch)
Tool {
id: string
provider: "internal" | "composio"
app?: string
action: string
params: Record<string, any>
}

Auth Flow (Fast Path)

User connects app once via Composio OAuth

Store Composio connection ID

Pass connection ID on tool calls

No token handling internally

Success Criteria (1–2 weeks)

✅ Agent can send an email, deploy to Vercel, post to social, update docs

✅ Single demo showing ≥3 apps chained

✅ <1 day per integration after first

Risks / Mitigations

Action ambiguity → constrain prompts with explicit tool affordances

Permission overreach → use least-privilege scopes

Latency → parallelize tool calls when possible

Why This Matters

This turns the product from agent-that-knows into agent-that-does — fast, credibly, and visibly.
It also de-risks long-term native integrations by validating which actions users actually use.

If you want, next step I can:

Define the exact action whitelist per app, or

Write the tool router + adapter code, or

Design a 1-minute demo flow that hits YC judges immediately.

Oauth should be one click oauth thorugh platform. And then use tool platform and others as necesarry to do the following task.
