# Repository Guidelines

## Project Structure & Module Organization

- `src/app/`: Next.js App Router pages, layouts, and API routes (`src/app/api/*`).
- `src/components/`: UI and feature components grouped by domain (`agents`, `inbox`, `landing`, `layout`, `ui`).
- `src/lib/`: Core business logic and integrations (orchestration, auth, browser automation, events, vault).
- `src/db/`: Drizzle database client and schema definitions.
- `src/hooks/` and `src/types/`: shared React hooks and TypeScript/Zod types.
- `public/`: static assets. Root configs live in files like `next.config.ts`, `drizzle.config.ts`, and `eslint.config.mjs`.

## Build, Test, and Development Commands

Use **Bun** as the package manager/runtime.

- `bun install`: install dependencies.
- `bun run dev`: start local dev server with Turbopack.
- `bun run build`: create production build.
- `bun run start`: run the production server locally.
- `bun run lint`: run ESLint plus Prettier check.
- `bun run format`: format codebase with Prettier.
- `bun run db:generate`: generate Drizzle migration files.
- `bun run db:push`: push schema changes to Neon.
- `bun run db:studio`: open Drizzle Studio.

## Coding Style & Naming Conventions

- Language: TypeScript with strict checks enabled (`tsconfig.json`).
- Formatting (Prettier): 2-space indentation, semicolons, single quotes, 120-char line width, no trailing commas.
- Tailwind class order is auto-sorted via `prettier-plugin-tailwindcss`.
- Follow Next.js conventions: default to Server Components; add `'use client'` only when needed.
- Use kebab-case filenames for components/hooks (for example, `agent-status-grid.tsx`) and `@/*` imports for `src/*`.

## Testing Guidelines

- There is currently no committed automated test suite or `test` script.
- Before opening a PR, run `bun run lint` and `bun run build`, then manually validate core flows (auth, dashboard, agent creation, streaming updates).
- For new tests, use `*.test.ts` / `*.test.tsx` naming and keep tests near source files or in `src/**/__tests__/`.

## Commit & Pull Request Guidelines

- Keep commit subjects short and imperative (history examples: `Initial build`, `Added spec sheet`).
- Separate unrelated changes into distinct commits.
- PRs should include: scope summary, key file paths changed, env/schema changes, and local verification steps.
- Include screenshots or short recordings for UI changes.

## Security & Configuration Tips

- Copy `.env.example` to `.env.local`; never commit secrets.
- Required integrations include Neon, Neon Auth, AgentMail, Browserbase, Anthropic, and Sentry.
- Avoid logging API keys, passwords, or credential payloads.
