/**
 * Drizzle-backed `PaymentRepository`. The only place application code queries
 * `payment_intents`. Rows come back with `bigint` units/blocks and `Date`
 * timestamps via the column modes declared in `src/db/schema.ts`.
 */
import "server-only";

import { eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import { paymentIntents } from "@/db/schema";
import { ASSET, CHAIN, USDC_TOKEN_ADDRESS, type NewPaymentIntent, type PaymentIntent } from "@/domain/payment-intent";
import type { PaymentRepository } from "@/ports/payment-repository";

type PaymentIntentRow = typeof paymentIntents.$inferSelect;

function toDomain(row: PaymentIntentRow): PaymentIntent {
  if (row.chain !== CHAIN || row.asset !== ASSET) {
    // The CHECK constraints make this unreachable; fail loudly rather than mislabel money.
    throw new Error(`payment_intents row ${row.id} has unsupported chain/asset`);
  }
  return {
    id: row.id,
    externalReference: row.externalReference,
    chain: CHAIN,
    asset: ASSET,
    tokenAddress: row.tokenAddress,
    expectedAmountUnits: row.expectedAmountUnits,
    recipientAddress: row.recipientAddress,
    payerAddress: row.payerAddress,
    startBlock: row.startBlock,
    expiryBlock: row.expiryBlock,
    requiredConfirmations: row.requiredConfirmations,
    status: row.status,
    receivedAmountUnits: row.receivedAmountUnits,
    detectedAmountUnits: row.detectedAmountUnits,
    matchConfidence: row.matchConfidence,
    paidAt: row.paidAt,
    lastReconciledBlock: row.lastReconciledBlock,
    lastReconciledAt: row.lastReconciledAt,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    updatedAt: row.updatedAt,
  };
}

export function createDrizzlePaymentRepository(db: Database): PaymentRepository {
  return {
    async createPaymentIntent(intent: NewPaymentIntent): Promise<PaymentIntent> {
      const [row] = await db
        .insert(paymentIntents)
        .values({
          id: intent.id,
          accountId: null,
          externalReference: intent.externalReference,
          chain: CHAIN,
          asset: ASSET,
          tokenAddress: USDC_TOKEN_ADDRESS,
          expectedAmountUnits: intent.expectedAmountUnits,
          recipientAddress: intent.recipientAddress,
          payerAddress: intent.payerAddress,
          startBlock: intent.startBlock,
          expiryBlock: null,
          requiredConfirmations: intent.requiredConfirmations,
          status: "pending",
          receivedAmountUnits: 0n,
          detectedAmountUnits: 0n,
          matchConfidence: "none",
          paidAt: null,
          lastReconciledBlock: null,
          lastReconciledAt: null,
          expiresAt: intent.expiresAt,
        })
        .returning();
      if (row === undefined) {
        throw new Error("insert into payment_intents returned no row");
      }
      return toDomain(row);
    },

    async getPaymentIntentById(id: string): Promise<PaymentIntent | null> {
      const [row] = await db.select().from(paymentIntents).where(eq(paymentIntents.id, id)).limit(1);
      return row === undefined ? null : toDomain(row);
    },
  };
}
