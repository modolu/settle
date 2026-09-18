/**
 * Composition root: wires concrete adapters (Alchemy, Drizzle/pg) into the
 * application services. Built once per process; route handlers call
 * `getContainer()` and never construct pools, clients or repositories.
 */
import "server-only";

import { getDatabase } from "@/db/client";
import type { CreatePaymentIntentInput, PaymentIntent } from "@/domain/payment-intent";
import { createAlchemyBaseProvider } from "@/integrations/chain/alchemy-base-provider";
import { getConfig } from "@/lib/config";
import { createDrizzlePaymentRepository } from "@/repositories/drizzle-payment-repository";
import { createPaymentIntent } from "@/services/create-payment-intent";
import { getPaymentIntent } from "@/services/get-payment-intent";

export interface Container {
  createPaymentIntent(input: CreatePaymentIntentInput): Promise<PaymentIntent>;
  getPaymentIntent(id: string): Promise<PaymentIntent>;
}

let container: Container | undefined;

function buildContainer(): Container {
  const config = getConfig();
  const chainProvider = createAlchemyBaseProvider({ rpcUrl: config.alchemyBaseRpcUrl });
  const paymentRepository = createDrizzlePaymentRepository(getDatabase(config.databaseUrl).db);

  return {
    createPaymentIntent: (input) => createPaymentIntent(input, { chainProvider, paymentRepository }),
    getPaymentIntent: (id) => getPaymentIntent(id, { paymentRepository }),
  };
}

export function getContainer(): Container {
  container ??= buildContainer();
  return container;
}
