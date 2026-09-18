/**
 * `ChainProvider` implementation backed by an Alchemy Base mainnet JSON-RPC
 * endpoint through viem. This is the only module that creates a viem RPC
 * client or knows the transport URL (ARCHITECTURE.md §6).
 *
 * The RPC URL embeds the provider credential. viem error messages can contain
 * that URL, so provider errors are never re-thrown or attached as `cause`;
 * only a redacted summary reaches the application error.
 */
import "server-only";

import { BaseError, createPublicClient, http, type PublicClient } from "viem";

import { AppError } from "@/lib/errors";
import type { ChainProvider } from "@/ports/chain-provider";

import { BASE_CHAIN } from "./base-usdc";

/** The subset of a viem public client the provider uses; injectable for tests. */
export type BaseRpcClient = Pick<PublicClient, "getBlockNumber">;

export interface AlchemyBaseProviderOptions {
  readonly rpcUrl: string;
  /** Per-request timeout; defaults to 10 seconds. */
  readonly timeoutMs?: number;
  /** Test seam; when omitted a viem HTTP client is created from `rpcUrl`. */
  readonly client?: BaseRpcClient;
}

const DEFAULT_TIMEOUT_MS = 10_000;

/** Summary of a provider failure that is safe to log: never includes the URL or payloads. */
export interface RedactedProviderError {
  readonly name: string;
  readonly shortMessage: string;
  readonly status?: number;
  readonly rpcCode?: number;
}

export function redactProviderError(error: unknown): RedactedProviderError {
  if (error instanceof BaseError) {
    const summary: { name: string; shortMessage: string; status?: number; rpcCode?: number } = {
      name: error.name,
      shortMessage: error.shortMessage,
    };
    if ("status" in error && typeof error.status === "number") {
      summary.status = error.status;
    }
    if ("code" in error && typeof error.code === "number") {
      summary.rpcCode = error.code;
    }
    return summary;
  }
  if (error instanceof Error) {
    return { name: error.name, shortMessage: "Non-RPC error" };
  }
  return { name: "UnknownError", shortMessage: "Non-error value thrown" };
}

export function createAlchemyBaseProvider(options: AlchemyBaseProviderOptions): ChainProvider {
  const client: BaseRpcClient =
    options.client ??
    createPublicClient({
      chain: BASE_CHAIN,
      transport: http(options.rpcUrl, {
        timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        retryCount: 0,
      }),
      // The latest block fixes an intent's matching boundary; never serve a cached value.
      cacheTime: 0,
    });

  return {
    async getLatestBlock(): Promise<bigint> {
      let result: unknown;
      try {
        result = await client.getBlockNumber({ cacheTime: 0 });
      } catch (error) {
        throw new AppError("UPSTREAM_UNAVAILABLE", "Blockchain provider is temporarily unavailable", {
          context: { provider: "alchemy", providerError: redactProviderError(error) },
        });
      }
      if (typeof result !== "bigint" || result < 0n) {
        throw new AppError("UPSTREAM_INVALID_RESPONSE", "Blockchain provider returned an invalid block number", {
          context: { provider: "alchemy", resultType: typeof result },
        });
      }
      return result;
    },
  };
}
