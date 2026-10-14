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
2. **Chain + money primitives** — DONE
3. **Dual-chain API vertical slice** — DONE
4. **DB + repository** — DONE
5. **Provider routing** — DONE
6. **Arc provider** — DONE
7. **Arc reconciliation + critical tests** — DONE
8. **Minimal UI** — DONE
9. **MILESTONE: local Base + Arc demo / full checks** — DONE
10. **Separate production setup** — IN PROGRESS (user approved external infrastructure/deployment actions)
11. **MILESTONE: real Arc payment proof** — TODO (hard stop before signature/broadcast)
12. **Submission polish / final regression / demo** — TODO

## Decisions made
- Use Codex CLI as the implementation agent; Claude Code headless mode hung twice at kickoff, so we switched once to protect the deadline. Tech lead drives Codex headlessly, reviews actual diffs, verifies, and commits.
- X-Agent review commit is frozen at `25e958fcecaeb4ad20760c5a94c93a4670fd2b77`.
- Immutable tag `xagent-submission-2026` was created and pushed at that commit.
- Arc work uses branch `arc-microgrants`; X-Agent deployment must not be redeployed.
- Prefer a separate Arc Vercel project and separate Neon DB for isolation. User approved external infrastructure/deployment actions; separate Vercel project `settle-arc` is now created, while the isolated Neon database still needs to be connected/provisioned.
- Existing Alchemy Base provider remains intact except minimal shared-interface changes required for routing.
- No new dependencies unless explicitly approved.
- Tasks 3–7 were implemented and verified as one coherent vertical slice because accepting Arc at the API before persistence/provider/finality support existed would create an unsafe intermediate state.
- Arc payment intents persist `chain=arc`, the `0x3600…` compatibility interface as metadata, and exact 18-decimal native/system units. Reconciliation routes strictly from persisted `intent.chain`.
- Arc provider monitors only the native/system emitter, chunks `getLogs` into ≤9,999-block windows, and fails the full scan on any chunk/error; it never combines the duplicate ERC-20 event stream.
- Arc deterministic finality is represented as one final confirmation on inclusion; Base confirmation-depth behavior remains unchanged.
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
- Local shell currently has Node 22.12.0 while `package.json` correctly requires Node 24.x. Do not downgrade the project. Final CI/deployment must use Node 24; existing baseline previously passed under Node 22 with the expected engine warning.
- `TEST_DATABASE_URL` may be absent locally; if so, DB integration tests are skipped and must be reported as skipped, not passed.
- Disk space is limited; avoid duplicate dependency trees or unnecessary installs.
- Coding-agent blocker at ~22:09 WAT: Claude Code headless hung on three checks; Codex CLI is authenticated but usage-limited until 2026-10-15 02:08 WAT. User explicitly approved direct implementation through Desktop Commander, so this is no longer a build blocker.
- Local `pnpm` cannot run under the current Node 22.12.0 because pnpm 10.34.5 requires >=22.13; verification currently invokes committed local binaries directly (`./node_modules/.bin/...`) without changing system Node or installing anything.

## Time check
- Build window started around 2026-10-14 22:00 WAT after scope approval.
- Current phase: Task 10/12 separate production setup.
- Target feature freeze: +5 hours; final hour reserved for fixes/deployment/proof/docs/demo.
- Status: ON TRACK — Task 9 milestone approved by the user. Full Vitest: 541 passed, 27 DB integration tests skipped because `TEST_DATABASE_URL` is absent. Full ESLint, TypeScript typecheck, and production `next build` are green. Task 10 started: `arc-microgrants` is pushed, separate Vercel project `settle-arc` exists on Node 24 with public Arc RPC configured, and the frozen X-Agent `/health` still reports review commit `25e958fcecaeb4ad20760c5a94c93a4670fd2b77`. Remaining setup blocker is isolated Neon provisioning plus the Base Alchemy secret for the new Vercel project; no secrets are copied into chat or the repo.
