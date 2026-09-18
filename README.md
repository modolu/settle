# Settle

> Payment truth for autonomous agents.

Settle is an API-first, read-only payment reconciliation service. A caller
declares an expected USDC payment on Base, the payment happens independently,
and Settle later checks the chain and returns a deterministic payment status
plus transaction evidence.

- Product scope: [`SETTLE_PRODUCT_BRIEF.md`](./SETTLE_PRODUCT_BRIEF.md)
- Technical source of truth: [`ARCHITECTURE.md`](./ARCHITECTURE.md)

## Status

Milestone 3 — the complete v1 reconciliation state model. Intents with or
without a declared `payer` reconcile against canonical native Base USDC
`Transfer` logs into `pending`, `detected`, `partial`, `paid`, `overpaid`,
`expired` or `ambiguous`, with expiry-block resolution, canonical
(reorg-aware) evidence and paginated evidence. Still to come (see
`ARCHITECTURE.md` §17): the demo inspector UI (Milestone 4), abuse/failure
hardening (Milestone 5) and submission hardening (Milestone 6).

## Stack

Node.js 24 · TypeScript 6 (strict) · Next.js 16 App Router (Node runtime, never
Edge) · React 19 · Tailwind CSS 4 · Zod 4 · Drizzle ORM 0.44 + `pg` · viem 2 ·
Neon PostgreSQL · Alchemy Base RPC · Vitest 4 · pnpm 10 · Vercel.

## Local setup

```sh
# Node 24 (see .node-version) and pnpm 10 (pinned in package.json "packageManager";
# any recent pnpm switches to the pinned version automatically).
pnpm install
cp .env.example .env.local   # fill in DATABASE_URL, DATABASE_URL_UNPOOLED, ALCHEMY_BASE_RPC_URL
pnpm db:migrate              # applies drizzle/*.sql through DATABASE_URL_UNPOOLED
pnpm dev                     # http://localhost:3000
```

Migrations are applied only by `pnpm db:migrate` (locally or from CI) — never
by `next build`, application startup, or a request handler.

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
| `pnpm db:generate` | Generate a SQL migration from `src/db/schema.ts` into `drizzle/` |
| `pnpm db:migrate`  | Apply committed migrations using `DATABASE_URL_UNPOOLED` |

Required CI checks: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.

Database integration tests (`tests/integration`) are skipped unless
`TEST_DATABASE_URL` points at a dedicated test database:

```sh
TEST_DATABASE_URL=postgres://... pnpm test tests/integration
```

## Public endpoints

### `POST /v1/payment-intents`

Declares an expected native-USDC payment on Base. The intent's matching window
starts at the Base block after the latest block observed at creation.

```sh
curl -i https://<deployment>/v1/payment-intents \
  -H 'Content-Type: application/json' \
  -d '{
    "externalReference": "INV-204",
    "chain": "base",
    "asset": "USDC",
    "amount": "850.00",
    "recipient": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "payer": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    "expiresAt": "2026-09-18T18:00:00Z",
    "requiredConfirmations": 3
  }'
```

`201 Created`:

```json
{
  "id": "pi_9VF1Q6h9F0c3bqzXlmqz0xQQ0ivN3G9r1O5T7Y8b",
  "status": "pending",
  "externalReference": "INV-204",
  "chain": "base",
  "asset": "USDC",
  "expectedAmount": "850.00",
  "receivedAmount": "0.00",
  "remainingAmount": "850.00",
  "recipient": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "payer": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
  "requiredConfirmations": 3,
  "matchConfidence": "none",
  "paidAt": null,
  "createdAt": "2026-09-17T14:31:02.000Z",
  "expiresAt": "2026-09-18T18:00:00.000Z"
}
```

Rules: `chain` must be `"base"` (`UNSUPPORTED_CHAIN`), `asset` must be
`"USDC"` (`UNSUPPORTED_ASSET`), addresses must be valid EVM addresses
(`INVALID_ADDRESS`), `amount` is a positive decimal string with at most six
decimals, `expiresAt` is a UTC timestamp ending in `Z` between now and seven
days out, `requiredConfirmations` is `1..64` (default `3`), `externalReference`
is at most 128 characters, unknown fields are rejected, and the JSON body is
limited to 16 KiB (`VALIDATION_ERROR`). If the chain provider cannot supply the
latest block the response is `503 UPSTREAM_UNAVAILABLE` (retryable) and no
intent is created.

### `GET /v1/payment-intents/:id`

Returns the persisted state in the same shape (`200`), `404 INTENT_NOT_FOUND`
for an unknown ID, or `400 VALIDATION_ERROR` for a malformed one. No chain
access happens on read; reconciliation is a separate, caller-triggered step
(later milestone).

### `POST /v1/payment-intents/:id/reconcile`

Caller-triggered reconciliation. Settle reads the latest Base block, fetches
native USDC `Transfer` logs from `payer` to `recipient` in
`[startBlock, latestBlock]`, computes confirmation depth
(`latest − block + 1`), persists the evidence idempotently and returns the
updated intent:

```sh
curl -i -X POST https://<deployment>/v1/payment-intents/pi_.../reconcile
```

