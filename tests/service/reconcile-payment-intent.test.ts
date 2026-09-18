import { describe, expect, it } from "vitest";

import { AppError } from "@/lib/errors";
import { newPaymentIntentId } from "@/lib/ids";
import type { ChainTransfer } from "@/ports/chain-provider";
import { PayerRequiredError, reconcilePaymentIntent } from "@/services/reconcile-payment-intent";

import { FakeChainProvider, InMemoryPaymentRepository, type FakeChainState } from "./fakes";

const PAYER = "0xd8da6bf26964af9d7eed9e03e53415d37aa96045";
const RECIPIENT = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const OTHER = "0x1111111111111111111111111111111111111111";
const START_BLOCK = 1_000n;

function chainTransfer(overrides: Partial<ChainTransfer> & { blockNumber: bigint; amountUnits: bigint }): ChainTransfer {
  return {
    txHash: `0x${overrides.blockNumber.toString(16).padStart(64, "0")}`,
    logIndex: 0,
    blockHash: `0x${"b".repeat(64)}`,
    from: PAYER,
    to: RECIPIENT,
    ...overrides,
  };
}

async function setup(chain: FakeChainState, intentOverrides: { payerAddress?: string | null; expectedAmountUnits?: bigint; requiredConfirmations?: number } = {}) {
  const chainProvider = new FakeChainProvider(chain);
  const paymentRepository = new InMemoryPaymentRepository();
  const intent = await paymentRepository.createPaymentIntent({
    id: newPaymentIntentId(),
    externalReference: "INV-204",
    expectedAmountUnits: intentOverrides.expectedAmountUnits ?? 25_000_000n,
    recipientAddress: RECIPIENT,
    payerAddress: intentOverrides.payerAddress === undefined ? PAYER : intentOverrides.payerAddress,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    requiredConfirmations: intentOverrides.requiredConfirmations ?? 3,
    startBlock: START_BLOCK,
  });
  const reconcile = (requestId = "req_test") =>
    reconcilePaymentIntent(intent.id, { chainProvider, paymentRepository, requestId });
  return { chainProvider, paymentRepository, intent, reconcile };
}

async function captureAppError(promise: Promise<unknown>): Promise<AppError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    return error as AppError;
  }
  return expect.unreachable("expected an AppError");
}

