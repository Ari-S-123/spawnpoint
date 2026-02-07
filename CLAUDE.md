# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun run dev          # Start dev server (Turbopack)
bun run build        # Production build
bun run lint         # ESLint + Prettier check
bun run format       # Format all files with Prettier
bun run db:generate  # Generate Drizzle migrations
bun run db:push      # Push schema to Neon PostgreSQL
bun run db:studio    # Open Drizzle Studio
```

Package manager is **Bun**. Never fall back to npm.

## Architecture

SpawnPoint automates account creation across 6 platforms (Instagram, TikTok, X/Twitter, Mintlify, Vercel, Sentry) for AI agents. Built for the BetterHack Hackathon @ YC.

### Core Flow

1. User creates an agent → POST `/api/agents` provisions a disposable email via AgentMail, generates passwords, inserts 6 `setupTasks` (one per platform)
2. `src/lib/orchestrator.ts` runs signup tasks: non-CAPTCHA platforms (vercel, sentry, mintlify) in parallel, CAPTCHA-likely (instagram, tiktok, twitter) sequentially
3. Each signup: Browserbase cloud browser → fill form → wait for verification email → extract OTP/link → complete signup
4. On failure: `aiGuidedRecovery()` uses Claude Opus 4.6 with extended thinking to analyze a screenshot and suggest corrective actions
5. Real-time progress via SSE: `src/lib/events.ts` EventEmitter → `/api/agents/[agentId]/stream` → `useTaskStream()` hook on client

### Auth

- `@neondatabase/auth` v0.2.0-beta.1 — uses `createNeonAuth()` from `@neondatabase/auth/next/server`
- Single shared instance in `src/lib/auth/server.ts` exposes `.handler()`, `.middleware()`, `.getSession()`
- Session access pattern: `const { data: session } = await auth.getSession()` (must destructure `data`)
- `proxy.ts` (root) protects `/dashboard/*` and `/api/agents/*`, `/api/inbox/*`, `/api/vault/*`
- Client provider: `<NeonAuthUIProvider>` from `@neondatabase/auth/react` wraps app in `layout.tsx`

### Database

Drizzle ORM with `@neondatabase/serverless` neon-http driver. Schema in `src/db/schema.ts`:

- **agents** — name, email (AgentMail address), inboxId, operatorId (auth user)
- **setupTasks** — agentId FK, platform (enum), status (enum), browserSessionId, errorMessage, metadata (jsonb)
- **credentials** — agentId FK, platform, email, password, apiKey, additionalData (jsonb). Plain storage, no encryption.
- **auditLog** — operatorId, action, resourceId

Key constraint: DB updates in the orchestrator must filter by BOTH `agentId` AND `platform` using `and()` from drizzle-orm.

### Key Modules

| Module                    | Purpose                                                     |
| ------------------------- | ----------------------------------------------------------- |
| `src/lib/orchestrator.ts` | Signup orchestration + AI recovery with Claude              |
| `src/lib/browser.ts`      | Browserbase + Playwright CDP session management             |
| `src/lib/agentmail.ts`    | Inbox creation, email polling, OTP extraction               |
| `src/lib/vault.ts`        | Password generation + credential CRUD (Neon DB, not Vault)  |
| `src/lib/platforms.ts`    | Platform configs: signup URLs, CSS selectors, CAPTCHA flags |
| `src/lib/events.ts`       | EventEmitter singleton for SSE task updates                 |

### Frontend

- Server Components by default; `'use client'` only where needed (forms, SSE, interactive UI)
- shadcn/ui components in `src/components/ui/` (New York style)
- Landing page: luxury dark aesthetic — zinc-950 background, amber accents, Playfair Display serif font
- Dashboard: Shadcn Sidebar + Tabs layout with 4 tabs per agent (Status, Inbox, Credentials, Activity)

## Gotchas

- `@neondatabase/auth` has NO `authApiHandler` or `createAuthServer` exports — only `createNeonAuth()`
- Drizzle has NO `timestamptz` — use `timestamp('col', { withTimezone: true })`
- AgentMail: named import `{ AgentMailClient }` (no default). `Inbox` type has `inboxId`/`displayName` (no `username`). Message list/get use positional args, not objects. Timestamps are `Date` objects.
- `reactCompiler` is a top-level Next.js 16 config key, not under `experimental`
- `playwright-core` only works in Node.js runtime (not Bun), listed in `serverExternalPackages`
- Next.js 16 async params: `params: Promise<{ id: string }>` — must `await params`

## Environment Variables

Required in `.env.local`: `DATABASE_URL`, `NEON_AUTH_BASE_URL`, `NEXT_PUBLIC_NEON_AUTH_URL`, `NEON_AUTH_COOKIE_SECRET` (min 32 chars), `AGENTMAIL_API_KEY`, `BROWSERBASE_API_KEY`, `BROWSERBASE_PROJECT_ID`, `ANTHROPIC_API_KEY`, `SENTRY_DSN`, `NEXT_PUBLIC_APP_URL`
