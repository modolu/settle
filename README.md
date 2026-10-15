# Settle

<p align="center">
  <img src="./public/settle-logo.svg" alt="Settle" width="320" />
</p>

<p align="center"><strong>Payment truth for autonomous agents.</strong></p>

Settle is an API-first, read-only USDC reconciliation layer for autonomous agents. An agent declares the payment it expects, the payer sends USDC directly onchain, and Settle independently verifies canonical chain evidence before returning a deterministic status the agent can act on.

Settle currently supports **Base** and **Arc mainnet**. It never holds private keys, never takes custody, and never signs or broadcasts payments.

**Live Arc demo:** https://settle-arc.vercel.app  
**Arc Microgrants branch:** `arc-microgrants`  
**Real Arc proof transaction:** https://explorer.arc.io/tx/0x588d0c9423a459f040cbe7af96c7c2d70e26a13fc14933f48d7dc234d6703ae7

## Why Settle

Agents can create invoices and trigger workflows, but a blockchain transaction still leaves a hard question: **did the expected payment actually happen, with the right amount, sender, recipient, timing and finality?**

A transaction hash alone is not enough. Agents need a stable machine-readable answer backed by evidence.

Settle turns an expected payment into a deterministic state machine:

`pending → detected → partial → paid / overpaid / expired / ambiguous`

The API returns exact decimal amounts plus the canonical transaction evidence used to reach that state.

## How it works

1. **Declare** — create an intent with chain, amount, recipient, optional payer, expiry and finality requirements.
2. **Pay** — USDC moves directly from payer to recipient outside Settle.
3. **Reconcile** — Settle scans canonical onchain evidence for that intent's payment window.
4. **Verify** — the caller receives a deterministic status, exact amounts and evidence.

The web interface is a demo console. **The API is the product.**

## Why Arc

Arc is a strong fit for agentic payments because USDC is native to the network and transaction fees are paid in USDC. Settle models Arc's payment semantics directly instead of pretending every EVM rail behaves like Base.

| Rail | USDC accounting | Finality model | Provider path |
| --- | --- | --- | --- |
| Base | native Circle USDC, 6 decimals | configurable confirmation depth, default 3 | Alchemy Transfers discovery + canonical receipt verification |
| Arc mainnet | native/system USDC, 18-decimal system units | deterministic finality on inclusion, represented as 1 confirmation | Arc JSON-RPC + native system Transfer emitter |

For Arc, Settle monitors the native/system emitter `0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE` and stores exact 18-decimal system units. The compatibility USDC interface `0x3600000000000000000000000000000000000000` is retained as asset metadata. The provider chunks `eth_getLogs` scans into windows of at most 9,999 blocks and fails closed if any chunk fails.

## Real Arc mainnet proof

A real user-approved Arc mainnet payment was reconciled end-to-end in production.

| Field | Proof |
| --- | --- |
| Intent | `pi_i0vBa7M1h7j72kwXVrFS5uEt7V0ehmfV` |
| Chain | Arc mainnet (`5042`) |
| Expected | `0.10 USDC` |
| Received | `0.10 USDC` |
| Result | `paid` |
| Match | `exact_payer` |
| Required confirmations | `1` |
| Block | `26004010` |
| Transaction | `0x588d0c9423a459f040cbe7af96c7c2d70e26a13fc14933f48d7dc234d6703ae7` |

Independent Arc RPC verification confirmed the transaction succeeded, transferred exactly `0.10` native USDC from the declared payer to recipient, emitted the native system Transfer event at log index `0`, and changed the recipient balance from `0` to `0.10` at inclusion.

## Demo console

The deployed UI uses the same public REST API an agent would use.

- `/` — explain the reconciliation loop and create a Base or Arc payment intent.
- `/inspect/<id>` — inspect status, expected/received/remaining amounts, obligation metadata, canonical evidence, explorer links and copyable agent API calls.
- Automatic reconciliation runs every 7 seconds while an open intent is visible, and stops on terminal states or repeated failures.

For the fastest judge demo, open the production proof directly:

`https://settle-arc.vercel.app/inspect/pi_i0vBa7M1h7j72kwXVrFS5uEt7V0ehmfV`

## Public API

### Create an intent

`POST /v1/payment-intents`

Required fields are chain, asset, amount, recipient and expiry. A payer is optional but strongly recommended because it enables exact-payer matching. Base defaults to 3 confirmations; Arc is final on inclusion and therefore requires 1.

### Read an intent

`GET /v1/payment-intents/:id`

Reads persisted state only. It does not touch the chain.

### Reconcile

`POST /v1/payment-intents/:id/reconcile`

Caller-triggered reconciliation performs a complete canonical scan of the intent's payment window, verifies transfers, updates evidence idempotently and returns the new state.