describe("reconcilePaymentIntent — query window", () => {
  it("queries exactly [intent.startBlock, latestBlock] for payer → recipient", async () => {
    const { chainProvider, reconcile } = await setup({ latestBlock: 1_500n, transfers: [] });
    await reconcile();
    expect(chainProvider.transferQueries).toEqual([
      { fromBlock: START_BLOCK, toBlock: 1_500n, recipient: RECIPIENT, payer: PAYER },
    ]);
  });

  it("skips the log query when the window is empty (latest block below startBlock) and records a pending observation", async () => {
    const { chainProvider, reconcile, paymentRepository, intent } = await setup({ latestBlock: 999n, transfers: [] });
    const outcome = await reconcile();
    expect(chainProvider.transferQueries).toEqual([]);
    expect(outcome.intent.status).toBe("pending");
    expect(outcome.intent.lastReconciledBlock).toBe(999n);
    expect(paymentRepository.attempts).toEqual([
      expect.objectContaining({ paymentIntentId: intent.id, fromBlock: START_BLOCK, toBlock: 999n, latestBlock: 999n, candidateCount: 0, resultStatus: "pending" }),
    ]);
  });

  it("calculates confirmation depth from the same latest-block observation used for the query", async () => {
    const { reconcile, paymentRepository, intent } = await setup({
      latestBlock: 1_010n,
      transfers: [chainTransfer({ blockNumber: 1_010n, amountUnits: 25_000_000n })],
    });
    const outcome = await reconcile();
    expect(outcome.latestBlock).toBe(1_010n);
    expect(outcome.intent.status).toBe("detected");
    expect(paymentRepository.evidenceRows(intent.id)[0]?.confirmations).toBe(1);
  });

  it("fetches each distinct block timestamp once and maps it to every transfer in that block", async () => {
    const timestamps = new Map<bigint, Date>([
      [1_100n, new Date("2026-09-17T10:00:00.000Z")],
      [1_200n, new Date("2026-09-17T11:00:00.000Z")],
    ]);
    const { chainProvider, reconcile, paymentRepository, intent } = await setup({
      latestBlock: 1_300n,
      timestamps,
      transfers: [
        chainTransfer({ blockNumber: 1_100n, logIndex: 1, amountUnits: 5_000_000n, txHash: `0x${"1".repeat(64)}` }),
        chainTransfer({ blockNumber: 1_100n, logIndex: 7, amountUnits: 5_000_000n, txHash: `0x${"2".repeat(64)}` }),
        chainTransfer({ blockNumber: 1_200n, logIndex: 0, amountUnits: 15_000_000n, txHash: `0x${"3".repeat(64)}` }),
        chainTransfer({ blockNumber: 1_100n, logIndex: 9, amountUnits: 1n, txHash: `0x${"4".repeat(64)}` }),
      ],
    });
    const outcome = await reconcile();
    expect([...chainProvider.timestampRequests].sort()).toEqual([1_100n, 1_200n]);
    const rows = paymentRepository.evidenceRows(intent.id);
    expect(rows.map((row) => row.blockTimestamp.toISOString())).toEqual([
      "2026-09-17T10:00:00.000Z",
      "2026-09-17T10:00:00.000Z",
      "2026-09-17T10:00:00.000Z",
      "2026-09-17T11:00:00.000Z",
    ]);
    expect(outcome.intent.status).toBe("paid");
    expect(outcome.intent.paidAt).toEqual(new Date("2026-09-17T11:00:00.000Z"));
  });
});

