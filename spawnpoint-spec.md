# SpawnPoint — Technical Specification & Implementation Plan

## BetterHack Hackathon Submission

**Project Codename:** `spawnpoint`
**Version:** 1.0.0
**Last Updated:** 2026-02-07

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Hackathon Context & Constraints](#2-hackathon-context--constraints)
3. [Architecture Overview](#3-architecture-overview)
4. [Tech Stack — Pinned Versions & Rationale](#4-tech-stack--pinned-versions--rationale)
5. [Environment Variables & Secrets](#5-environment-variables--secrets)
6. [Project Scaffolding & Initial Setup](#6-project-scaffolding--initial-setup)
7. [Database Schema (Neon PostgreSQL)](#7-database-schema-neon-postgresql)
8. [Authentication (Neon Auth + Better Auth)](#8-authentication-neon-auth--better-auth)
9. [Core Backend — API Routes & Server Actions](#9-core-backend--api-routes--server-actions)
10. [AgentMail Integration](#10-agentmail-integration)
11. [Browserbase + Playwright Integration](#11-browserbase--playwright-integration)
12. [Credential Encryption (HashiCorp Vault)](#12-credential-encryption-hashicorp-vault)
13. [AI Orchestration Layer (Vercel AI SDK + Claude)](#13-ai-orchestration-layer-vercel-ai-sdk--claude)
14. [Real-Time Updates (Server-Sent Events)](#14-real-time-updates-server-sent-events)
15. [Frontend — Pages, Components & UI](#15-frontend--pages-components--ui)
16. [Deployment on Vercel](#16-deployment-on-vercel)
17. [Monitoring & Error Tracking (Sentry)](#17-monitoring--error-tracking-sentry)
18. [Implementation Phases & Sprint Plan](#18-implementation-phases--sprint-plan)
19. [File & Directory Structure](#19-file--directory-structure)
20. [Risk Matrix & Mitigations](#20-risk-matrix--mitigations)
21. [Testing Strategy](#21-testing-strategy)
22. [Post-Hackathon Roadmap](#22-post-hackathon-roadmap)

---

## 1. Executive Summary

**SpawnPoint** is a one-click agent onboarding tool that automates the creation and configuration of accounts across six platforms (Instagram, TikTok, X/Twitter, Mintlify, Vercel, Sentry) for new AI agents. It leverages AgentMail for disposable email inboxes, Browserbase for cloud-hosted browser automation, and Claude Opus 4.6 (via Vercel AI SDK) as an intelligent orchestrator that can reason about signup flow failures and adaptively recover.

The core value proposition: what currently takes an operator 30-60 minutes of manual signup drudgery per agent is reduced to a single button press and ~2 minutes of automated execution.

### Key Differentiators

- **AI-Driven Adaptive Signup:** Claude Opus 4.6 with extended thinking acts as a meta-orchestrator — when Playwright scripts fail (DOM changes, unexpected CAPTCHAs, new form fields), the AI can reason about the failure, analyze screenshots, and generate corrective actions in real-time.
- **Single Inbox, Multi-Platform Verification:** AgentMail provides a unified inbox where all verification emails land, with built-in OTP extraction.
- **Cloud Browser Automation:** Browserbase provides stealth-mode headless browsers with proxies, eliminating the need to run local Playwright instances and avoiding bot-detection.
- **Secure Credential Vault:** HashiCorp Vault KV v2 engine stores per-platform credentials with versioning and audit trails.

---

## 2. Hackathon Context & Constraints

| Constraint              | Detail                                                                 |
| ----------------------- | ---------------------------------------------------------------------- |
| **Event**               | BetterHack @ Y Combinator                                              |
| **Duration**            | 24 hours                                                               |
| **Team Size**           | 1-4 members                                                            |
| **Prize**               | Guaranteed YC interview + credits for 1st place                        |
| **Core Requirement**    | Build with Better Auth (use Neon Auth which is powered by Better Auth) |
| **No Pre-Written Code** | All code must be written during the hackathon; pre-planning is allowed |

### Scope Decisions for Hackathon MVP

**IN SCOPE (MVP):**

- AgentMail inbox creation
- Automated signup for **Vercel** and **Sentry** (highest success probability — no CAPTCHAs)
- Manual-assist flow for social platforms (Instagram, TikTok, X) with live browser view
- Mintlify signup automation
- Live status dashboard with SSE
- Credential vault (view/copy)
- Neon Auth for operator authentication

**DEFERRED (Post-Hackathon):**

- Full CAPTCHA-solving integration
- CodeRabbit and LinkedIn automation
- Neon database auto-provisioning per agent
- GitHub org/repo auto-provisioning
- Webhook-based email processing (polling-first for MVP)

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         OPERATOR BROWSER                            │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────────┐ │
│  │  Landing Page │  │  Auth Pages  │  │    Agent Dashboard        │ │
│  │  (marketing)  │  │  (Neon Auth) │  │  ┌─────────────────────┐ │ │
│  │              │  │              │  │  │ Create Agent Form    │ │ │
│  │              │  │              │  │  │ Live Status (SSE)    │ │ │
│  │              │  │              │  │  │ Inbox Viewer         │ │ │
│  │              │  │              │  │  │ Credential Vault     │ │ │
│  │              │  │              │  │  │ Live Browser View    │ │ │
│  └──────────────┘  └──────────────┘  │  └─────────────────────┘ │ │
│                                       └───────────────────────────┘ │
└─────────────────────────────┬───────────────────────────────────────┘
                              │ HTTPS
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      VERCEL EDGE / SERVERLESS                       │
│                                                                     │
│  ┌───────────────┐  ┌───────────────┐  ┌────────────────────────┐  │
│  │ Next.js 16    │  │ API Routes    │  │ AI SDK + Claude 4.6    │  │
│  │ App Router    │  │               │  │ (Orchestrator Agent)   │  │
│  │ React 19      │  │ /api/agents   │  │                        │  │
│  │ Shadcn UI     │  │ /api/tasks    │  │ Tools:                 │  │
│  │               │  │ /api/inbox    │  │  - createInbox         │  │
│  │               │  │ /api/stream   │  │  - launchBrowser       │  │
│  │               │  │               │  │  - checkEmail          │  │
│  └───────────────┘  └───────┬───────┘  │  - extractOTP          │  │
│                             │          │  - fillForm             │  │
│                             │          │  - screenshotPage       │  │
│                             │          └────────────┬───────────┘  │
└─────────────────────────────┼───────────────────────┼──────────────┘
                              │                       │
          ┌───────────────────┼───────────────────────┼────────────┐
          │                   │                       │            │
          ▼                   ▼                       ▼            ▼
┌──────────────┐  ┌────────────────┐  ┌──────────────┐  ┌─────────────┐
│  Neon Postgres│  │  AgentMail API │  │  Browserbase │  │  HashiCorp  │
│              │  │               │  │  (Playwright) │  │  Vault      │
│  - agents    │  │  - inboxes    │  │              │  │  (KV v2)    │
│  - tasks     │  │  - messages   │  │  - sessions  │  │             │
│  - users     │  │  - OTP extract│  │  - stealth   │  │  - passwords│
│              │  │               │  │  - proxies   │  │  - api_keys │
└──────────────┘  └────────────────┘  │  - live view │  │  - tokens   │
                                      └──────────────┘  └─────────────┘
```

### Data Flow for a Single Agent Setup

1. Operator clicks "Create Agent" with agent name input.
2. `POST /api/agents` creates a DB record and fires the orchestration pipeline.
3. **Step 1 — Email:** AgentMail API creates `{agent-name}@agentmail.to` inbox.
4. **Step 2 — Passwords:** Generate 6 unique passwords (one per platform), encrypt via Vault, store references in DB.
5. **Step 3 — Parallel Signup:** For each platform, launch a Browserbase session → Playwright navigates to signup → fills form → submits.
6. **Step 4 — Verification:** Poll AgentMail inbox for verification emails → extract OTP or verification link → inject back into the Playwright session.
7. **Step 5 — CAPTCHA Fallback:** If CAPTCHA detected, pause the task, notify operator via SSE, expose live browser view for manual intervention.
8. **Step 6 — Completion:** All credentials saved → task statuses updated → operator notified.

---

## 4. Tech Stack — Pinned Versions & Rationale

### Core Framework

| Package      | Version  | Purpose                                                         |
| ------------ | -------- | --------------------------------------------------------------- |
| `next`       | `16.1.6` | App Router, React Server Components, API Routes, Server Actions |
| `react`      | `19.x`   | UI rendering (bundled with Next.js 16)                          |
| `typescript` | `5.7.x`  | Type safety across the entire codebase                          |
| `bun`        | `1.3.8+` | Package manager, runtime, bundler — faster than npm/yarn        |

**Next.js 16 Key Features Used:**

- App Router with nested layouts
- Server Components (default) and Client Components (`'use client'`)
- Route Handlers (`app/api/.../route.ts`) for REST endpoints
- Server Actions for form mutations
- Middleware for auth protection
- Streaming SSR for real-time dashboard

### UI Layer

| Package           | Version | Purpose                                                                                                                            |
| ----------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `shadcn/ui`       | latest  | Component library (Button, Card, Dialog, Toast, Table, Badge, Tabs, Input, Form, Skeleton, Progress, Separator, ScrollArea, Sheet) |
| `tailwindcss`     | `4.x`   | Utility-first CSS (Shadcn uses Tailwind v4)                                                                                        |
| `lucide-react`    | latest  | Icon library (consistent with Shadcn)                                                                                              |
| `sonner`          | latest  | Toast notifications (Shadcn's Toast uses Sonner)                                                                                   |
| `react-hook-form` | latest  | Form state management                                                                                                              |
| `zod`             | `4.x`   | Schema validation for forms and API payloads                                                                                       |

**Shadcn Components to Install:**

```bash
bunx shadcn@latest init
bunx shadcn@latest add button card dialog toast table badge tabs input form \
  skeleton progress separator scroll-area sheet avatar dropdown-menu \
  alert input-otp popover command sidebar navigation-menu
```

### Backend & AI

| Package              | Version | Purpose                                                            |
| -------------------- | ------- | ------------------------------------------------------------------ |
| `ai`                 | `6.x`   | Vercel AI SDK v6 — `generateText`, `streamText`, Agent abstraction |
| `@ai-sdk/anthropic`  | `3.x`   | Anthropic provider for AI SDK                                      |
| `agentmail`          | latest  | AgentMail SDK — inbox creation, message polling, OTP extraction    |
| `playwright-core`    | latest  | Browser automation (used with Browserbase, NOT standalone)         |
| `@browserbasehq/sdk` | latest  | Browserbase SDK — cloud browser sessions                           |
| `node-vault`         | latest  | HashiCorp Vault client for Node.js                                 |

**AI SDK v6 Key Patterns:**

In AI SDK v6, `generateObject` and `streamObject` are deprecated. Use `generateText` / `streamText` with an `output` setting for structured data:

```typescript
import { generateText, Output } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';

const { output } = await generateText({
  model: anthropic('claude-opus-4-6-20250414'),
  output: Output.object({
    schema: z.object({
      action: z.enum(['fill_form', 'click_button', 'extract_otp', 'screenshot']),
      selector: z.string().optional(),
      value: z.string().optional()
    })
  }),
  prompt: 'Analyze this screenshot and determine the next action...'
});
```

**Claude Opus 4.6 Configuration:**

- Model ID: `claude-opus-4-6-20250414` (use the exact model string from the Anthropic provider)
- Extended Thinking: Enabled via `providerOptions.anthropic.thinking.type: 'enabled'`
- Budget Tokens: Set `budgetTokens` for thinking depth control (e.g., `10000` for "high" thinking)

```typescript
const result = await generateText({
  model: anthropic('claude-opus-4-6-20250414'),
  providerOptions: {
    anthropic: {
      thinking: {
        type: 'enabled',
        budgetTokens: 10000
      }
    }
  },
  prompt: '...'
});
```

### Database & Auth

| Package                    | Version | Purpose                                                                                |
| -------------------------- | ------- | -------------------------------------------------------------------------------------- |
| `@neondatabase/auth`       | latest  | Neon Auth SDK (powered by Better Auth) — handles sign-up, sign-in, sessions, email OTP |
| `@neondatabase/serverless` | latest  | Neon serverless driver for PostgreSQL                                                  |
| `drizzle-orm`              | latest  | Type-safe SQL ORM                                                                      |
| `drizzle-kit`              | latest  | Migration tooling                                                                      |

**Neon Auth Setup Summary (from official docs):**

1. Enable Auth in the Neon Console (Project → Branch → Auth → Configuration).
2. Install `@neondatabase/auth`.
3. Set `NEON_AUTH_BASE_URL` env var.
4. Mount `authApiHandler` at `app/api/auth/[...path]/route.ts`.
5. Create `neonAuthMiddleware` in `proxy.ts` for route protection.
6. Create auth client (`lib/auth/client.ts`) and auth server (`lib/auth/server.ts`).
7. Wrap layout with `NeonAuthUIProvider`.
8. Import `@neondatabase/auth/ui/tailwind` in `globals.css`.
9. Create `app/auth/[path]/page.tsx` and `app/account/[path]/page.tsx` for auth views.

### Monitoring

| Package          | Version | Purpose                                |
| ---------------- | ------- | -------------------------------------- |
| `@sentry/nextjs` | latest  | Error tracking, performance monitoring |

---

## 5. Environment Variables & Secrets

Create a `.env.local` file (never committed to git). On Vercel, set these as encrypted environment variables.

```bash
# ============================================================
# Neon Database
# ============================================================
DATABASE_URL="postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require"

# ============================================================
# Neon Auth (Better Auth under the hood)
# ============================================================
NEON_AUTH_BASE_URL="https://ep-xxx.neonauth.us-east-1.aws.neon.tech/neondb/auth"

# ============================================================
# AgentMail
# ============================================================
AGENTMAIL_API_KEY="am_live_xxxxxxxxxxxx"

# ============================================================
# Browserbase
# ============================================================
BROWSERBASE_API_KEY="bb_live_xxxxxxxxxxxx"
BROWSERBASE_PROJECT_ID="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

# ============================================================
# HashiCorp Vault
# ============================================================
VAULT_ADDR="https://vault.example.com:8200"
VAULT_TOKEN="hvs.xxxxxxxxxxxx"
VAULT_MOUNT_PATH="secret"

# ============================================================
# Anthropic (for Vercel AI SDK)
# ============================================================
ANTHROPIC_API_KEY="sk-ant-xxxxxxxxxxxx"

# ============================================================
# Sentry
# ============================================================
SENTRY_DSN="https://xxxxxxxxxxxx@o0.ingest.sentry.io/0"
SENTRY_AUTH_TOKEN="sntrys_xxxxxxxxxxxx"
SENTRY_ORG="your-org"
SENTRY_PROJECT="spawnpoint"

# ============================================================
# App
# ============================================================
NEXT_PUBLIC_APP_URL="https://spawnpoint.vercel.app"
```

**Vercel Deployment Note:** All `VAULT_TOKEN`, `ANTHROPIC_API_KEY`, `AGENTMAIL_API_KEY`, and `BROWSERBASE_API_KEY` values must be set as **Sensitive** environment variables in Vercel's dashboard (Settings → Environment Variables → toggle "Sensitive"). Sensitive variables are encrypted at rest and not exposed in build logs or Vercel's UI after initial creation.

---

## 6. Project Scaffolding & Initial Setup

### Step 1: Create the Next.js 16 Project

```bash
bunx create-next-app@16.1.6 spawnpoint \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --import-alias "@/*" \
  --use-bun

cd spawnpoint
```

### Step 2: Install Dependencies

```bash
# UI
bunx shadcn@latest init
bunx shadcn@latest add button card dialog toast table badge tabs input form \
  skeleton progress separator scroll-area sheet avatar dropdown-menu \
  alert input-otp popover command sidebar navigation-menu

# AI
bun add ai @ai-sdk/anthropic zod

# Database & Auth
bun add @neondatabase/auth @neondatabase/serverless drizzle-orm
bun add -d drizzle-kit

# External Services
bun add agentmail playwright-core @browserbasehq/sdk node-vault

# Monitoring
bun add @sentry/nextjs

# Utilities
bun add nanoid date-fns clsx tailwind-merge
```

### Step 3: Configure TypeScript Strictly

Update `tsconfig.json`:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": false,
    "forceConsistentCasingInFileNames": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

### Step 4: Configure Drizzle

Create `drizzle.config.ts` at the project root:

```typescript
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!
  }
});
```

---

## 7. Database Schema (Neon PostgreSQL)

### Schema Definition (`src/db/schema.ts`)

```typescript
import { pgTable, uuid, text, timestamptz, jsonb, pgEnum } from 'drizzle-orm/pg-core';

/**
 * Enum for the lifecycle status of a platform signup task.
 */
export const taskStatusEnum = pgEnum('task_status', [
  'pending',
  'in_progress',
  'awaiting_verification',
  'needs_human',
  'completed',
  'failed'
]);

/**
 * Enum for the supported platforms.
 */
export const platformEnum = pgEnum('platform', ['instagram', 'tiktok', 'twitter', 'mintlify', 'vercel', 'sentry']);

/**
 * Agents table — each row represents one AI agent being onboarded.
 */
export const agents = pgTable('agents', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Display name of the agent (e.g., "cool-agent-007"). */
  name: text('name').notNull(),
  /** The AgentMail email address created for this agent. */
  email: text('email').notNull(),
  /** The AgentMail inbox ID used for polling/webhook verification emails. */
  inboxId: text('inbox_id').notNull(),
  /** The ID of the operator (Neon Auth user) who initiated the setup. */
  operatorId: text('operator_id').notNull(),
  /** Timestamp of creation. */
  createdAt: timestamptz('created_at').defaultNow().notNull(),
  /** Timestamp of last update. */
  updatedAt: timestamptz('updated_at').defaultNow().notNull()
});

/**
 * Setup tasks table — one row per platform signup attempt per agent.
 */
export const setupTasks = pgTable('setup_tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Foreign key to the agents table. */
  agentId: uuid('agent_id')
    .references(() => agents.id, { onDelete: 'cascade' })
    .notNull(),
  /** Which platform this task is for. */
  platform: platformEnum('platform').notNull(),
  /** Current lifecycle status. */
  status: taskStatusEnum('status').default('pending').notNull(),
  /**
   * Reference to the Vault secret path where credentials are stored.
   * Example: "secret/data/agents/{agent_id}/vercel"
   */
  vaultPath: text('vault_path'),
  /** Browserbase session ID (for live view and debugging). */
  browserSessionId: text('browser_session_id'),
  /** Human-readable error message if the task failed. */
  errorMessage: text('error_message'),
  /** Arbitrary metadata (e.g., signup URL used, retry count). */
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  /** Timestamp of last status change. */
  updatedAt: timestamptz('updated_at').defaultNow().notNull()
});

/**
 * Audit log for credential access events.
 */
export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** The operator who performed the action. */
  operatorId: text('operator_id').notNull(),
  /** The action performed (e.g., "view_credential", "copy_credential", "create_agent"). */
  action: text('action').notNull(),
  /** The resource identifier (e.g., agent ID, task ID). */
  resourceId: text('resource_id'),
  /** Timestamp. */
  createdAt: timestamptz('created_at').defaultNow().notNull()
});
```

### Migrations

```bash
# Generate migration SQL from schema changes
bun drizzle-kit generate

# Push directly to Neon (for rapid hackathon iteration)
bun drizzle-kit push
```

### Database Client (`src/db/index.ts`)

```typescript
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

/**
 * Creates a Neon HTTP-based Drizzle ORM client.
 * Uses the serverless driver optimized for edge/serverless environments.
 */
const sql = neon(process.env.DATABASE_URL!);

export const db = drizzle(sql, { schema });
```

---

## 8. Authentication (Neon Auth + Better Auth)

Neon Auth is built on top of Better Auth and provides pre-built UI components. This satisfies the hackathon's requirement to use Better Auth.

### 8.1 — API Route Handler

**File:** `src/app/api/auth/[...path]/route.ts`

```typescript
import { authApiHandler } from '@neondatabase/auth/next/server';

/**
 * Catch-all route handler for all Neon Auth API endpoints.
 * Handles sign-in, sign-up, session management, email OTP, etc.
 */
export const { GET, POST } = authApiHandler();
```

### 8.2 — Middleware for Route Protection

**File:** `proxy.ts` (project root)

```typescript
import { neonAuthMiddleware } from '@neondatabase/auth/next/server';

/**
 * Neon Auth middleware that protects routes matching the `matcher` pattern.
 * Unauthenticated users are redirected to the sign-in page.
 */
export default neonAuthMiddleware({
  loginUrl: '/auth/sign-in'
});

export const config = {
  matcher: ['/dashboard/:path*', '/api/agents/:path*', '/api/tasks/:path*', '/api/inbox/:path*', '/api/vault/:path*']
};
```

### 8.3 — Auth Clients

**File:** `src/lib/auth/client.ts`

```typescript
'use client';

import { createAuthClient } from '@neondatabase/auth/next';

/**
 * Client-side auth client for use in Client Components.
 * Provides hooks like `useSession()`, `useUser()`, etc.
 */
export const authClient = createAuthClient();
```

**File:** `src/lib/auth/server.ts`

```typescript
import { createAuthServer } from '@neondatabase/auth/next/server';

/**
 * Server-side auth client for use in Server Components and Server Actions.
 * Provides `getSession()`, `getUser()`, etc.
 */
export const authServer = createAuthServer();
```

### 8.4 — Root Layout with Auth Provider

**File:** `src/app/layout.tsx`

```tsx
import { authClient } from '@/lib/auth/client';
import { NeonAuthUIProvider, UserButton } from '@neondatabase/auth/react';
import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'SpawnPoint — One-Click Agent Setup',
  description: 'Automated account and credential setup for AI agents.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <NeonAuthUIProvider
          authClient={authClient}
          redirectTo="/dashboard"
          emailOTP
          credentials={{ forgotPassword: true }}
        >
          {children}
        </NeonAuthUIProvider>
      </body>
    </html>
  );
}
```

### 8.5 — Auth Pages

**File:** `src/app/auth/[path]/page.tsx`

```tsx
import { AuthView } from '@neondatabase/auth/react';

export const dynamicParams = false;

export default async function AuthPage({ params }: { params: Promise<{ path: string }> }) {
  const { path } = await params;
  return (
    <main className="container mx-auto flex grow flex-col items-center justify-center gap-3 p-4 md:p-6">
      <AuthView path={path} />
    </main>
  );
}
```

### 8.6 — Global CSS Import

**File:** `src/app/globals.css` (add at top)

```css
@import 'tailwindcss';
@import '@neondatabase/auth/ui/tailwind';
```

---

## 9. Core Backend — API Routes & Server Actions

### 9.1 — Type Definitions (`src/types/index.ts`)

```typescript
import { z } from 'zod';

/** Schema for the "Create Agent" form input. */
export const CreateAgentSchema = z.object({
  name: z
    .string()
    .min(2, 'Agent name must be at least 2 characters.')
    .max(48, 'Agent name must be at most 48 characters.')
    .regex(/^[a-zA-Z0-9-]+$/, 'Only alphanumeric characters and hyphens allowed.')
});

export type CreateAgentInput = z.infer<typeof CreateAgentSchema>;

/** The six target platforms. */
export const PLATFORMS = ['instagram', 'tiktok', 'twitter', 'mintlify', 'vercel', 'sentry'] as const;

export type Platform = (typeof PLATFORMS)[number];

/** Status emitted via SSE to the dashboard. */
export type TaskStatusEvent = {
  taskId: string;
  agentId: string;
  platform: Platform;
  status: 'pending' | 'in_progress' | 'awaiting_verification' | 'needs_human' | 'completed' | 'failed';
  message: string;
  browserSessionId?: string;
  timestamp: string;
};

/** Platform signup configuration. */
export type PlatformConfig = {
  platform: Platform;
  signupUrl: string;
  /** Whether this platform typically has CAPTCHAs on signup. */
  captchaLikely: boolean;
  /** Selectors and flow hints for the Playwright automation. */
  selectors: {
    emailInput: string;
    passwordInput: string;
    submitButton: string;
    otpInput?: string;
    dashboardUrl?: string;
  };
};

/** Credential data stored in Vault. */
export type PlatformCredential = {
  email: string;
  password: string;
  apiKey?: string;
  additionalTokens?: Record<string, string>;
  createdAt: string;
};
```

### 9.2 — Platform Configurations (`src/lib/platforms.ts`)

```typescript
import type { PlatformConfig } from '@/types';

/**
 * Static configuration for each platform's signup flow.
 * Selectors are best-effort starting points — the AI orchestrator
 * can adapt dynamically if these fail.
 */
export const PLATFORM_CONFIGS: Record<string, PlatformConfig> = {
  vercel: {
    platform: 'vercel',
    signupUrl: 'https://vercel.com/signup',
    captchaLikely: false,
    selectors: {
      emailInput: 'input[name="email"]',
      passwordInput: 'input[name="password"]',
      submitButton: 'button[type="submit"]',
      dashboardUrl: '**/dashboard**'
    }
  },
  sentry: {
    platform: 'sentry',
    signupUrl: 'https://sentry.io/signup/',
    captchaLikely: false,
    selectors: {
      emailInput: '#id_username',
      passwordInput: '#id_password',
      submitButton: 'button[type="submit"]',
      dashboardUrl: '**/organizations/**'
    }
  },
  mintlify: {
    platform: 'mintlify',
    signupUrl: 'https://dashboard.mintlify.com/signup',
    captchaLikely: false,
    selectors: {
      emailInput: 'input[type="email"]',
      passwordInput: 'input[type="password"]',
      submitButton: 'button[type="submit"]'
    }
  },
  instagram: {
    platform: 'instagram',
    signupUrl: 'https://www.instagram.com/accounts/emailsignup/',
    captchaLikely: true,
    selectors: {
      emailInput: 'input[name="emailOrPhone"]',
      passwordInput: 'input[name="password"]',
      submitButton: 'button[type="submit"]',
      otpInput: 'input[name="confirmationCode"]'
    }
  },
  tiktok: {
    platform: 'tiktok',
    signupUrl: 'https://www.tiktok.com/signup',
    captchaLikely: true,
    selectors: {
      emailInput: 'input[name="email"]',
      passwordInput: 'input[name="password"]',
      submitButton: 'button[type="submit"]'
    }
  },
  twitter: {
    platform: 'twitter',
    signupUrl: 'https://x.com/i/flow/signup',
    captchaLikely: true,
    selectors: {
      emailInput: 'input[name="email"]',
      passwordInput: 'input[name="password"]',
      submitButton: 'button[data-testid="LoginForm_Login_Button"]'
    }
  }
};
```

### 9.3 — Create Agent API Route

**File:** `src/app/api/agents/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { agents, setupTasks } from '@/db/schema';
import { CreateAgentSchema, PLATFORMS } from '@/types';
import { createAgentEmail } from '@/lib/agentmail';
import { generatePassword, storeCredential } from '@/lib/vault';
import { enqueueSignupTasks } from '@/lib/orchestrator';
import { authServer } from '@/lib/auth/server';

/**
 * POST /api/agents
 *
 * Creates a new agent record, provisions an AgentMail inbox,
 * generates per-platform passwords, stores them in Vault,
 * and enqueues signup tasks for parallel execution.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Authenticate the operator
  const session = await authServer.getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Validate input
  const body = await request.json();
  const parsed = CreateAgentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const { name } = parsed.data;
  const sanitizedName = name.toLowerCase().replace(/\s+/g, '-');

  try {
    // 3. Create AgentMail inbox
    const inbox = await createAgentEmail(sanitizedName);
    const email = `${inbox.username}@agentmail.to`;

    // 4. Insert agent record
    const [agent] = await db
      .insert(agents)
      .values({
        name: sanitizedName,
        email,
        inboxId: inbox.inbox_id,
        operatorId: session.user.id
      })
      .returning();

    if (!agent) {
      throw new Error('Failed to insert agent record.');
    }

    // 5. Generate passwords, store in Vault, create task records
    const taskRecords = await Promise.all(
      PLATFORMS.map(async (platform) => {
        const password = generatePassword();
        const vaultPath = `secret/data/agents/${agent.id}/${platform}`;

        await storeCredential(vaultPath, {
          email,
          password,
          createdAt: new Date().toISOString()
        });

        const [task] = await db
          .insert(setupTasks)
          .values({
            agentId: agent.id,
            platform,
            status: 'pending',
            vaultPath
          })
          .returning();

        return task;
      })
    );

    // 6. Enqueue the signup orchestration (non-blocking)
    enqueueSignupTasks(agent.id, email, inbox.inbox_id).catch(console.error);

    return NextResponse.json({ agent, tasks: taskRecords }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/agents] Error:', error);
    return NextResponse.json({ error: 'Failed to create agent.' }, { status: 500 });
  }
}
```

### 9.4 — Task Status SSE Endpoint

**File:** `src/app/api/agents/[agentId]/stream/route.ts`

```typescript
import { NextRequest } from 'next/server';
import { getTaskEventEmitter } from '@/lib/events';

/**
 * GET /api/agents/:agentId/stream
 *
 * Server-Sent Events endpoint for real-time task status updates.
 * The client connects once and receives a stream of TaskStatusEvent objects.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
): Promise<Response> {
  const { agentId } = await params;
  const emitter = getTaskEventEmitter();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      /** Sends a formatted SSE message to the client. */
      const send = (data: unknown): void => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      /** Handler for task events scoped to this agent. */
      const handler = (event: { agentId: string; [key: string]: unknown }): void => {
        if (event.agentId === agentId) {
          send(event);
        }
      };

      emitter.on('task-update', handler);

      // Send a heartbeat every 30s to keep the connection alive
      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(': heartbeat\n\n'));
      }, 30_000);

      // Cleanup on abort
      request.signal.addEventListener('abort', () => {
        emitter.off('task-update', handler);
        clearInterval(heartbeat);
        controller.close();
      });
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    }
  });
}
```

---

## 10. AgentMail Integration

### Module: `src/lib/agentmail.ts`

```typescript
import AgentMail from 'agentmail';

/**
 * Singleton AgentMail client.
 * The SDK handles authentication via the AGENTMAIL_API_KEY env var.
 */
const client = new AgentMail({ apiKey: process.env.AGENTMAIL_API_KEY! });

/**
 * Creates a new AgentMail inbox for the given agent name.
 *
 * @param agentName - The sanitized agent name (lowercase, hyphens only).
 * @returns The created inbox object containing `inbox_id`, `username`, etc.
 * @throws If the AgentMail API returns an error (e.g., username taken).
 */
export async function createAgentEmail(agentName: string): Promise<{
  inbox_id: string;
  username: string;
}> {
  const inbox = await client.inboxes.create({
    username: agentName,
    domain: 'agentmail.to'
  });

  return {
    inbox_id: inbox.inbox_id,
    username: inbox.username
  };
}

/**
 * Polls the AgentMail inbox for a verification email from a specific platform.
 * Attempts up to `maxAttempts` times with a 3-second delay between polls.
 *
 * @param inboxId - The AgentMail inbox ID to poll.
 * @param platform - The platform name to match against sender/subject.
 * @param maxAttempts - Maximum number of poll attempts (default: 30 = ~90 seconds).
 * @returns An object with the verification type ('otp' or 'link') and the extracted value.
 * @throws If no verification email is found within the polling window.
 */
export async function waitForVerification(
  inboxId: string,
  platform: string,
  maxAttempts = 30
): Promise<{ type: 'otp'; value: string } | { type: 'link'; value: string }> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const messages = await client.inboxes.messages.list({ inbox_id: inboxId });

    const verificationEmail = messages.find(
      (msg: { from?: string; subject?: string }) =>
        msg.from?.toLowerCase().includes(platform) || msg.subject?.match(/verify|confirm|code|welcome|activate/i)
    );

    if (verificationEmail) {
      const message = await client.inboxes.messages.get({
        inbox_id: inboxId,
        message_id: verificationEmail.message_id
      });

      const textContent = message.text ?? message.html ?? '';

      // Try OTP extraction first (4-8 digit codes)
      const otpMatch = textContent.match(/\b\d{4,8}\b/);
      if (otpMatch?.[0]) {
        return { type: 'otp', value: otpMatch[0] };
      }

      // Try verification link extraction
      const linkMatch = textContent.match(/https?:\/\/[^\s"'<>]+(?:verify|confirm|activate|token|code)[^\s"'<>]*/i);
      if (linkMatch?.[0]) {
        return { type: 'link', value: linkMatch[0] };
      }
    }

    // Wait 3 seconds before next poll
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  throw new Error(`No verification email from ${platform} after ${maxAttempts} attempts.`);
}

/**
 * Lists all messages in an inbox (for the inbox viewer UI).
 *
 * @param inboxId - The AgentMail inbox ID to list messages for.
 * @returns Array of message summaries.
 */
export async function listInboxMessages(inboxId: string): Promise<
  Array<{
    message_id: string;
    from: string;
    subject: string;
    date: string;
    snippet: string;
  }>
> {
  const messages = await client.inboxes.messages.list({ inbox_id: inboxId });
  return messages.map((msg: Record<string, unknown>) => ({
    message_id: String(msg.message_id ?? ''),
    from: String(msg.from ?? 'Unknown'),
    subject: String(msg.subject ?? '(No subject)'),
    date: String(msg.date ?? ''),
    snippet: String(msg.snippet ?? '')
  }));
}
```

---

## 11. Browserbase + Playwright Integration

### Module: `src/lib/browser.ts`

Browserbase provides cloud-hosted Chromium instances with stealth mode, residential proxies, and session recording. Playwright connects to these remote sessions via CDP (Chrome DevTools Protocol).

**Critical Note from Browserbase docs:** `Bun does not currently support Playwright.` This means the Playwright automation must run in Node.js serverless functions on Vercel, NOT in Bun's runtime. Vercel's serverless functions use Node.js by default, so this is not a blocker — the `playwright-core` import will work correctly in API routes deployed to Vercel.

```typescript
import { chromium, type Page, type Browser } from 'playwright-core';
import Browserbase from '@browserbasehq/sdk';

/**
 * Singleton Browserbase SDK client.
 */
const bb = new Browserbase({
  apiKey: process.env.BROWSERBASE_API_KEY!
});

/**
 * Creates a new Browserbase session and returns a connected Playwright browser + page.
 * The session runs in stealth mode with residential proxies.
 *
 * @returns An object with `browser`, `page`, and `sessionId` for live view.
 */
export async function createBrowserSession(): Promise<{
  browser: Browser;
  page: Page;
  sessionId: string;
}> {
  const session = await bb.sessions.create({
    projectId: process.env.BROWSERBASE_PROJECT_ID!
  });

  const browser = await chromium.connectOverCDP(session.connectUrl);
  const defaultContext = browser.contexts()[0];

  if (!defaultContext) {
    throw new Error('Browserbase session has no default context.');
  }

  const page = defaultContext.pages()[0];

  if (!page) {
    throw new Error('Browserbase session has no default page.');
  }

  return {
    browser,
    page,
    sessionId: session.id
  };
}

/**
 * Performs a deterministic Playwright signup flow for a given platform.
 *
 * @param page - The Playwright Page instance (connected to Browserbase).
 * @param config - Platform-specific selectors and URLs.
 * @param email - The agent's email address.
 * @param password - The generated password for this platform.
 * @returns 'completed' if the flow succeeded, 'captcha' if a CAPTCHA was detected.
 * @throws On unexpected errors (timeouts, navigation failures, etc.).
 */
export async function performSignup(
  page: Page,
  config: {
    signupUrl: string;
    selectors: {
      emailInput: string;
      passwordInput: string;
      submitButton: string;
    };
  },
  email: string,
  password: string
): Promise<'completed' | 'captcha'> {
  await page.goto(config.signupUrl, { timeout: 30_000, waitUntil: 'domcontentloaded' });

  // Check for CAPTCHA before attempting form fill
  const captchaFrame = await page.$(
    'iframe[src*="captcha"], iframe[src*="recaptcha"], [class*="captcha"], [id*="captcha"]'
  );
  if (captchaFrame) {
    return 'captcha';
  }

  // Fill the signup form
  await page.waitForSelector(config.selectors.emailInput, { timeout: 10_000 });
  await page.fill(config.selectors.emailInput, email);
  await page.fill(config.selectors.passwordInput, password);
  await page.click(config.selectors.submitButton);

  // Brief wait to detect if a CAPTCHA appears post-submission
  await page.waitForTimeout(3000);

  const postSubmitCaptcha = await page.$('iframe[src*="captcha"], iframe[src*="recaptcha"], [class*="captcha"]');
  if (postSubmitCaptcha) {
    return 'captcha';
  }

  return 'completed';
}

/**
 * Injects an OTP code into a verification input field on the current page.
 *
 * @param page - The Playwright Page instance.
 * @param otp - The OTP code string.
 * @param selector - CSS selector for the OTP input (defaults to common patterns).
 */
export async function injectOTP(
  page: Page,
  otp: string,
  selector = 'input[name="code"], input[name="confirmationCode"], input[name="otp"], input[type="tel"]'
): Promise<void> {
  await page.waitForSelector(selector, { timeout: 10_000 });
  await page.fill(selector, otp);

  // Look for a submit/verify button near the OTP input
  const verifyButton = await page.$(
    'button:has-text("Verify"), button:has-text("Confirm"), button:has-text("Submit"), button[type="submit"]'
  );
  if (verifyButton) {
    await verifyButton.click();
  }
}

/**
 * Takes a screenshot of the current page state (for AI analysis or debugging).
 *
 * @param page - The Playwright Page instance.
 * @returns Base64-encoded PNG screenshot.
 */
export async function takeScreenshot(page: Page): Promise<string> {
  const buffer = await page.screenshot({ type: 'png', fullPage: false });
  return buffer.toString('base64');
}
```

---

## 12. Credential Encryption (HashiCorp Vault)

### Module: `src/lib/vault.ts`

HashiCorp Vault's KV v2 secrets engine stores per-agent, per-platform credentials with automatic versioning. The Node.js `node-vault` client communicates over HTTP with token-based auth.

```typescript
import vault from 'node-vault';
import { randomBytes } from 'crypto';
import type { PlatformCredential } from '@/types';

/**
 * Singleton Vault client.
 * Authenticates using a Vault token from the environment.
 */
const vaultClient = vault({
  apiVersion: 'v1',
  endpoint: process.env.VAULT_ADDR!,
  token: process.env.VAULT_TOKEN!
});

/**
 * Generates a cryptographically secure password.
 *
 * @param length - The desired password length (default: 24).
 * @returns A random alphanumeric string suitable for platform signups.
 */
export function generatePassword(length = 24): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*';
  const bytes = randomBytes(length);
  return Array.from(bytes)
    .map((byte) => chars[byte % chars.length])
    .join('');
}

/**
 * Stores a platform credential in Vault's KV v2 engine.
 *
 * @param path - The Vault path (e.g., "secret/data/agents/{id}/vercel").
 * @param credential - The credential data to store.
 */
export async function storeCredential(path: string, credential: PlatformCredential): Promise<void> {
  await vaultClient.write(path, {
    data: credential
  });
}

/**
 * Retrieves a platform credential from Vault.
 *
 * @param path - The Vault path to read from.
 * @returns The stored credential data, or undefined if not found.
 */
export async function getCredential(path: string): Promise<PlatformCredential | undefined> {
  try {
    const result = await vaultClient.read(path);
    return result.data?.data as PlatformCredential | undefined;
  } catch (error) {
    // Vault returns 404 for missing secrets
    if ((error as { statusCode?: number }).statusCode === 404) {
      return undefined;
    }
    throw error;
  }
}

/**
 * Lists all credential paths for a given agent.
 *
 * @param agentId - The agent's UUID.
 * @returns Array of platform names that have stored credentials.
 */
export async function listAgentCredentials(agentId: string): Promise<string[]> {
  try {
    const result = await vaultClient.list(`${process.env.VAULT_MOUNT_PATH}/metadata/agents/${agentId}`);
    return (result.data?.keys as string[]) ?? [];
  } catch {
    return [];
  }
}
```

**Hackathon Shortcut:** If standing up a full Vault instance is too time-consuming during the 24-hour window, fall back to Vercel's encrypted environment variables for a subset of credentials, or use an encrypted JSON blob in Neon with `pgcrypto`. Document this tradeoff explicitly in the demo.

---

## 13. AI Orchestration Layer (Vercel AI SDK + Claude)

This is the core differentiator. Instead of purely deterministic Playwright scripts that break when a signup form changes, Claude Opus 4.6 acts as an intelligent meta-orchestrator.

### Module: `src/lib/orchestrator.ts`

```typescript
import { generateText, Output } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { db } from '@/db';
import { setupTasks } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { PLATFORM_CONFIGS } from '@/lib/platforms';
import { createBrowserSession, performSignup, injectOTP, takeScreenshot } from '@/lib/browser';
import { waitForVerification } from '@/lib/agentmail';
import { getCredential } from '@/lib/vault';
import { emitTaskUpdate } from '@/lib/events';
import type { Platform } from '@/types';

/**
 * The Claude model instance configured with extended thinking.
 */
const model = anthropic('claude-opus-4-6-20250414');

/**
 * Schema for the AI's next-action decision.
 */
const NextActionSchema = z.object({
  action: z.enum([
    'fill_form',
    'click_element',
    'wait_for_email',
    'inject_otp',
    'navigate_link',
    'take_screenshot',
    'report_captcha',
    'report_success',
    'report_failure'
  ]),
  selector: z.string().optional(),
  value: z.string().optional(),
  reasoning: z.string()
});

/**
 * Enqueues and executes signup tasks for all platforms in parallel.
 * This is the top-level entry point called after agent creation.
 *
 * @param agentId - The agent's UUID.
 * @param email - The agent's AgentMail email address.
 * @param inboxId - The AgentMail inbox ID for verification polling.
 */
export async function enqueueSignupTasks(agentId: string, email: string, inboxId: string): Promise<void> {
  // Prioritize non-CAPTCHA platforms first
  const orderedPlatforms: Platform[] = ['vercel', 'sentry', 'mintlify', 'instagram', 'tiktok', 'twitter'];

  // Run non-CAPTCHA platforms in parallel, social platforms sequentially
  const nonCaptcha = orderedPlatforms.filter((p) => !PLATFORM_CONFIGS[p]?.captchaLikely);
  const captchaLikely = orderedPlatforms.filter((p) => PLATFORM_CONFIGS[p]?.captchaLikely);

  // Launch non-CAPTCHA signups in parallel
  await Promise.allSettled(nonCaptcha.map((platform) => executePlatformSignup(agentId, platform, email, inboxId)));

  // Launch CAPTCHA-likely signups sequentially (to manage operator attention)
  for (const platform of captchaLikely) {
    await executePlatformSignup(agentId, platform, email, inboxId);
  }
}

/**
 * Executes the full signup lifecycle for a single platform.
 * Uses a deterministic Playwright flow first, then falls back to
 * AI-guided interaction if the deterministic flow fails.
 *
 * @param agentId - The agent's UUID.
 * @param platform - The target platform.
 * @param email - The agent's email.
 * @param inboxId - The AgentMail inbox ID.
 */
async function executePlatformSignup(
  agentId: string,
  platform: Platform,
  email: string,
  inboxId: string
): Promise<void> {
  const config = PLATFORM_CONFIGS[platform];
  if (!config) {
    console.error(`No config for platform: ${platform}`);
    return;
  }

  // Update task status to in_progress
  const [task] = await db
    .update(setupTasks)
    .set({ status: 'in_progress', updatedAt: new Date() })
    .where(eq(setupTasks.agentId, agentId))
    .returning();

  emitTaskUpdate({
    taskId: task?.id ?? '',
    agentId,
    platform,
    status: 'in_progress',
    message: `Starting ${platform} signup...`,
    timestamp: new Date().toISOString()
  });

  // Retrieve the password from Vault
  const vaultPath = `secret/data/agents/${agentId}/${platform}`;
  const credential = await getCredential(vaultPath);
  if (!credential) {
    await markFailed(agentId, platform, 'Credential not found in Vault.');
    return;
  }

  let browser;
  try {
    // Create a Browserbase session
    const session = await createBrowserSession();
    browser = session.browser;

    // Store session ID for live view
    await db.update(setupTasks).set({ browserSessionId: session.sessionId }).where(eq(setupTasks.agentId, agentId));

    emitTaskUpdate({
      taskId: task?.id ?? '',
      agentId,
      platform,
      status: 'in_progress',
      message: `Browser session created. Navigating to ${config.signupUrl}...`,
      browserSessionId: session.sessionId,
      timestamp: new Date().toISOString()
    });

    // Attempt deterministic signup
    const signupResult = await performSignup(session.page, config, email, credential.password);

    if (signupResult === 'captcha') {
      // CAPTCHA detected — mark for human intervention
      await db
        .update(setupTasks)
        .set({ status: 'needs_human', updatedAt: new Date() })
        .where(eq(setupTasks.agentId, agentId));

      emitTaskUpdate({
        taskId: task?.id ?? '',
        agentId,
        platform,
        status: 'needs_human',
        message: `CAPTCHA detected on ${platform}. Manual intervention required.`,
        browserSessionId: session.sessionId,
        timestamp: new Date().toISOString()
      });

      // Keep browser open for operator to solve CAPTCHA via live view
      // The operator will trigger a "resume" action via the UI
      return;
    }

    // Wait for verification email
    emitTaskUpdate({
      taskId: task?.id ?? '',
      agentId,
      platform,
      status: 'awaiting_verification',
      message: `Form submitted. Waiting for verification email from ${platform}...`,
      timestamp: new Date().toISOString()
    });

    const verification = await waitForVerification(inboxId, platform);

    if (verification.type === 'otp') {
      await injectOTP(session.page, verification.value);
    } else if (verification.type === 'link') {
      await session.page.goto(verification.value, { timeout: 15_000 });
    }

    // Wait briefly for dashboard/success page
    await session.page.waitForTimeout(3000);

    // Mark as completed
    await db
      .update(setupTasks)
      .set({ status: 'completed', updatedAt: new Date() })
      .where(eq(setupTasks.agentId, agentId));

    emitTaskUpdate({
      taskId: task?.id ?? '',
      agentId,
      platform,
      status: 'completed',
      message: `${platform} signup completed successfully!`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[${platform}] Signup failed:`, errorMsg);

    // Attempt AI-guided recovery
    try {
      await aiGuidedRecovery(agentId, platform, errorMsg);
    } catch {
      await markFailed(agentId, platform, errorMsg);
    }
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

/**
 * Uses Claude Opus 4.6 to analyze a failure screenshot and suggest
 * corrective actions. This is the adaptive intelligence layer.
 *
 * @param agentId - The agent's UUID.
 * @param platform - The platform that failed.
 * @param errorContext - The error message from the failed attempt.
 */
async function aiGuidedRecovery(agentId: string, platform: Platform, errorContext: string): Promise<void> {
  const session = await createBrowserSession();

  try {
    const screenshot = await takeScreenshot(session.page);

    const { output } = await generateText({
      model,
      providerOptions: {
        anthropic: {
          thinking: {
            type: 'enabled',
            budgetTokens: 8000
          }
        }
      },
      output: Output.object({ schema: NextActionSchema }),
      messages: [
        {
          role: 'system',
          content: `You are an expert web automation agent. You are helping to sign up for ${platform}.
The previous automated attempt failed with error: "${errorContext}".
Analyze the current page screenshot and determine the next best action to recover the signup flow.
Be specific about CSS selectors and values.`
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Here is the current state of the browser. What should I do next?' },
            { type: 'image', image: `data:image/png;base64,${screenshot}` }
          ]
        }
      ]
    });

    if (output) {
      emitTaskUpdate({
        taskId: '',
        agentId,
        platform,
        status: 'in_progress',
        message: `AI Recovery: ${output.reasoning}`,
        timestamp: new Date().toISOString()
      });
    }
  } finally {
    await session.browser.close().catch(() => {});
  }
}

/**
 * Marks a task as failed in the database and emits an SSE event.
 */
async function markFailed(agentId: string, platform: Platform, message: string): Promise<void> {
  await db
    .update(setupTasks)
    .set({ status: 'failed', errorMessage: message, updatedAt: new Date() })
    .where(eq(setupTasks.agentId, agentId));

  emitTaskUpdate({
    taskId: '',
    agentId,
    platform,
    status: 'failed',
    message: `${platform} signup failed: ${message}`,
    timestamp: new Date().toISOString()
  });
}
```

### Event Emitter Module: `src/lib/events.ts`

```typescript
import { EventEmitter } from 'events';
import type { TaskStatusEvent } from '@/types';

/**
 * Global event emitter for real-time task status updates.
 * Used by the orchestrator to emit events and by the SSE endpoint to stream them.
 *
 * In production, this would be replaced with a proper pub/sub system (Redis, etc.).
 * For the hackathon MVP, an in-process EventEmitter suffices for a single Vercel
 * serverless instance. Note: this will NOT work across multiple serverless instances.
 */
let emitter: EventEmitter | undefined;

export function getTaskEventEmitter(): EventEmitter {
  if (!emitter) {
    emitter = new EventEmitter();
    emitter.setMaxListeners(100);
  }
  return emitter;
}

/**
 * Emits a task status update event.
 * All connected SSE clients for the matching agent will receive this.
 */
export function emitTaskUpdate(event: TaskStatusEvent): void {
  getTaskEventEmitter().emit('task-update', event);
}
```

**Known Limitation:** The in-process `EventEmitter` approach only works when the SSE endpoint and the orchestrator run in the same serverless instance. For the hackathon, this is acceptable. Post-hackathon, replace with Vercel KV or Upstash Redis pub/sub.

---

## 14. Real-Time Updates (Server-Sent Events)

### Client-Side Hook: `src/hooks/use-task-stream.ts`

```typescript
'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import type { TaskStatusEvent } from '@/types';

/**
 * Custom hook that connects to the SSE endpoint for a specific agent
 * and maintains a reactive list of task status events.
 *
 * @param agentId - The agent's UUID to subscribe to.
 * @returns An object with `events` (array of all received events) and `isConnected` flag.
 */
export function useTaskStream(agentId: string | undefined): {
  events: TaskStatusEvent[];
  isConnected: boolean;
} {
  const [events, setEvents] = useState<TaskStatusEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const sourceRef = useRef<EventSource | undefined>(undefined);

  const connect = useCallback(() => {
    if (!agentId) return;

    const source = new EventSource(`/api/agents/${agentId}/stream`);
    sourceRef.current = source;

    source.onopen = () => setIsConnected(true);

    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as TaskStatusEvent;
        setEvents((prev) => [...prev, data]);
      } catch {
        // Ignore malformed events (e.g., heartbeats)
      }
    };

    source.onerror = () => {
      setIsConnected(false);
      source.close();
      // Reconnect after 3 seconds
      setTimeout(connect, 3000);
    };
  }, [agentId]);

  useEffect(() => {
    connect();
    return () => {
      sourceRef.current?.close();
    };
  }, [connect]);

  return { events, isConnected };
}
```

---

## 15. Frontend — Pages, Components & UI

### 15.1 — Page Map

| Route                    | Purpose                                     | Auth Required |
| ------------------------ | ------------------------------------------- | ------------- |
| `/`                      | Landing page — marketing, hero section, CTA | No            |
| `/auth/sign-in`          | Neon Auth sign-in view                      | No            |
| `/auth/sign-up`          | Neon Auth sign-up view                      | No            |
| `/dashboard`             | Main dashboard — agent list, quick-create   | Yes           |
| `/dashboard/agents/[id]` | Agent detail — live status, inbox, vault    | Yes           |
| `/account/settings`      | User account settings (Neon Auth)           | Yes           |
| `/account/security`      | User security settings                      | Yes           |

### 15.2 — Landing Page (`src/app/page.tsx`)

Design direction: Dark theme, sleek, particle effects in the hero. Use CSS `@keyframes` and `radial-gradient` for glow effects. No external animation libraries to keep bundle lean.

Key sections:

1. **Hero** — "One Click. Six Platforms. Zero Friction." with a glowing CTA button.
2. **Platform Grid** — Animated cards showing Instagram, TikTok, X, Mintlify, Vercel, Sentry logos.
3. **How It Works** — Three-step visual (Create → Automate → Operate).
4. **CTA** — "Get Started" → `/auth/sign-up`.

### 15.3 — Dashboard Page (`src/app/dashboard/page.tsx`)

Layout: Sidebar navigation (Shadcn Sidebar component) with:

- "Agents" (list view)
- "Create Agent" (form)
- "Settings" (link to `/account/settings`)

Main content area shows a data table of all agents with columns: Name, Email, Status Summary (e.g., "4/6 complete"), Created At, Actions (View).

### 15.4 — Agent Detail Page (`src/app/dashboard/agents/[id]/page.tsx`)

This is the core operational view with four tabs (Shadcn Tabs component):

**Tab 1: Status Dashboard**

- Real-time status cards for each of the 6 platforms.
- Each card shows: Platform name + icon, status badge (Pending / In Progress / Awaiting Verification / Needs Human / Completed / Failed), latest message from the SSE stream, progress indicator.
- "Needs Human" cards show a "View Browser" button that opens the Browserbase live view URL in a new tab.

**Tab 2: Inbox Viewer**

- Embedded view of the agent's AgentMail inbox.
- Lists messages with sender, subject, date, snippet.
- Click to expand and see full message body.
- "Refresh" button to re-poll the inbox.

**Tab 3: Credentials Vault**

- Table of platform credentials with columns: Platform, Email, Password (masked), API Key (if any), Actions.
- "Reveal" button (eye icon) to unmask a password (logs the access to audit_log).
- "Copy" button to copy a credential to clipboard.

**Tab 4: Activity Log**

- Chronological list of all SSE events received for this agent.
- Useful for debugging and understanding the automation timeline.

### 15.5 — Key Component Hierarchy

```
src/components/
├── layout/
│   ├── app-sidebar.tsx          # Shadcn Sidebar with navigation
│   ├── header.tsx               # Top bar with UserButton
│   └── theme-provider.tsx       # Dark mode support
├── agents/
│   ├── create-agent-form.tsx    # Form with name input + submit
│   ├── agent-list-table.tsx     # Data table of all agents
│   ├── agent-status-grid.tsx    # 6-card grid showing per-platform status
│   ├── platform-status-card.tsx # Individual platform status card
│   └── task-activity-log.tsx    # Chronological event log
├── inbox/
│   ├── inbox-viewer.tsx         # Message list + detail view
│   └── message-detail.tsx       # Full message body viewer
├── vault/
│   ├── credentials-table.tsx    # Credential listing with mask/copy
│   └── credential-row.tsx       # Individual credential row
├── landing/
│   ├── hero-section.tsx         # Animated hero with CTA
│   ├── platform-grid.tsx        # Platform logo grid
│   └── how-it-works.tsx         # Three-step visual
└── ui/
    └── ... (Shadcn components)
```

---

## 16. Deployment on Vercel

### 16.1 — Vercel Configuration

**File:** `vercel.json`

```json
{
  "framework": "nextjs",
  "buildCommand": "bun run build",
  "installCommand": "bun install",
  "functions": {
    "src/app/api/agents/*/stream/route.ts": {
      "maxDuration": 300
    },
    "src/app/api/agents/route.ts": {
      "maxDuration": 60
    }
  }
}
```

**Key Settings:**

- The SSE stream endpoint needs a long `maxDuration` (up to 300s on Pro/Enterprise plans) to keep connections alive.
- The agent creation endpoint needs at least 60s for the initial Vault writes and AgentMail inbox creation.

### 16.2 — Deployment Steps

```bash
# Install Vercel CLI
bun add -g vercel

# Link to Vercel project
vercel link

# Set environment variables (do this in the Vercel dashboard for sensitive values)
vercel env add ANTHROPIC_API_KEY
vercel env add AGENTMAIL_API_KEY
vercel env add BROWSERBASE_API_KEY
# ... etc.

# Deploy to preview
vercel

# Deploy to production
vercel --prod
```

### 16.3 — Build Optimization

In `next.config.ts`:

```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Playwright-core is only used server-side; exclude from client bundles
  serverExternalPackages: ['playwright-core', '@browserbasehq/sdk', 'node-vault'],

  // Enable experimental features
  experimental: {
    // Optimize serverless function size
    optimizePackageImports: ['lucide-react', '@neondatabase/auth']
  }
};

export default nextConfig;
```

---

## 17. Monitoring & Error Tracking (Sentry)

### Setup

```bash
bunx @sentry/wizard@latest -i nextjs
```

This auto-generates `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, and updates `next.config.ts` with `withSentryConfig`.

### Custom Error Boundaries

Wrap the agent detail page in a Sentry error boundary to capture and report any UI crashes without breaking the entire dashboard.

```typescript
// In src/app/dashboard/agents/[id]/error.tsx
'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function AgentDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-4 p-8">
      <h2 className="text-xl font-semibold">Something went wrong</h2>
      <p className="text-muted-foreground">{error.message}</p>
      <button onClick={reset} className="rounded bg-primary px-4 py-2 text-primary-foreground">
        Try again
      </button>
    </div>
  );
}
```

---

## 18. Implementation Phases & Sprint Plan

Given the 24-hour hackathon constraint, here is the recommended implementation order. Times assume a solo developer; scale down proportionally with team members.

### Phase 0: Setup (Hours 0-1)

| Task                                     | Time   | Priority |
| ---------------------------------------- | ------ | -------- |
| Scaffold Next.js 16 project with bun     | 10 min | P0       |
| Install all dependencies                 | 10 min | P0       |
| Configure TypeScript, ESLint             | 5 min  | P0       |
| Set up Shadcn UI (init + add components) | 10 min | P0       |
| Create Neon database + enable Neon Auth  | 10 min | P0       |
| Configure environment variables          | 5 min  | P0       |
| Deploy initial skeleton to Vercel        | 10 min | P0       |

### Phase 1: Auth & Database (Hours 1-3)

| Task                                                         | Time   | Priority |
| ------------------------------------------------------------ | ------ | -------- |
| Implement Neon Auth (API route, middleware, provider, pages) | 30 min | P0       |
| Define Drizzle schema and push to Neon                       | 20 min | P0       |
| Create DB client module                                      | 10 min | P0       |
| Verify sign-up/sign-in flow works end-to-end                 | 15 min | P0       |
| Create dashboard layout with Shadcn Sidebar                  | 30 min | P0       |
| Implement basic agent list page (empty state)                | 15 min | P0       |

### Phase 2: Core Backend (Hours 3-7)

| Task                                                              | Time   | Priority |
| ----------------------------------------------------------------- | ------ | -------- |
| Implement AgentMail module (create inbox, poll, extract OTP)      | 45 min | P0       |
| Implement Vault module (generate password, store, retrieve)       | 30 min | P0       |
| Implement Browserbase module (create session, signup, screenshot) | 45 min | P0       |
| Implement `POST /api/agents` route                                | 30 min | P0       |
| Implement SSE stream endpoint                                     | 30 min | P0       |
| Implement event emitter module                                    | 15 min | P0       |
| Implement orchestrator (non-AI: deterministic flows only)         | 45 min | P0       |

### Phase 3: Frontend Core (Hours 7-11)

| Task                                             | Time   | Priority |
| ------------------------------------------------ | ------ | -------- |
| Create Agent form (name input + submit)          | 30 min | P0       |
| Agent detail page with tabs skeleton             | 30 min | P0       |
| Status Dashboard tab (6 platform cards with SSE) | 60 min | P0       |
| Credentials Vault tab (table with mask/copy)     | 45 min | P0       |
| Inbox Viewer tab (message list)                  | 30 min | P1       |
| Activity Log tab                                 | 15 min | P1       |
| `useTaskStream` hook                             | 20 min | P0       |

### Phase 4: AI Layer (Hours 11-15)

| Task                                                          | Time   | Priority |
| ------------------------------------------------------------- | ------ | -------- |
| Configure Claude Opus 4.6 with extended thinking              | 15 min | P1       |
| Implement AI-guided recovery function                         | 60 min | P1       |
| Test AI recovery with screenshot analysis                     | 45 min | P1       |
| Integrate AI decisions into orchestrator flow                 | 45 min | P1       |
| Handle multi-turn AI interaction (fill → screenshot → decide) | 60 min | P1       |

### Phase 5: Landing Page & Polish (Hours 15-19)

| Task                                        | Time   | Priority |
| ------------------------------------------- | ------ | -------- |
| Landing page hero section with animations   | 60 min | P0       |
| Platform grid and "How It Works" sections   | 30 min | P0       |
| Dark theme polish across all pages          | 30 min | P1       |
| Loading states (Skeleton components)        | 20 min | P1       |
| Error states and edge cases                 | 30 min | P1       |
| Responsive design pass (mobile breakpoints) | 30 min | P2       |

### Phase 6: Integration Testing & Demo Prep (Hours 19-23)

| Task                                                              | Time   | Priority |
| ----------------------------------------------------------------- | ------ | -------- |
| End-to-end test: create agent → Vercel signup → verify → complete | 60 min | P0       |
| End-to-end test: Sentry signup flow                               | 30 min | P0       |
| Fix bugs from integration testing                                 | 60 min | P0       |
| Sentry error tracking verification                                | 15 min | P1       |
| Prepare demo script and talking points                            | 30 min | P0       |
| Final production deploy                                           | 15 min | P0       |

### Phase 7: Buffer (Hour 23-24)

| Task                  | Time   | Priority |
| --------------------- | ------ | -------- |
| Last-minute bug fixes | 30 min | P0       |
| Demo dry run          | 30 min | P0       |

---

## 19. File & Directory Structure

```
spawnpoint/
├── drizzle/                          # Generated migration files
├── public/
│   ├── favicon.ico
│   └── images/
│       └── platforms/                # Platform logos (svg)
├── src/
│   ├── app/
│   │   ├── globals.css
│   │   ├── layout.tsx                # Root layout with NeonAuthUIProvider
│   │   ├── page.tsx                  # Landing page
│   │   ├── auth/
│   │   │   └── [path]/
│   │   │       └── page.tsx          # Neon Auth views (sign-in, sign-up)
│   │   ├── account/
│   │   │   └── [path]/
│   │   │       └── page.tsx          # Account settings views
│   │   ├── dashboard/
│   │   │   ├── layout.tsx            # Dashboard layout with sidebar
│   │   │   ├── page.tsx              # Agent list + create form
│   │   │   └── agents/
│   │   │       └── [id]/
│   │   │           ├── page.tsx      # Agent detail (tabbed view)
│   │   │           └── error.tsx     # Sentry error boundary
│   │   └── api/
│   │       ├── auth/
│   │       │   └── [...path]/
│   │       │       └── route.ts      # Neon Auth API handler
│   │       ├── agents/
│   │       │   ├── route.ts          # POST: create agent, GET: list agents
│   │       │   └── [agentId]/
│   │       │       ├── route.ts      # GET: agent detail, DELETE: remove agent
│   │       │       ├── stream/
│   │       │       │   └── route.ts  # GET: SSE task status stream
│   │       │       └── resume/
│   │       │           └── route.ts  # POST: resume after CAPTCHA solve
│   │       ├── inbox/
│   │       │   └── [inboxId]/
│   │       │       └── route.ts      # GET: list inbox messages
│   │       └── vault/
│   │           └── [agentId]/
│   │               └── [platform]/
│   │                   └── route.ts  # GET: retrieve credential (with audit log)
│   ├── components/
│   │   ├── layout/
│   │   │   ├── app-sidebar.tsx
│   │   │   ├── header.tsx
│   │   │   └── theme-provider.tsx
│   │   ├── agents/
│   │   │   ├── create-agent-form.tsx
│   │   │   ├── agent-list-table.tsx
│   │   │   ├── agent-status-grid.tsx
│   │   │   ├── platform-status-card.tsx
│   │   │   └── task-activity-log.tsx
│   │   ├── inbox/
│   │   │   ├── inbox-viewer.tsx
│   │   │   └── message-detail.tsx
│   │   ├── vault/
│   │   │   ├── credentials-table.tsx
│   │   │   └── credential-row.tsx
│   │   ├── landing/
│   │   │   ├── hero-section.tsx
│   │   │   ├── platform-grid.tsx
│   │   │   └── how-it-works.tsx
│   │   └── ui/                       # Shadcn UI components (auto-generated)
│   │       ├── button.tsx
│   │       ├── card.tsx
│   │       ├── ... (etc.)
│   │       └── toast.tsx
│   ├── db/
│   │   ├── index.ts                  # Drizzle client
│   │   └── schema.ts                 # Table definitions
│   ├── hooks/
│   │   ├── use-task-stream.ts        # SSE subscription hook
│   │   └── use-copy-to-clipboard.ts  # Clipboard utility hook
│   ├── lib/
│   │   ├── auth/
│   │   │   ├── client.ts             # Neon Auth client-side
│   │   │   └── server.ts             # Neon Auth server-side
│   │   ├── agentmail.ts              # AgentMail SDK wrapper
│   │   ├── browser.ts                # Browserbase + Playwright wrapper
│   │   ├── vault.ts                  # HashiCorp Vault wrapper
│   │   ├── orchestrator.ts           # AI-powered signup orchestrator
│   │   ├── events.ts                 # EventEmitter for SSE
│   │   ├── platforms.ts              # Platform config definitions
│   │   └── utils.ts                  # Shared utilities (cn, formatDate, etc.)
│   └── types/
│       └── index.ts                  # Shared type definitions + Zod schemas
├── .env.local                        # Local environment variables (git-ignored)
├── .gitignore
├── bun.lock
├── drizzle.config.ts
├── next.config.ts
├── package.json
├── proxy.ts                          # Neon Auth middleware
├── README.md
├── sentry.client.config.ts
├── sentry.server.config.ts
├── sentry.edge.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── vercel.json
```

---

## 20. Risk Matrix & Mitigations

| Risk                                              | Likelihood | Impact   | Mitigation                                                                                            |
| ------------------------------------------------- | ---------- | -------- | ----------------------------------------------------------------------------------------------------- |
| **Browserbase rate limits / session failures**    | Medium     | High     | Implement retry logic with exponential backoff. Fall back to local Playwright if Browserbase is down. |
| **Platform signup forms change during hackathon** | Low        | High     | AI-guided recovery with Claude screenshot analysis. Keep selectors configurable.                      |
| **AgentMail inbox creation fails**                | Low        | Critical | Validate API key on startup. Have a fallback email provider (or hardcoded test inbox).                |
| **Vault unavailable**                             | Medium     | High     | Hackathon fallback: store encrypted credentials directly in Neon using `pgcrypto`.                    |
| **SSE doesn't work across serverless instances**  | High       | Medium   | Accept limitation for demo. Use polling as fallback. Post-hackathon: Redis pub/sub.                   |
| **CAPTCHAs on all social platforms**              | High       | Medium   | Scope MVP to non-CAPTCHA platforms (Vercel, Sentry, Mintlify). Show manual-assist for social.         |
| **Vercel function timeout (10s on Hobby plan)**   | Medium     | High     | Use Pro plan (60s default, 300s max). Break long-running tasks into background jobs.                  |
| **Neon Auth SDK compatibility with Next.js 16**   | Low        | High     | Test early in Phase 1. Fall back to vanilla Better Auth if SDK has issues.                            |
| **AI orchestrator token costs exceed budget**     | Medium     | Low      | Set `maxTokens` limits. Use Claude Sonnet 4.5 for non-critical decisions, Opus only for recovery.     |

---

## 21. Testing Strategy

Given the hackathon time constraint, prioritize manual integration testing over unit tests.

### Critical Path Tests (Manual)

1. **Auth Flow:** Sign up → Sign in → Access dashboard → Sign out → Redirect to login.
2. **Agent Creation (Happy Path):** Enter agent name → Submit → See agent in list → See tasks in "pending" state.
3. **Vercel Signup (End-to-End):** Create agent → Watch Vercel task go from pending → in_progress → awaiting_verification → completed.
4. **Sentry Signup (End-to-End):** Same as above for Sentry.
5. **CAPTCHA Flow:** Create agent → Watch Instagram task hit "needs_human" → Verify live browser view URL works.
6. **Credential Retrieval:** Navigate to vault tab → Click "Reveal" → See unmasked password → Copy to clipboard.
7. **Inbox Viewer:** See verification emails arrive in the inbox viewer.
8. **SSE Reconnection:** Kill the SSE connection (DevTools → Network → close) → Verify auto-reconnect.

### Post-Hackathon Test Additions

- Vitest unit tests for all `src/lib/` modules.
- Playwright E2E tests for the full agent creation flow.
- Load testing for concurrent agent creation.
- Security audit for credential handling.

---

## 22. Post-Hackathon Roadmap

| Priority | Feature                            | Description                                                                               |
| -------- | ---------------------------------- | ----------------------------------------------------------------------------------------- |
| P0       | **Redis Pub/Sub for SSE**          | Replace in-process EventEmitter with Upstash Redis for multi-instance support.            |
| P0       | **Webhook-based email processing** | Replace AgentMail polling with webhooks for instant verification handling.                |
| P0       | **Background job queue**           | Use Vercel Cron Jobs or Inngest for long-running signup tasks.                            |
| P1       | **LinkedIn & CodeRabbit**          | Add remaining platforms from the original spec.                                           |
| P1       | **GitHub org auto-provisioning**   | Use GitHub API to create repos and set up team access.                                    |
| P1       | **Neon DB per-agent provisioning** | Auto-create a Neon database branch per agent.                                             |
| P2       | **CAPTCHA solving service**        | Integrate with 2Captcha or CapSolver for automated CAPTCHA resolution.                    |
| P2       | **noVNC live browser embed**       | Embed the Browserbase live view directly in the dashboard (instead of opening a new tab). |
| P2       | **Multi-tenant support**           | Allow multiple organizations with isolated agent pools.                                   |
| P3       | **Agent lifecycle management**     | Deactivation, credential rotation, and account deletion flows.                            |

---

## Appendix A: Key API References

| Service                   | Documentation URL                                           |
| ------------------------- | ----------------------------------------------------------- |
| Next.js 16                | https://nextjs.org/docs                                     |
| Shadcn UI                 | https://ui.shadcn.com/docs                                  |
| Vercel AI SDK v6          | https://ai-sdk.dev/docs                                     |
| AI SDK Anthropic Provider | https://ai-sdk.dev/providers/ai-sdk-providers/anthropic     |
| Neon Auth (Better Auth)   | https://neon.com/docs/auth/quick-start/nextjs               |
| AgentMail                 | https://docs.agentmail.to/                                  |
| Browserbase + Playwright  | https://docs.browserbase.com/introduction/playwright        |
| HashiCorp Vault KV v2     | https://developer.hashicorp.com/vault/docs/secrets/kv/kv-v2 |
| Sentry Next.js            | https://docs.sentry.io/platforms/javascript/guides/nextjs/  |
| Bun                       | https://bun.sh/docs                                         |
| Drizzle ORM               | https://orm.drizzle.team/docs/overview                      |

---

## Appendix B: Bun-Specific Notes

- **Package Manager:** All `bun install`, `bun add`, `bun run` commands replace npm/yarn equivalents.
- **Lockfile:** `bun.lock` (not `package-lock.json` or `yarn.lock`). Commit this to git.
- **Playwright Caveat:** Bun does not support `playwright-core` at runtime. This is fine because Vercel serverless functions use Node.js. The Playwright code runs server-side only, never in the Bun-powered dev server. If testing locally, run Playwright-dependent code with `node` or use `bun --bun` flag cautiously.
- **Scripts in `package.json`:**

```json
{
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "db:generate": "drizzle-kit generate",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio"
  }
}
```

---

_End of specification. This document should be treated as a living artifact — update it as implementation decisions are made during the hackathon._
