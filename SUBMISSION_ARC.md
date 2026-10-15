# Settle — Arc Microgrants Submission Copy

Use this file as the source of truth when filling the submission form. Trim to the form's character limits rather than rewriting the claims.

## Project name

**Settle**

## Tagline

**Payment truth for autonomous agents.**

## One-line description

Settle is a read-only USDC reconciliation API that lets autonomous agents verify whether an expected payment actually happened on Arc or Base, with deterministic status and canonical onchain evidence.

## Short description

Autonomous agents can initiate workflows, but they still need a reliable way to know whether an onchain payment really arrived. Settle lets an agent declare an expected USDC payment, then independently reads the chain and returns a deterministic status — pending, detected, partial, paid, overpaid, expired or ambiguous — plus the exact transaction evidence behind that result. Settle is non-custodial and read-only: it never holds keys or sends funds.

## Full project description

Settle is payment reconciliation infrastructure for autonomous agents.

An agent first creates a payment intent describing what it expects: chain, USDC amount, recipient, optional payer, expiry and finality requirements. The actual payment happens directly between wallets, outside Settle. When the agent reconciles the intent, Settle scans canonical chain evidence, verifies the transfer and returns a deterministic status plus exact evidence the agent can use to continue or stop a workflow.

The current product supports Arc mainnet and Base. Base uses confirmation-depth finality and native Circle USDC. Arc is handled as its own settlement rail: Settle accounts for native/system USDC, monitors Arc's native system Transfer emitter and models Arc deterministic finality as final on inclusion.

The result is a simple machine-readable payment truth layer. Agents no longer need to trust a user-supplied transaction hash or build chain-specific reconciliation logic into every workflow.

Settle never holds private keys, never takes custody and never signs or broadcasts payments. The web app is a demo console; the public API is the product.

## Problem

Autonomous agents can create orders, reserve resources and trigger actions, but blockchain payment verification is still easy to get wrong. A transaction hash can point to the wrong amount, wrong recipient, wrong sender, wrong chain or a transaction outside the expected payment window. Different chains also have different finality and asset semantics.

Without a deterministic reconciliation layer, every agent developer has to rebuild this logic and decide what evidence is trustworthy.

## Solution

Settle separates the payment obligation from the payment itself.

The agent declares what it expects. Settle later verifies canonical chain state and returns one deterministic status with the evidence used to reach it. Matching can be exact to a declared payer, and payer-less intents fail safely to `ambiguous` when more than one plausible sender exists.

This makes payment verification composable: an agent can call Settle, check the status and act without custodying funds or trusting user-provided payment claims.

## Why Arc

Arc is particularly suited to agentic payments because USDC is native to the network and fees are paid in USDC. That reduces asset complexity for automated systems.

Settle uses Arc-specific semantics rather than forcing Arc through a Base-style confirmation model. It monitors the native/system USDC transfer stream, stores exact 18-decimal system units, and represents Arc deterministic finality as one final confirmation on inclusion.

This lets an agent reason about Arc payments with a clean API while Settle handles the chain-specific details underneath.

## What is technically interesting

- Dual-chain provider architecture selected from persisted `intent.chain`.
- Exact money arithmetic using decimal strings, bigint chain units and PostgreSQL `numeric(78,0)`; no floating point for money.
- Arc native/system USDC support using the native transfer emitter.
- Arc `eth_getLogs` scans chunked to at most 9,999 blocks and failed closed on any partial scan failure.
- Base transfer discovery through Alchemy with independent canonical receipt verification.
- Reconciliation is idempotent and reorg-aware: evidence can become orphaned and stops counting.
- Payer-less multi-sender payments resolve to `ambiguous` instead of guessing.
- Caller-triggered reconciliation means no cron, queue or background worker is required.

## Real Arc mainnet proof

Settle successfully reconciled a real user-approved Arc mainnet payment in production.

- Intent: `pi_i0vBa7M1h7j72kwXVrFS5uEt7V0ehmfV`
- Expected: `0.10 USDC`
- Received: `0.10 USDC`
- Result: `paid`
- Match: `exact_payer`
- Arc block: `26004010`
- Transaction: `0x588d0c9423a459f040cbe7af96c7c2d70e26a13fc14933f48d7dc234d6703ae7`

Explorer:
https://explorer.arc.io/tx/0x588d0c9423a459f040cbe7af96c7c2d70e26a13fc14933f48d7dc234d6703ae7

The production Settle evidence matches the transaction hash, payer, recipient, amount, block and Arc finality result.

## Live product

https://settle-arc.vercel.app

Direct proof inspector:
https://settle-arc.vercel.app/inspect/pi_i0vBa7M1h7j72kwXVrFS5uEt7V0ehmfV

## Repository

GitHub repository: `modolu/settle`  
Submission branch: `arc-microgrants`

## Tech stack

Next.js 16, React 19, TypeScript 6, Tailwind CSS 4, Neon PostgreSQL, Drizzle ORM, viem, Zod, Alchemy for Base, Arc JSON-RPC, Vitest, Playwright and Vercel.

## Current verification

- 541 tests passing.
- 27 database integration tests intentionally skipped locally because `TEST_DATABASE_URL` is not configured.
- ESLint passing.
- TypeScript passing.
- production build passing.
- responsive UI reviewed at desktop and 390px mobile widths.
- real Arc mainnet payment reconciled to `paid` with canonical evidence.

## Business / ecosystem direction

Settle can become a small, composable payment-verification primitive for agent frameworks, marketplaces and automated service workflows. The next logical product layer is authenticated API access, webhooks/SDKs and more settlement rails, while keeping reconciliation read-only and chain-verifiable.

## Roadmap

1. API keys and account-level access controls.
2. Webhooks and SDKs so agents can subscribe to payment-state changes.
3. MCP / agent-framework packaging.
4. More chains and stablecoin rails behind the same intent model.
5. Stronger production observability and provider redundancy.

## What Settle is not

Settle is not a wallet, exchange, payment processor, escrow service or custody product. It does not move money. It records an expected obligation and verifies what the chain proves happened.