### Evidence

`GET /v1/payment-intents/:id/evidence`

Returns persisted evidence in canonical `(blockNumber, logIndex, txHash)` order. Evidence is marked `matched`, `candidate` or `orphaned`; only matched canonical evidence counts toward totals.

### Health

`GET /health`

Returns service status, environment, exact deployed Git commit and timestamp.

## Status semantics

| Status | Meaning |
| --- | --- |
| `pending` | no matching payment evidence observed |
| `detected` | matching evidence exists but is not yet final under the selected rail's rules |
| `partial` | confirmed amount is greater than zero but below expected |
| `paid` | confirmed amount equals expected |
| `overpaid` | confirmed amount exceeds expected |
| `expired` | payment window is conclusively closed while confirmed amount is short |
| `ambiguous` | no payer was declared and more than one plausible sender exists; nothing is counted |

When a payer is declared, matching is exact. Without a payer, Settle only counts a single unambiguous sender.

## Exact money model

Money never uses JavaScript floating point.

`API decimal string ⇄ bigint chain units ⇄ PostgreSQL numeric(78,0)`

- Base: up to 6 USDC decimals.
- Arc: up to 18 decimals for native/system accounting.
- Public responses remain human-readable decimal strings.

## Architecture

```text
HTTP routes
    ↓
services
    ↓
domain + ports
    ↑
repositories / chain providers
```

Key properties:

- caller-triggered reconciliation; no cron or background workers;
- persisted `intent.chain` chooses the reconciliation provider;
- provider work happens before the database transaction;
- database reconciliation is atomic and row-locked;
- a provider failure never becomes "no payment" and never orphans evidence;
- every reconciliation recomputes canonical evidence instead of incrementing balances;
- evidence is keyed idempotently by `(intent, txHash, logIndex)`;
- expiry resolves to a chain block boundary, not a local wall-clock guess.

Technical source of truth: [`ARCHITECTURE.md`](./ARCHITECTURE.md)  
Product brief: [`SETTLE_PRODUCT_BRIEF.md`](./SETTLE_PRODUCT_BRIEF.md)

## Stack

- Next.js 16 App Router + React 19 + TypeScript 6
- Tailwind CSS 4
- Neon PostgreSQL + Drizzle ORM
- viem 2
- Zod 4
- Alchemy for Base
- Arc public JSON-RPC for Arc mainnet
- Vitest + Playwright
- Vercel, Node.js 24

## Local setup

Requires Node.js 24 and pnpm 10.

```bash
pnpm install
cp .env.example .env.local
pnpm db:migrate
pnpm dev
```

Required server-side configuration:

```text
DATABASE_URL=...
DATABASE_URL_UNPOOLED=...
ALCHEMY_BASE_RPC_URL=...
ARC_MAINNET_RPC_URL=https://rpc.mainnet.arc.io
```

Migrations are explicit. They are never run from `next build`, application startup or request handlers.

## Verification

Primary checks:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Current Arc submission baseline:

- **541 tests passed**
- **27 database integration tests skipped locally** because `TEST_DATABASE_URL` is intentionally absent
- ESLint: passing
- TypeScript: passing
- production build: passing
- desktop and 390px mobile UI reviewed
- real Arc mainnet payment proof: passing

Database integration tests can be enabled with a dedicated database:

```bash
TEST_DATABASE_URL=postgres://... pnpm test tests/integration
```

## Security / trust boundaries

Settle is intentionally read-only.

- no private keys;
- no wallet custody;
- no transaction signing or broadcasting;
- no escrow or refunds;
- opaque 192-bit capability IDs for intents;
- strict request validation and 16 KiB JSON body limit;
- exact chain/provider errors fail closed;
- secrets are server-only and redacted from logs;
- CSP, no-store caching and restrictive security headers;
- no endpoint lists all payment intents.

The payment happens outside Settle. Settle only records the obligation and verifies what the chain proves happened.

## Deployment isolation

The Arc Microgrants version is deployed separately at `settle-arc.vercel.app` with its own Vercel project and isolated Neon database.

The earlier X-Agent submission remains frozen at review commit:

`25e958fcecaeb4ad20760c5a94c93a4670fd2b77`

Arc work lives on `arc-microgrants`; the original X-Agent production deployment is not redeployed by this branch.

## Submission assets

- Square logo: `public/settle-logo-1024.png`
- Vector mark: `public/settle-mark.svg`
- Horizontal lockup: `public/settle-logo.svg`
- Form-ready Arc submission copy: [`SUBMISSION_ARC.md`](./SUBMISSION_ARC.md)
- Demo script/checklist: [`DEMO_ARC.md`](./DEMO_ARC.md)
