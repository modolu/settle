/**
 * Use case: caller-triggered reconciliation of one intent (ARCHITECTURE.md §8.2).
 *
 *   load intent
 *   → require a declared payer (Milestone 2 supports exact-payer matching only)
 *   → latestBlock = ChainProvider.getLatestBlock()
 *   → window = [intent.startBlock, latestBlock]
 *   → ChainProvider.getUsdcTransfers(payer → recipient in window)
 *   → one timestamp lookup per distinct block
 *   → pure domain reconciliation
 *   → repository applies the observation atomically
 *
 * Provider calls happen outside any database transaction. A provider failure
 * is recorded as a failed attempt (when the database allows) and re-thrown as
 * the retryable upstream error; it never touches intent state or evidence.
 *
 * Milestone 2 limitation: the window ends at the latest block even after
 * `expiresAt`; expiry-block resolution and `expired` belong to Milestone 3.
 */
import "server-only";

import type { PaymentIntent } from "@/domain/payment-intent";
import { reconcileExactPayer, type ObservedTransfer } from "@/domain/reconciliation";
import { AppError, isAppError } from "@/lib/errors";
import type { ChainProvider, ChainTransfer } from "@/ports/chain-provider";
import type { PaymentRepository } from "@/ports/payment-repository";

export interface ReconcilePaymentIntentDeps {
  readonly chainProvider: ChainProvider;
  readonly paymentRepository: PaymentRepository;
  readonly requestId: string;
  /** Clock seam for tests; defaults to the system clock. */
  readonly now?: () => Date;
}

export interface ReconcileOutcome {
  readonly intent: PaymentIntent;
  /** `false` when a newer observation had already been applied and this one was only recorded. */
  readonly applied: boolean;
  readonly latestBlock: bigint;
  readonly candidateCount: number;
}

/**
 * Milestone 2 does not implement no-payer association (ARCHITECTURE.md §7.3
 * arrives in Milestone 3). Reconciling such an intent is refused
 * deterministically instead of scanning every transfer to the recipient.
 */
export class PayerRequiredError extends AppError {
  constructor() {
    super(
      "VALIDATION_ERROR",
      "Reconciliation of intents without a declared payer is not available yet; create the intent with a payer address",
    );
    this.name = "PayerRequiredError";
  }
}

function assertMatchesIntent(transfer: ChainTransfer, payer: string, recipient: string): void {
  if (transfer.from !== payer || transfer.to !== recipient) {
    throw new AppError("UPSTREAM_INVALID_RESPONSE", "Blockchain provider returned a transfer outside the query filter", {
      context: { txHash: transfer.txHash, logIndex: transfer.logIndex },
    });
  }
}

export async function reconcilePaymentIntent(
  id: string,
  deps: ReconcilePaymentIntentDeps,
): Promise<ReconcileOutcome> {
  const now = deps.now ?? (() => new Date());
  const intent = await deps.paymentRepository.getPaymentIntentById(id);
  if (intent === null) {
    throw new AppError("INTENT_NOT_FOUND", "Payment intent not found");
  }
  const payer = intent.payerAddress;
  if (payer === null) {
    throw new PayerRequiredError();
  }

  const startedAt = now();
  const attemptBase = { requestId: deps.requestId, provider: "alchemy" as const, fromBlock: intent.startBlock, startedAt };
  let latestBlock: bigint | null = null;

  try {
    latestBlock = await deps.chainProvider.getLatestBlock();

    // An intent created at latest + 1 has an empty window until the next block.
    const transfers: ChainTransfer[] =
      intent.startBlock > latestBlock
        ? []
        : await deps.chainProvider.getUsdcTransfers({
            fromBlock: intent.startBlock,
            toBlock: latestBlock,
            recipient: intent.recipientAddress,
            payer,
          });
    for (const transfer of transfers) {
      assertMatchesIntent(transfer, payer, intent.recipientAddress);
    }

    // Timestamps: one lookup per distinct block, however many transfers share it.
    const blockNumbers = [...new Set(transfers.map((transfer) => transfer.blockNumber))];
    const timestamps = new Map<bigint, Date>(
      await Promise.all(
        blockNumbers.map(async (blockNumber) => [blockNumber, await deps.chainProvider.getBlockTimestamp(blockNumber)] as const),
      ),
    );

    const observed: ObservedTransfer[] = transfers.map((transfer) => {
      const blockTimestamp = timestamps.get(transfer.blockNumber);
      if (blockTimestamp === undefined) {
        throw new Error(`missing timestamp for block ${transfer.blockNumber}`);
      }
      return { ...transfer, blockTimestamp };
    });

    const result = reconcileExactPayer({
      expectedAmountUnits: intent.expectedAmountUnits,
      requiredConfirmations: intent.requiredConfirmations,
      latestBlock,
      transfers: observed,
    });

    const outcome = await deps.paymentRepository.applyReconciliation(intent.id, {
      latestBlock,
      result,
      attempt: { ...attemptBase, toBlock: latestBlock, candidateCount: transfers.length, completedAt: now() },
    });
    if (outcome === null) {
      throw new AppError("INTENT_NOT_FOUND", "Payment intent not found");
    }
    return { intent: outcome.intent, applied: outcome.applied, latestBlock, candidateCount: transfers.length };
  } catch (error) {
    if (isAppError(error) && error.code.startsWith("UPSTREAM_")) {
      // Best effort: the failed attempt is operational history only. If the database is
      // also unavailable the original provider error still propagates unchanged.
      await deps.paymentRepository
        .recordReconciliationAttempt(intent.id, {
          ...attemptBase,
          toBlock: latestBlock ?? intent.startBlock,
          latestBlock,
          candidateCount: 0,
          resultStatus: null,
          errorCode: error.code,
          completedAt: now(),
        })
        .catch(() => undefined);
    }
    throw error;
  }
}