describe("reconcilePaymentIntent — state and idempotency", () => {
  it("Test A: one confirmed matching transfer → paid, received = X, evidence persisted once", async () => {
    const { reconcile, paymentRepository, intent } = await setup({
      latestBlock: 1_100n,
      transfers: [chainTransfer({ blockNumber: 1_050n, amountUnits: 25_000_000n })],
    });
    const outcome = await reconcile();
    expect(outcome).toMatchObject({ applied: true, candidateCount: 1, latestBlock: 1_100n });
    expect(outcome.intent).toMatchObject({
      status: "paid",
      receivedAmountUnits: 25_000_000n,
      detectedAmountUnits: 25_000_000n,
      matchConfidence: "exact_payer",
      lastReconciledBlock: 1_100n,
    });
    expect(outcome.intent.paidAt).toEqual(new Date(1_050 * 2_000));
    expect(paymentRepository.evidenceRows(intent.id)).toHaveLength(1);
    expect(paymentRepository.evidenceRows(intent.id)[0]).toMatchObject({ association: "matched", confirmations: 51, amountUnits: 25_000_000n });
  });

  it("Test B: reconciling the same provider result again leaves received = X and the evidence count unchanged", async () => {
    const { reconcile, paymentRepository, intent } = await setup({
      latestBlock: 1_100n,
      transfers: [chainTransfer({ blockNumber: 1_050n, amountUnits: 25_000_000n })],
    });
    const first = await reconcile("req_1");
    const second = await reconcile("req_2");
    const third = await reconcile("req_3");
    for (const outcome of [first, second, third]) {
      expect(outcome.intent.receivedAmountUnits).toBe(25_000_000n);
      expect(outcome.intent.detectedAmountUnits).toBe(25_000_000n);
      expect(outcome.intent.status).toBe("paid");
    }
    expect(paymentRepository.evidenceRows(intent.id)).toHaveLength(1);
    expect(paymentRepository.attempts).toHaveLength(3);
    expect(second.intent.paidAt).toEqual(first.intent.paidAt);
  });

  it("Test C: a transfer gaining confirmations updates the existing evidence row instead of duplicating it", async () => {
    const { chainProvider, reconcile, paymentRepository, intent } = await setup({
      latestBlock: 1_050n,
      transfers: [chainTransfer({ blockNumber: 1_050n, amountUnits: 25_000_000n })],
    });
    const detected = await reconcile();
    expect(detected.intent.status).toBe("detected");
    const [row] = paymentRepository.evidenceRows(intent.id);
    expect(row?.confirmations).toBe(1);

    chainProvider.state.latestBlock = 1_052n;
    const paid = await reconcile();
    expect(paid.intent.status).toBe("paid");
    const rows = paymentRepository.evidenceRows(intent.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.confirmations).toBe(3);
    expect(rows[0]?.firstSeenAt).toEqual(row?.firstSeenAt);
  });

  it("Test D: provider failure leaves status and evidence unchanged and surfaces the retryable upstream error", async () => {
    const { chainProvider, reconcile, paymentRepository, intent } = await setup({
      latestBlock: 1_100n,
      transfers: [chainTransfer({ blockNumber: 1_050n, amountUnits: 25_000_000n })],
    });
    const before = await reconcile("req_ok");
    expect(before.intent.status).toBe("paid");

    const upstream = new AppError("UPSTREAM_UNAVAILABLE", "Blockchain provider is temporarily unavailable");
    chainProvider.state.failTransfers = upstream;
    chainProvider.state.latestBlock = 1_200n;
    const error = await captureAppError(reconcile("req_fail"));
    expect(error).toBe(upstream);
    expect(error.retryable).toBe(true);

    const after = await paymentRepository.getPaymentIntentById(intent.id);
    expect(after).toEqual(before.intent);
    expect(paymentRepository.evidenceRows(intent.id)).toHaveLength(1);
    expect(paymentRepository.attempts.at(-1)).toMatchObject({
      requestId: "req_fail",
      errorCode: "UPSTREAM_UNAVAILABLE",
      resultStatus: null,
      latestBlock: 1_200n,
      candidateCount: 0,
    });
  });

  it("Test D (latest block failure): nothing is queried or written except a failed attempt", async () => {
    const { chainProvider, reconcile, paymentRepository, intent } = await setup({ latestBlock: 0n, transfers: [] });
    chainProvider.state.failLatestBlock = new AppError("UPSTREAM_UNAVAILABLE", "down");
    await captureAppError(reconcile());
    expect(chainProvider.transferQueries).toEqual([]);
    expect((await paymentRepository.getPaymentIntentById(intent.id))?.lastReconciledBlock).toBeNull();
    expect(paymentRepository.attempts).toEqual([expect.objectContaining({ errorCode: "UPSTREAM_UNAVAILABLE", latestBlock: null })]);
  });

  it("Test D (timestamp failure): evidence is not written when block timestamps cannot be fetched", async () => {
    const { chainProvider, reconcile, paymentRepository, intent } = await setup({
      latestBlock: 1_100n,
      transfers: [chainTransfer({ blockNumber: 1_050n, amountUnits: 25_000_000n })],
    });
    chainProvider.state.failTimestamps = new AppError("UPSTREAM_UNAVAILABLE", "down");
    await captureAppError(reconcile());
    expect(paymentRepository.evidenceRows(intent.id)).toHaveLength(0);
    expect((await paymentRepository.getPaymentIntentById(intent.id))?.status).toBe("pending");
  });

  it("Test E: an older latest-block observation arriving after a newer one does not overwrite intent state", async () => {
    const { chainProvider, reconcile, paymentRepository, intent } = await setup({
      latestBlock: 1_100n,
      transfers: [chainTransfer({ blockNumber: 1_050n, amountUnits: 25_000_000n })],
    });
    const newer = await reconcile("req_newer");
    expect(newer.intent.status).toBe("paid");

    // A lagging node answers with an older head and, consequently, no transfers.
    chainProvider.state.latestBlock = 1_040n;
    chainProvider.state.transfers = [];
    const stale = await reconcile("req_stale");
    expect(stale.applied).toBe(false);
    expect(stale.intent).toEqual(newer.intent);
    expect((await paymentRepository.getPaymentIntentById(intent.id))?.lastReconciledBlock).toBe(1_100n);
    expect(paymentRepository.attempts.at(-1)).toMatchObject({ requestId: "req_stale", errorCode: "STALE_OBSERVATION", resultStatus: null });
  });

  it("the provider's unexpected non-upstream error propagates without recording a misleading attempt", async () => {
    const { chainProvider, reconcile, paymentRepository } = await setup({ latestBlock: 1_100n, transfers: [] });
    chainProvider.state.failTransfers = new Error("bug in adapter");
    await expect(reconcile()).rejects.toThrow("bug in adapter");
    expect(paymentRepository.attempts).toEqual([]);
  });
});

