/**
 * In-memory fakes for the port interfaces (ARCHITECTURE.md §13 "Required
 * service tests"). Services are tested only through their entry points.
 */
import { ASSET, CHAIN, USDC_TOKEN_ADDRESS, type NewPaymentIntent, type PaymentIntent } from "@/domain/payment-intent";
import type { ChainProvider } from "@/ports/chain-provider";
import type { PaymentRepository } from "@/ports/payment-repository";

export class FakeChainProvider implements ChainProvider {
  calls = 0;

  constructor(private readonly behaviour: { latestBlock: bigint } | { error: Error }) {}

  async getLatestBlock(): Promise<bigint> {
    this.calls += 1;
    if ("error" in this.behaviour) {
      throw this.behaviour.error;
    }
    return this.behaviour.latestBlock;
  }
}

export class InMemoryPaymentRepository implements PaymentRepository {
  readonly intents = new Map<string, PaymentIntent>();
  readonly now: () => Date;

  constructor(now: () => Date = () => new Date()) {
    this.now = now;
  }

  async createPaymentIntent(intent: NewPaymentIntent): Promise<PaymentIntent> {
    if (this.intents.has(intent.id)) {
      throw new Error(`duplicate payment intent id ${intent.id}`);
    }
    const timestamp = this.now();
    const row: PaymentIntent = {
      id: intent.id,
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
      createdAt: timestamp,
      expiresAt: intent.expiresAt,
      updatedAt: timestamp,
    };
    this.intents.set(row.id, row);
    return row;
  }

  async getPaymentIntentById(id: string): Promise<PaymentIntent | null> {
    return this.intents.get(id) ?? null;
  }
}
