import { describe, expect, it } from "vitest";

import {
  compareTransfers,
  confirmationDepth,
  reconcileExactPayer,
  type ObservedTransfer,
  type ReconciliationInput,
} from "@/domain/reconciliation";

const PAYER = "0xd8da6bf26964af9d7eed9e03e53415d37aa96045";
const RECIPIENT = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";

function transfer(overrides: Partial<ObservedTransfer> & { blockNumber: bigint; amountUnits: bigint }): ObservedTransfer {
  return {
    txHash: `0x${overrides.blockNumber.toString(16).padStart(64, "0")}`,
    logIndex: 0,
    blockHash: `0x${"b".repeat(64)}`,
    from: PAYER,
    to: RECIPIENT,
    blockTimestamp: new Date(Number(overrides.blockNumber) * 2_000),
    ...overrides,
  };
}

function input(overrides: Partial<ReconciliationInput> = {}): ReconciliationInput {
  return {
    expectedAmountUnits: 25_000_000n,
    requiredConfirmations: 3,
    latestBlock: 1_000n,
    transfers: [],
    ...overrides,
  };
}

describe("confirmationDepth", () => {
  it("is latest - block + 1, exactly, as bigint", () => {
    expect(confirmationDepth(1_000n, 1_000n)).toBe(1n);
    expect(confirmationDepth(998n, 1_000n)).toBe(3n);
    expect(confirmationDepth(0n, 51_446_899n)).toBe(51_446_900n);
    expect(typeof confirmationDepth(1n, 2n)).toBe("bigint");
  });

  it("gives a block above the latest zero confirmations", () => {
    expect(confirmationDepth(1_001n, 1_000n)).toBe(0n);
  });
});

describe("compareTransfers", () => {
  it("orders by blockNumber, then logIndex, then txHash", () => {
    const rows = [
      { blockNumber: 10n, logIndex: 5, txHash: "0xbb" },
      { blockNumber: 9n, logIndex: 9, txHash: "0xzz" },
      { blockNumber: 10n, logIndex: 2, txHash: "0xcc" },
      { blockNumber: 10n, logIndex: 2, txHash: "0xaa" },
    ];
    expect([...rows].sort(compareTransfers)).toEqual([
      { blockNumber: 9n, logIndex: 9, txHash: "0xzz" },
      { blockNumber: 10n, logIndex: 2, txHash: "0xaa" },
      { blockNumber: 10n, logIndex: 2, txHash: "0xcc" },
      { blockNumber: 10n, logIndex: 5, txHash: "0xbb" },
    ]);
  });
});

