# SpawnPoint

Single-click AI Agent onboarding with no friction. Automate account creation across 6 platforms for your AI agents.

Built for the **BetterHack Hackathon @ YC**.

## What it does

SpawnPoint provisions fully operational platform accounts for AI agents. Enter a name, and the system creates a disposable email, generates credentials, and orchestrates browser-based signups across:

- **Instagram** / **TikTok** / **X (Twitter)** -- social platforms (CAPTCHA-likely, run sequentially)
- **Mintlify** / **Vercel** / **Sentry** -- developer tools (no CAPTCHA, run in parallel)

Each signup is driven by a cloud browser (Browserbase + Playwright). Verification emails are received through AgentMail and OTPs are automatically extracted and injected. If a signup fails, Claude Opus 4.6 analyzes a screenshot and attempts recovery.

## Stack

| Layer           | Tech                                    |
| --------------- | --------------------------------------- |
| Framework       | Next.js 16 (App Router, React Compiler) |
| Auth            | Neon Auth (`@neondatabase/auth`)        |
| Database        | Neon Postgres + Drizzle ORM             |
| AI              | Vercel AI SDK + Claude Opus 4.6         |
| Email           | AgentMail (disposable inboxes)          |
| Browser         | Browserbase + Playwright                |
| UI              | shadcn/ui + Tailwind CSS v4             |
| Monitoring      | Sentry                                  |
| Package Manager | Bun                                     |
| Deployment      | Vercel                                  |

## Getting started

### Prerequisites

- [Bun](https://bun.sh) installed
- A [Neon](https://neon.tech) project with Auth provisioned
- API keys for: AgentMail, Browserbase, Anthropic, Sentry

### Setup

```bash
# Install dependencies
bun install

# Copy env template and fill in values
cp .env.local.example .env.local

# Push database schema to Neon
bun run db:push

# Start dev server
bun run dev
```

### Environment variables

| Variable                    | Description                          |
| --------------------------- | ------------------------------------ |
| `DATABASE_URL`              | Neon PostgreSQL connection string    |
| `NEON_AUTH_BASE_URL`        | Neon Auth service URL                |
| `NEXT_PUBLIC_NEON_AUTH_URL` | Public Neon Auth URL (client-side)   |
| `NEON_AUTH_COOKIE_SECRET`   | Session cookie secret (min 32 chars) |
| `AGENTMAIL_API_KEY`         | AgentMail API key                    |
| `BROWSERBASE_API_KEY`       | Browserbase API key                  |
| `BROWSERBASE_PROJECT_ID`    | Browserbase project ID               |
| `ANTHROPIC_API_KEY`         | Anthropic API key (for AI recovery)  |
| `SENTRY_DSN`                | Sentry DSN for error tracking        |
| `NEXT_PUBLIC_APP_URL`       | Public app URL                       |

## Scripts

```bash
bun run dev          # Start dev server (Turbopack)
bun run build        # Production build
bun run lint         # ESLint + Prettier check
bun run format       # Format all files with Prettier
bun run db:generate  # Generate Drizzle migrations
bun run db:push      # Push schema to Neon
bun run db:studio    # Open Drizzle Studio
```

## Architecture

```
src/
  app/
    api/
      agents/          # Agent CRUD + SSE stream
      auth/[...path]/  # Neon Auth handler
      inbox/           # AgentMail inbox messages
      vault/           # Credential retrieval
    auth/[path]/       # Sign-in / sign-up pages
    dashboard/         # Main app (protected)
      agents/[id]/     # Agent detail with tabs
  components/
    agents/            # Agent forms, status grid, activity log
    inbox/             # Email inbox viewer
    landing/           # Hero, platform grid, how-it-works
    layout/            # Sidebar, header
    ui/                # shadcn/ui primitives
    vault/             # Credential table with reveal/copy
  db/
    index.ts           # Drizzle client (neon-http)
    schema.ts          # Tables: agents, setupTasks, credentials, auditLog
  hooks/               # useTaskStream (SSE), useCopyToClipboard
  lib/
    agentmail.ts       # Inbox creation, email polling, OTP extraction
    auth/              # Neon Auth server + client instances
    browser.ts         # Browserbase + Playwright CDP
    events.ts          # EventEmitter for SSE
    orchestrator.ts    # Signup orchestration + AI recovery
    platforms.ts       # Platform configs (URLs, selectors, CAPTCHA flags)
    vault.ts           # Password generation + credential CRUD
  types/               # Zod schemas, platform types, SSE event types
proxy.ts               # Auth middleware (protects /dashboard, /api)
```