```json
{
  "id": "pi_...",
  "status": "paid",
  "externalReference": "INV-204",
  "chain": "base",
  "asset": "USDC",
  "expectedAmount": "25.00",
  "receivedAmount": "25.00",
  "remainingAmount": "0.00",
  "recipient": "0x...",
  "payer": "0x...",
  "requiredConfirmations": 3,
  "matchConfidence": "exact_payer",
  "paidAt": "2026-09-17T22:43:17.000Z",
  "createdAt": "...",
  "expiresAt": "..."
}
```

Statuses, in precedence order (`ARCHITECTURE.md` §7.4):

| Status | Condition |
| --- | --- |
| `ambiguous` | no declared payer and transfers from two or more senders; nothing is counted |
| `overpaid` | confirmed total > expected |
| `paid` | confirmed total = expected |
| `partial` | 0 < confirmed total < expected, and not conclusively expired |
| `detected` | evidence exists but none is confirmed yet, and not conclusively expired |
| `expired` | expiry boundary passed, confirmed total short, and even the not-yet-confirmed in-window evidence could not satisfy it |
| `pending` | nothing observed |

Confirmed means `latestBlock − blockNumber + 1 ≥ requiredConfirmations`.
`receivedAmount` sums confirmed matched transfers; `detectedAmount` sums all
matched transfers. `paidAt` is the block timestamp of the transfer that first
brought the confirmed total to the expected amount (also for `overpaid`).

Window: `[startBlock, latestBlock]` until `expiresAt`; afterwards the greatest
Base block with `timestamp ≤ expiresAt` is found by binary search, persisted
once, and becomes the end of the window. A transfer mined before expiry may
still confirm after it. `matchConfidence` is `exact_payer` for a declared
payer, `single_sender` when every in-window transfer comes from one sender,
`ambiguous` for several senders, `none` without evidence.

Each reconcile is a complete canonical scan of the window: evidence is keyed by
`(intent, txHash, logIndex)`, amounts are recomputed (never incremented),
previously stored evidence inside the window that is no longer observed is
marked `orphaned` and stops counting, and a stored transfer re-observed in a
different block takes the newest block details. A failed provider call returns
`503 UPSTREAM_UNAVAILABLE` and changes nothing — it never orphans evidence.

### `GET /v1/payment-intents/:id/evidence`

Persisted evidence in canonical order `(blockNumber, logIndex, txHash)`,
keyset-paginated (`limit` 1–100, default 50; opaque `cursor`):

```sh
curl "https://<deployment>/v1/payment-intents/pi_.../evidence?limit=50"
```

```json
{
  "evidence": [
    {
      "transactionHash": "0x7db45d69dbb848f50002285f04946b2004388f6823d6ecd3387276141561b0f5",
      "logIndex": 4,
      "blockNumber": "51447828",
      "from": "0x498581fF718922c3f8e6A244956aF099B2652b2b",
      "to": "0x03468a6A40940E4C54d8b9D8433F7aBf0481A2Bc",
      "amount": "20710.876899",
      "confirmations": 25,
      "blockTimestamp": "2026-09-17T22:43:23.000Z",
      "association": "matched"
    }
  ],
  "nextCursor": null
}
```

`blockNumber` is a decimal string; `confirmations` are as observed at the last
accepted reconciliation. `association` is `matched` (counts toward totals),
`candidate` (seen for an `ambiguous` payer-less intent; never counted) or
`orphaned` (no longer canonical; never counted).

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

The X-Agent MCP Hackathon deployment proof:

```sh
curl -i https://<deployment>/.well-known/xagent-verification.json
```

```json
{
  "schemaVersion": 1,
  "slug": "modolu-settle",
  "commit": "<exact 40-character git commit SHA>"
}
```

Exactly these three fields. `slug` is Settle's registered hackathon slug; the
deployment variable `XAGENT_SLUG` must be set to `modolu-settle` and any other
value is a configuration error. `commit` is the same validated
`VERCEL_GIT_COMMIT_SHA` (40 lowercase hex characters) that `/health` reports —
one source for both routes, no fallback. If the slug or commit is missing or
malformed the route returns `500` with the error envelope below rather than
fabricated evidence. The shape lives only in `src/lib/xagent-verification.ts`.

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
[`.env.example`](./.env.example) for the full list. Chain ID (8453), the native
USDC contract (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`), decimals (6),
confirmation defaults/bounds (3, `1..64`), the 7-day expiry limit and the 16 KiB
body limit are code constants in `src/domain/payment-intent.ts`.

Money is exact everywhere: API decimal strings ⇄ `bigint` token units in the
domain ⇄ `numeric(78,0)` in PostgreSQL. JavaScript `number` is never used for
amounts.

## Deployment (Vercel)

One Vercel project, framework preset Next.js, Node.js 24 (selected from
`package.json` `engines.node`). Set `DATABASE_URL`, `DATABASE_URL_UNPOOLED`,
`ALCHEMY_BASE_RPC_URL` and `XAGENT_SLUG` per environment (previews must never
point at the production database); `VERCEL_ENV` and `VERCEL_GIT_COMMIT_SHA`
are provided by the platform. For schema-changing commits run `pnpm db:migrate`
against the target database before promoting the deployment. After each deploy verify `/health` reports the reviewed commit and
`/.well-known/xagent-verification.json` returns `200` with the same commit.