describe("reconcileExactPayer", () => {
  it("zero transfers → pending with no evidence and confidence none", () => {
    expect(reconcileExactPayer(input())).toEqual({
      status: "pending",
      detectedAmountUnits: 0n,
      receivedAmountUnits: 0n,
      matchConfidence: "none",
      paidAt: null,
      transfers: [],
    });
  });

  it("a transfer in the latest block has exactly 1 confirmation and is detected", () => {
    const result = reconcileExactPayer(input({ transfers: [transfer({ blockNumber: 1_000n, amountUnits: 25_000_000n })] }));
    expect(result.status).toBe("detected");
    expect(result.transfers[0]?.confirmations).toBe(1n);
    expect(result.transfers[0]?.confirmed).toBe(false);
    expect(result.detectedAmountUnits).toBe(25_000_000n);
    expect(result.receivedAmountUnits).toBe(0n);
    expect(result.matchConfidence).toBe("exact_payer");
    expect(result.paidAt).toBeNull();
  });

  it("confirmations one below the threshold → detected; exactly at threshold → paid", () => {
    const below = reconcileExactPayer(input({ transfers: [transfer({ blockNumber: 999n, amountUnits: 25_000_000n })] }));
    expect(below.transfers[0]?.confirmations).toBe(2n);
    expect(below.status).toBe("detected");
    expect(below.receivedAmountUnits).toBe(0n);

    const at = reconcileExactPayer(input({ transfers: [transfer({ blockNumber: 998n, amountUnits: 25_000_000n })] }));
    expect(at.transfers[0]?.confirmations).toBe(3n);
    expect(at.transfers[0]?.confirmed).toBe(true);
    expect(at.status).toBe("paid");
    expect(at.receivedAmountUnits).toBe(25_000_000n);
    expect(at.paidAt).toEqual(new Date(998 * 2_000));
  });

  it("exact confirmed amount → paid with paidAt from that transfer", () => {
    const result = reconcileExactPayer(input({ transfers: [transfer({ blockNumber: 500n, amountUnits: 25_000_000n })] }));
    expect(result).toMatchObject({
      status: "paid",
      detectedAmountUnits: 25_000_000n,
      receivedAmountUnits: 25_000_000n,
      matchConfidence: "exact_payer",
      paidAt: new Date(500 * 2_000),
    });
  });

  it("multiple exact-payer transfers aggregate, and paidAt is the threshold-crossing transfer", () => {
    const result = reconcileExactPayer(
      input({
        expectedAmountUnits: 1_000_000_000n,
        transfers: [
          transfer({ blockNumber: 300n, amountUnits: 400_000_000n }),
          transfer({ blockNumber: 100n, amountUnits: 600_000_000n }),
          transfer({ blockNumber: 400n, amountUnits: 50_000_000n }),
        ],
      }),
    );
    expect(result.status).toBe("paid");
    expect(result.detectedAmountUnits).toBe(1_050_000_000n);
    expect(result.receivedAmountUnits).toBe(1_050_000_000n);
    expect(result.transfers.map((t) => t.blockNumber)).toEqual([100n, 300n, 400n]);
    // 600 (block 100) + 400 (block 300) = 1000 → crossing transfer is block 300, not the first or last.
    expect(result.paidAt).toEqual(new Date(300 * 2_000));
  });

  it("uses (blockNumber, logIndex) order within a block to pick paidAt", () => {
    const result = reconcileExactPayer(
      input({
        expectedAmountUnits: 30_000_000n,
        transfers: [
          transfer({ blockNumber: 700n, logIndex: 9, amountUnits: 20_000_000n, txHash: `0x${"9".repeat(64)}`, blockTimestamp: new Date(9_000) }),
          transfer({ blockNumber: 700n, logIndex: 2, amountUnits: 20_000_000n, txHash: `0x${"2".repeat(64)}`, blockTimestamp: new Date(2_000) }),
        ],
      }),
    );
    expect(result.transfers.map((t) => t.logIndex)).toEqual([2, 9]);
    expect(result.paidAt).toEqual(new Date(9_000));
  });

  it("under-confirmed transfers count toward detected but not received", () => {
    const result = reconcileExactPayer(
      input({
        expectedAmountUnits: 50_000_000n,
        transfers: [
          transfer({ blockNumber: 100n, amountUnits: 25_000_000n }), // confirmed
          transfer({ blockNumber: 1_000n, amountUnits: 25_000_000n }), // 1 confirmation
        ],
      }),
    );
    expect(result.status).toBe("detected");
    expect(result.detectedAmountUnits).toBe(50_000_000n);
    expect(result.receivedAmountUnits).toBe(25_000_000n);
    expect(result.paidAt).toBeNull();
  });

  it("MILESTONE 2 LIMITATION: confirmed-but-insufficient total reports detected (partial arrives in Milestone 3)", () => {
    const result = reconcileExactPayer(
      input({ expectedAmountUnits: 1_000_000_000n, transfers: [transfer({ blockNumber: 100n, amountUnits: 600_000_000n })] }),
    );
    expect(result.status).toBe("detected");
    expect(result.receivedAmountUnits).toBe(600_000_000n);
  });

  it("MILESTONE 2 LIMITATION: confirmed total above expected reports paid (overpaid arrives in Milestone 3)", () => {
    const result = reconcileExactPayer(input({ transfers: [transfer({ blockNumber: 100n, amountUnits: 30_000_000n })] }));
    expect(result.status).toBe("paid");
    expect(result.receivedAmountUnits).toBe(30_000_000n);
  });

  it("counts a duplicated (txHash, logIndex) identity exactly once", () => {
    const same = transfer({ blockNumber: 100n, amountUnits: 25_000_000n });
    const result = reconcileExactPayer(input({ transfers: [same, { ...same }, { ...same }] }));
    expect(result.transfers).toHaveLength(1);
    expect(result.detectedAmountUnits).toBe(25_000_000n);
  });

  it("keeps money and depth as bigint and never loses precision on large values", () => {
    const huge = 123_456_789_012_345_678_901_234_567_890n;
    const result = reconcileExactPayer(
      input({ expectedAmountUnits: huge, latestBlock: 9_007_199_254_740_993n, transfers: [transfer({ blockNumber: 9_007_199_254_740_990n, amountUnits: huge })] }),
    );
    expect(typeof result.receivedAmountUnits).toBe("bigint");
    expect(result.receivedAmountUnits).toBe(huge);
    expect(result.transfers[0]?.confirmations).toBe(4n);
    expect(result.status).toBe("paid");
  });

  it("a transfer above the latest block is never confirmed", () => {
    const result = reconcileExactPayer(input({ transfers: [transfer({ blockNumber: 1_001n, amountUnits: 25_000_000n })] }));
    expect(result.transfers[0]?.confirmations).toBe(0n);
    expect(result.status).toBe("detected");
  });

  it("marks every associated transfer as matched", () => {
    const result = reconcileExactPayer(input({ transfers: [transfer({ blockNumber: 1n, amountUnits: 1n })] }));
    expect(result.transfers.every((t) => t.association === "matched")).toBe(true);
  });
});