describe("reconcilePaymentIntent — guards", () => {
  it("throws INTENT_NOT_FOUND for an unknown ID", async () => {
    const { chainProvider, paymentRepository } = await setup({ latestBlock: 1n, transfers: [] });
    const error = await captureAppError(
      reconcilePaymentIntent(newPaymentIntentId(), { chainProvider, paymentRepository, requestId: "req_x" }),
    );
    expect(error.code).toBe("INTENT_NOT_FOUND");
    expect(chainProvider.calls).toBe(0);
  });

  it("MILESTONE 2 LIMITATION: refuses payer-less intents deterministically without querying the chain", async () => {
    const { chainProvider, reconcile } = await setup({ latestBlock: 1_100n, transfers: [] }, { payerAddress: null });
    const error = await captureAppError(reconcile());
    expect(error).toBeInstanceOf(PayerRequiredError);
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(chainProvider.calls).toBe(0);
    expect(chainProvider.transferQueries).toEqual([]);
  });

  it("rejects a transfer the provider returns outside the payer/recipient filter", async () => {
    const chainProvider = new FakeChainProvider({ latestBlock: 1_100n, transfers: [] });
    chainProvider.getUsdcTransfers = async () => [chainTransfer({ blockNumber: 1_050n, amountUnits: 1n, from: OTHER })];
    const paymentRepository = new InMemoryPaymentRepository();
    const intent = await paymentRepository.createPaymentIntent({
      id: newPaymentIntentId(),
      externalReference: null,
      expectedAmountUnits: 1n,
      recipientAddress: RECIPIENT,
      payerAddress: PAYER,
      expiresAt: new Date(Date.now() + 60_000),
      requiredConfirmations: 1,
      startBlock: START_BLOCK,
    });
    const error = await captureAppError(reconcilePaymentIntent(intent.id, { chainProvider, paymentRepository, requestId: "r" }));
    expect(error.code).toBe("UPSTREAM_INVALID_RESPONSE");
    expect(paymentRepository.evidenceRows(intent.id)).toHaveLength(0);
  });

  it("MILESTONE 2 LIMITATION: reconciles through the latest block even after expiresAt (expiry arrives in Milestone 3)", async () => {
    const chainProvider = new FakeChainProvider({
      latestBlock: 1_100n,
      transfers: [chainTransfer({ blockNumber: 1_050n, amountUnits: 25_000_000n })],
    });
    const paymentRepository = new InMemoryPaymentRepository();
    const intent = await paymentRepository.createPaymentIntent({
      id: newPaymentIntentId(),
      externalReference: null,
      expectedAmountUnits: 25_000_000n,
      recipientAddress: RECIPIENT,
      payerAddress: PAYER,
      expiresAt: new Date(Date.now() - 60_000),
      requiredConfirmations: 3,
      startBlock: START_BLOCK,
    });
    const outcome = await reconcilePaymentIntent(intent.id, { chainProvider, paymentRepository, requestId: "r" });
    expect(outcome.intent.status).toBe("paid");
    expect(chainProvider.transferQueries[0]?.toBlock).toBe(1_100n);
  });
});
