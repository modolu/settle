# Settle — Arc Microgrants Progress

## Approved scope

### Must-have / demo path
- Preserve the exact X-Agent submission commit/deployment.
- Add `chain: "base" | "arc"` without breaking Base.
- Chain-aware USDC accounting: Base 6-decimal; Arc native-transfer accounting per current official Arc/Circle semantics.
- Base confirmation-depth behavior unchanged; Arc deterministic finality represented truthfully.
- Add an Arc mainnet chain provider and select providers by requested chain at creation and persisted `intent.chain` at reconciliation.
- Forward DB migration for Base + Arc; preserve all existing Base rows/migrations.
- Minimal Base/Arc UI selector and chain-aware evidence explorer links.
- Keep existing Base tests green; add critical Arc tests only.
- Separate Arc deployment/infrastructure later, after explicit approval at the deployment step.
- One minimal real Arc-mainnet USDC payment between two user-controlled wallets, reconciled to `paid` with explorer evidence. Stop for explicit approval before any real-money transaction.

### Nice-to-have
- Arc partial/overpaid UI demonstration using deterministic fixtures/tests.
- Small explanatory finality/network copy improvements.
- Concise Arc-specific README/demo section.
- Extra Arc RPC resilience only if the public RPC proves flaky.

### Cut
- Auth/accounts/API keys, MCP changes, new assets, chains beyond Base + Arc, wallet connection/custody, smart contracts, refunds/escrow, dashboards, analytics, background jobs, webhooks, queues, redesigns, and broad refactors.
- No extra real-money transactions for partial/overpaid; tests are sufficient.

## Task list
1. **Preserve submission + setup + funding-path check** — DONE
2. **Chain + money primitives** — IN PROGRESS
3. **Dual-chain API vertical slice** — TODO
4. **DB + repository** — TODO
5. **Provider routing** — TODO
6. **Arc provider** — TODO
7. **Arc reconciliation + critical tests** — TODO
8. **Minimal UI** — TODO
9. **MILESTONE: local Base + Arc demo / full checks** — TODO
10. **Separate production setup** — TODO (requires explicit approval before deployment/account-resource actions)
11. **MILESTONE: real Arc payment proof** — TODO (hard stop before signature/broadcast)
12. **Submission polish / final regression / demo** — TODO

## Decisions made
- Use Codex CLI as the implementation agent; Claude Code headless mode hung twice at kickoff, so we switched once to protect the deadline. Tech lead drives Codex headlessly, reviews actual diffs, verifies, and commits.
- X-Agent review commit is frozen at `25e958fcecaeb4ad20760c5a94c93a4670fd2b77`.
- Immutable tag `xagent-submission-2026` was created and pushed at that commit.
- Arc work uses branch `arc-microgrants`; X-Agent deployment must not be redeployed.
- Prefer a separate Arc Vercel project and separate Neon DB for isolation, but do not create/deploy them until the approved deployment step.
- Existing Alchemy Base provider remains intact except minimal shared-interface changes required for routing.
- No new dependencies unless explicitly approved.
- User controls two wallets for the eventual real Arc proof but currently has no Arc-mainnet USDC.

## Funding-path risk
- No Arc-mainnet USDC is currently available in the user's wallets.
- Current official Arc Portal guidance supports depositing USDC from supported networks via Circle CCTP; Arc fees are paid in USDC. This gives us a plausible funding route without changing Settle or handling private keys.
- No bridge/deposit/purchase/funding action has been executed. We will verify exact route, quote, minimums, fee, and wallet balances before the real-payment milestone and stop for user approval.

## Later
- API keys/accounts/teams.
- Webhooks/SDK/MCP packaging.
- More chains/assets.
- Custom domain and stronger production rate limiting.
- Broader Arc provider redundancy/observability after the hackathon.

## Known issues / workarounds
- Local machine currently has Node 22.23.2 while `package.json` correctly requires Node 24.x. Do not downgrade the project. Final CI/deployment must use Node 24; existing baseline previously passed under Node 22 with the expected engine warning.
- `TEST_DATABASE_URL` may be absent locally; if so, DB integration tests are skipped and must be reported as skipped, not passed.
- Disk space is limited; avoid duplicate dependency trees or unnecessary installs.

## Time check
- Build window started around 2026-10-14 22:00 WAT after scope approval.
- Current phase: Task 2/12.
- Target feature freeze: +5 hours; final hour reserved for fixes/deployment/proof/docs/demo.
- Status: ON TRACK — Task 1 complete at 22:03 WAT.
