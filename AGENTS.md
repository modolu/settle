# Settle — coding agent instructions

Settle is an API-first, read-only payment reconciliation service for autonomous agents. The Arc Microgrants branch extends the frozen Base-only X-Agent submission to support Base + Arc while preserving the original X-Agent review commit and deployment.

## Source of truth
Read `ARCHITECTURE.md`, `SETTLE_PRODUCT_BRIEF.md`, and `PROGRESS.md` before each task. Architecture decisions changed for Arc must be documented in `ARCHITECTURE.md` in the same commit. Do not redesign the product beyond the approved plan.

## Stack — pinned
- Node.js 24.x; pnpm 10.34.5
- TypeScript 6.0.3
- Next.js 16.3.5 App Router; React/React DOM 19.3.0
- PostgreSQL/Neon; Drizzle ORM 0.45.2; pg 8.23.0; drizzle-kit 0.31.10
- viem 2.56.7; Zod 4.6.5
- Tailwind CSS 4.3.3
- Vitest 4.1.11; Playwright 1.63.0
- Vercel deployment

## Structure and boundaries
- `src/domain`: pure TypeScript domain logic. No Next.js, Drizzle, pg, viem RPC clients, env, or network calls.
- `src/services`: use-case orchestration through ports only.
- `src/ports`: provider/repository contracts.
- `src/integrations/chain`: chain-specific RPC adapters only.
- `src/repositories`: application database access only.
- `src/server/container.ts`: composition root and provider selection.
- `src/app`: thin route/page entrypoints.
- `src/components`: presentation/client polling only; use the public API.
- `drizzle`: committed forward-only migrations. Never edit an old committed migration.
- `tests`: critical unit/service/integration/UI/E2E coverage.

## Conventions
- Files kebab-case; React components/types/classes PascalCase; functions/variables camelCase; DB snake_case; API camelCase.
- Exact money only: decimal strings at HTTP boundaries, bigint units internally, `numeric(78,0)` in Postgres. Never use JS `number` for money.
- Validate untrusted input at HTTP/form boundaries with the existing Zod/error patterns. Reject unknown fields and keep stable error envelopes/codes.
- Preserve Base behavior. Arc support is additive: `chain: "base" | "arc"`.
- Creation selects the provider from the requested/validated chain. Reconciliation selects the provider from the persisted `intent.chain` — never UI state or caller input.
- Base keeps its existing Alchemy provider and confirmation-depth behavior. Do not rewrite it for symmetry.
- Arc uses its own adapter, chain-specific USDC accounting, explorer, and deterministic-finality semantics documented in architecture.
- UI must handle loading, empty, error, and retryable-upstream states; never show raw stack traces.
- Reuse existing patterns before inventing abstractions. Keep functions/components small and typed.

## Security / deadline rules
- Never read or write outside this repository.
- No new dependencies without explicit approval.
- No secrets in source, logs, prompts, client code, or commits. Secrets stay in ignored env files; keep `.env.example` current.
- Never accept or handle private keys/seed phrases. Settle remains read-only and never signs/sends transactions.
- No destructive git/database commands, branch deletion, force push, database reset/drop, or deployment unless explicitly approved.
- Preserve X-Agent commit `25e958fcecaeb4ad20760c5a94c93a4670fd2b77` and its existing deployment. Arc work stays on `arc-microgrants` and later uses isolated deployment infrastructure.
- No auth, MCP changes, new assets, additional chains, custody, smart contracts, dashboards, analytics, queues, cron, webhooks, or background workers for this build.
- Protect the demo path over completeness. New ideas go to `PROGRESS.md` Later unless approved.

## Quality / verification
For each task: make the smallest coherent vertical change, run the relevant focused tests, then run the agreed done-when checks. Before milestone/final commits run:
`pnpm lint && pnpm typecheck && pnpm test && pnpm build`
If `TEST_DATABASE_URL` is absent, explicitly report skipped DB integration tests; never call them passed.
Do not weaken/delete Base tests to make Arc pass.

## Working commands
- Dev: `pnpm dev`
- Lint: `pnpm lint`
- Types: `pnpm typecheck`
- Tests: `pnpm test`
- E2E: `pnpm test:e2e`
- Build: `pnpm build`
- Generate migration: `pnpm db:generate`
- Apply migration: `pnpm db:migrate` only against the explicitly approved target DB.

## Task discipline
Touch only files required by the current brief. Do not commit unless the tech lead asks you to; the tech lead reviews the actual diff, verifies it, updates `PROGRESS.md`, and commits verified work.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
