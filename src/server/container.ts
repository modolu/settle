/**
 * Composition root: wires concrete adapters (Alchemy, Drizzle/pg) into the
 * application services. Built once per process; route handlers call
 * `getContainer()` and never construct pools, clients or repositories.
 */
import "server-only";

import { getDatabase } from "@/db/client";
import type { SupportedChain } from "@/domain/chains";
import type { CreatePaymentIntentInput, PaymentIntent } from "@/domain/payment-intent";
import { createAlchemyBaseProvider } from "@/integrations/chain/alchemy-base-provider";
import { createArcChainProvider } from "@/integrations/chain/arc-chain-provider";
import { getConfig } from "@/lib/config";
import type { ChainProvider } from "@/ports/chain-provider";
import { createDrizzlePaymentRepository } from "@/repositories/drizzle-payment-repository";
import { createPaymentIntent } from "@/services/create-payment-intent";
import { getPaymentEvidence, type GetPaymentEvidenceOptions, type PaymentEvidenceResult } from "@/services/get-payment-evidence";
import { getPaymentIntent } from "@/services/get-payment-intent";
import { reconcilePaymentIntent, type ReconcileOutcome } from "@/services/reconcile-payment-intent";

export interface Container {
  createPaymentIntent(input: CreatePaymentIntentInput): Promise<PaymentIntent>;
  getPaymentIntent(id: string): Promise<PaymentIntent>;
  reconcilePaymentIntent(id: string, requestId: string): Promise<ReconcileOutcome>;
  getPaymentEvidence(id: string, options: GetPaymentEvidenceOptions): Promise<PaymentEvidenceResult>;
}

let container: Container | undefined;

function buildContainer(): Container {
  const config = getConfig();
  const providers: Readonly<Record<SupportedChain, ChainProvider>> = {
    base: createAlchemyBaseProvider({ rpcUrl: config.alchemyBaseRpcUrl }),
    arc: createArcChainProvider({ rpcUrl: config.arcMainnetRpcUrl }),
  };
  const getChainProvider = (chain: SupportedChain): ChainProvider => providers[chain];
  const paymentRepository = createDrizzlePaymentRepository(getDatabase(config.databaseUrl).db);

  return {
    createPaymentIntent: (input) => createPaymentIntent(input, { getChainProvider, paymentRepository }),
    getPaymentIntent: (id) => getPaymentIntent(id, { paymentRepository }),
    reconcilePaymentIntent: (id, requestId) =>
      reconcilePaymentIntent(id, { getChainProvider, paymentRepository, requestId }),
    getPaymentEvidence: (id, options) => getPaymentEvidence(id, options, { paymentRepository }),
  };
}

export function getContainer(): Container {
  container ??= buildContainer();
  return container;
}
