/**
 * Pure reconciliation engine (ARCHITECTURE.md §7). Given one observation of
 * the chain — the latest block plus the canonical exact-payer USDC transfers
 * inside the intent's window — it computes detected/received amounts, the
 * payment status, `paidAt` and the match confidence.
 *
 * Milestone 2 scope: exact-payer association only (the service/provider
 * boundary has already filtered transfers to `payer → recipient`). Supported
 * statuses are `pending`, `detected` and `paid`. `partial`, `overpaid`,
 * `expired`, no-payer association and `ambiguous` arrive in Milestone 3;
 * until then a confirmed-but-insufficient total reports `detected` and a
 * confirmed total above the expected amount reports `paid`.
 *
 * Pure TypeScript: no framework, database, RPC or environment imports.
 */
import type { MatchConfidence, PaymentStatus, TransferAssociation } from "./payment-intent";

/** One canonical USDC transfer as seen on chain, before confirmation depth is known. */
export interface ObservedTransfer {
  readonly txHash: string;
  readonly logIndex: number;
  readonly blockNumber: bigint;
  readonly blockHash: string;
  readonly from: string;
  readonly to: string;
  readonly amountUnits: bigint;
  readonly blockTimestamp: Date;
}

/** An observed transfer annotated with its depth at the observation's latest block. */
export interface ReconciledTransfer extends ObservedTransfer {
  /** `latestBlock - blockNumber + 1`; exact, never a JavaScript number. */
  readonly confirmations: bigint;
  readonly confirmed: boolean;
  readonly association: TransferAssociation;
}

export interface ReconciliationInput {
  readonly expectedAmountUnits: bigint;
  readonly requiredConfirmations: number;
  readonly latestBlock: bigint;
  readonly transfers: readonly ObservedTransfer[];
}

/** Statuses the Milestone 2 engine can produce. */
export type ReconciledStatus = Extract<PaymentStatus, "pending" | "detected" | "paid">;

export interface ReconciliationResult {
  readonly status: ReconciledStatus;
  /** Sum of all associated transfers regardless of confirmation depth. */
  readonly detectedAmountUnits: bigint;
  /** Sum of associated transfers with `confirmations >= requiredConfirmations`. */
  readonly receivedAmountUnits: bigint;
  readonly matchConfidence: Extract<MatchConfidence, "none" | "exact_payer">;
  /** Block timestamp of the transfer that first brought the confirmed total to the expected amount. */
  readonly paidAt: Date | null;
  /** Deduplicated, ordered by `(blockNumber, logIndex, txHash)`, with confirmation depth. */
  readonly transfers: readonly ReconciledTransfer[];
}

/**
 * Base block confirmation depth: a transfer mined in the latest block has
 * exactly one confirmation. A transfer above the latest block (inconsistent
 * evidence) has zero and can never count as confirmed.
 */
export function confirmationDepth(blockNumber: bigint, latestBlock: bigint): bigint {
  return blockNumber <= latestBlock ? latestBlock - blockNumber + 1n : 0n;
}

/** Canonical evidence order (ARCHITECTURE.md §9): block, then log index, then tx hash. */
export function compareTransfers(
  a: Pick<ObservedTransfer, "blockNumber" | "logIndex" | "txHash">,
  b: Pick<ObservedTransfer, "blockNumber" | "logIndex" | "txHash">,
): number {
  if (a.blockNumber !== b.blockNumber) {
    return a.blockNumber < b.blockNumber ? -1 : 1;
  }
  if (a.logIndex !== b.logIndex) {
    return a.logIndex - b.logIndex;
  }
  return a.txHash < b.txHash ? -1 : a.txHash > b.txHash ? 1 : 0;
}

/** Transfer identity used by the double-counting guard: `(txHash, logIndex)`. */
export function transferIdentity(transfer: Pick<ObservedTransfer, "txHash" | "logIndex">): string {
  return `${transfer.txHash}:${transfer.logIndex}`;
}

export function reconcileExactPayer(input: ReconciliationInput): ReconciliationResult {
  const required = BigInt(input.requiredConfirmations);

  // Each (txHash, logIndex) identity counts exactly once, whatever the provider returned.
  const unique = new Map<string, ObservedTransfer>();
  for (const transfer of input.transfers) {
    const identity = transferIdentity(transfer);
    if (!unique.has(identity)) {
      unique.set(identity, transfer);
    }
  }

  const transfers: ReconciledTransfer[] = [...unique.values()].sort(compareTransfers).map((transfer) => {
    const confirmations = confirmationDepth(transfer.blockNumber, input.latestBlock);
    return {
      ...transfer,
      confirmations,
      confirmed: confirmations >= required,
      association: "matched",
    };
  });

  let detectedAmountUnits = 0n;
  let receivedAmountUnits = 0n;
  let paidAt: Date | null = null;
  for (const transfer of transfers) {
    detectedAmountUnits += transfer.amountUnits;
    if (transfer.confirmed) {
      receivedAmountUnits += transfer.amountUnits;
      if (paidAt === null && receivedAmountUnits >= input.expectedAmountUnits) {
        paidAt = transfer.blockTimestamp;
      }
    }
  }

  if (transfers.length === 0) {
    return {
      status: "pending",
      detectedAmountUnits,
      receivedAmountUnits,
      matchConfidence: "none",
      paidAt: null,
      transfers,
    };
  }
  if (receivedAmountUnits >= input.expectedAmountUnits) {
    return {
      status: "paid",
      detectedAmountUnits,
      receivedAmountUnits,
      matchConfidence: "exact_payer",
      paidAt,
      transfers,
    };
  }
  // Milestone 2: any associated evidence short of the confirmed obligation is `detected`,
  // including confirmed-but-insufficient totals that Milestone 3 will report as `partial`.
  return {
    status: "detected",
    detectedAmountUnits,
    receivedAmountUnits,
    matchConfidence: "exact_payer",
    paidAt: null,
    transfers,
  };
}
