# Settle

> Payment truth for autonomous agents.

Settle is an API-first, read-only payment reconciliation service. A caller
declares an expected USDC payment on Base, the payment happens independently,
and Settle later checks the chain and returns a deterministic payment status
plus transaction evidence.

- Product scope: [`SETTLE_PRODUCT_BRIEF.md`](./SETTLE_PRODUCT_BRIEF.md)
- Technical source of truth: [`ARCHITECTURE.md`](./ARCHITECTURE.md)

## Status

Milestone 0 — scaffold, contracts, and public deployment shell. The payment
intent API (`/v1/*`), persistence, chain integration and demo UI arrive in
later milestones (see `ARCHITECTURE.md` §17).

## Stack

Node.js 24 · TypeScript 6 (strict) · Next.js 16 App Router (Node runtime, never
Edge) · React 19 · Tailwind CSS 4 · Zod 4 · Vitest 4 · pnpm 10 · Vercel.

## Local setup

```sh
# Node 24 (see .node-version) and pnpm 10 (pinned in package.json "packageManager";
# any recent pnpm switches to the pinned version automatically).
pnpm install
cp .env.example .env.local   # fill in values as needed
pnpm dev                     # http://localhost:3000
```

## Scripts

| Script           | What it does                                   |
| ---------------- | ---------------------------------------------- |
| `pnpm dev`       | Next.js dev server                             |
| `pnpm build`     | Production build                               |
| `pnpm start`     | Serve the production build                     |
| `pnpm lint`      | ESLint (`eslint-config-next` + TypeScript)     |
| `pnpm typecheck` | Generate Next route types, then `tsc --noEmit` |
| `pnpm test`      | Vitest, single run                             |
| `pnpm test:watch`| Vitest in watch mode                           |

Required CI checks: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.

## Public endpoints

### `GET /health`

```sh
curl -i https://<deployment>/health
```

```json
{
  "status": "ok",
  "service": "settle",
  "environment": "production",
  "commit": "<exact 40-character git commit SHA>",
  "timestamp": "2026-09-17T14:31:02.000Z"
}
```

`commit` is the deployed `VERCEL_GIT_COMMIT_SHA`; it is `null` when running
outside a Vercel deployment. `environment` is `production`, `preview`,
`development`, or `test`.

### `GET /.well-known/xagent-verification.json`

```sh
curl -i https://<deployment>/.well-known/xagent-verification.json
```

```json
{ "slug": "<XAGENT_SLUG>", "commit": "<exact 40-character git commit SHA>" }
```

This is a **placeholder contract** carrying only the registered slug and the
deployed commit. The official X-Agent schema is adopted in Milestone 6 by
replacing `src/lib/xagent-verification.ts` and its test. If either value is
unavailable the route returns `500` with the error envelope below rather than
fabricated data.

### Response conventions

- Every response carries an `X-Request-Id` header. A client may supply its own
  (8–64 characters of `[A-Za-z0-9_-]`); otherwise one is generated.
- Errors use one stable envelope:

```json
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Server configuration is invalid",
    "retryable": false
  }
}
```

Stable codes and HTTP statuses are listed in `ARCHITECTURE.md` §9 and
implemented in `src/lib/errors.ts`.

## Configuration

All environment variables are validated once in `src/lib/config.ts`; see
[`.env.example`](./.env.example) for the full list. Chain ID, the USDC contract,
decimals, confirmation defaults, expiry and body limits are code constants.

## Deployment (Vercel)

One Vercel project, framework preset Next.js, Node.js 24 (selected from
`package.json` `engines.node`). Set `XAGENT_SLUG` in the Production
environment; `VERCEL_ENV` and `VERCEL_GIT_COMMIT_SHA` are provided by the
platform. After each deploy verify `/health` reports the reviewed commit and
`/.well-known/xagent-verification.json` returns `200`.
