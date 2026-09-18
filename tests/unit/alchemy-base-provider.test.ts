import { HttpRequestError, TimeoutError } from "viem";
import { describe, expect, it } from "vitest";

import { createAlchemyBaseProvider, redactProviderError, type BaseRpcClient } from "@/integrations/chain/alchemy-base-provider";
import { AppError } from "@/lib/errors";

const SECRET_URL = "https://base-mainnet.g.alchemy.com/v2/super-secret-api-key";

function clientReturning(value: unknown): BaseRpcClient {
  return { getBlockNumber: async () => value as bigint };
}

function clientThrowing(error: unknown): BaseRpcClient {
  return {
    getBlockNumber: async () => {
      throw error;
    },
  };
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

describe("createAlchemyBaseProvider", () => {
  it("returns the latest block as bigint", async () => {
    const provider = createAlchemyBaseProvider({ rpcUrl: SECRET_URL, client: clientReturning(35_123_456n) });
    await expect(provider.getLatestBlock()).resolves.toBe(35_123_456n);
  });

  it("maps HTTP failures to a retryable UPSTREAM_UNAVAILABLE without leaking the URL", async () => {
    const viemError = new HttpRequestError({
      url: SECRET_URL,
      status: 429,
      body: { method: "eth_blockNumber" },
      details: "Too Many Requests",
    });
    expect(viemError.message).toContain("super-secret-api-key"); // viem does include it
    const provider = createAlchemyBaseProvider({ rpcUrl: SECRET_URL, client: clientThrowing(viemError) });

    const error = await captureAppError(provider.getLatestBlock());
    expect(error.code).toBe("UPSTREAM_UNAVAILABLE");
    expect(error.httpStatus).toBe(503);
    expect(error.retryable).toBe(true);
    expect(error.message).toBe("Blockchain provider is temporarily unavailable");
    expect(error.cause).toBeUndefined();
    expect(error.context).toEqual({
      provider: "alchemy",
      providerError: { name: "HttpRequestError", shortMessage: "HTTP request failed.", status: 429 },
    });
    expect(JSON.stringify({ message: error.message, context: error.context, stack: error.stack })).not.toContain(
      "super-secret",
    );
  });

  it("maps timeouts and non-viem errors to UPSTREAM_UNAVAILABLE", async () => {
    const timeout = new TimeoutError({ body: { method: "eth_blockNumber" }, url: SECRET_URL });
    const fromTimeout = await captureAppError(
      createAlchemyBaseProvider({ rpcUrl: SECRET_URL, client: clientThrowing(timeout) }).getLatestBlock(),
    );
    expect(fromTimeout.code).toBe("UPSTREAM_UNAVAILABLE");
    expect(JSON.stringify(fromTimeout.context)).not.toContain("super-secret");

    const fromSocket = await captureAppError(
      createAlchemyBaseProvider({
        rpcUrl: SECRET_URL,
        client: clientThrowing(new Error(`connect ECONNREFUSED ${SECRET_URL}`)),
      }).getLatestBlock(),
    );
    expect(fromSocket.code).toBe("UPSTREAM_UNAVAILABLE");
    expect(fromSocket.context).toEqual({
      provider: "alchemy",
      providerError: { name: "Error", shortMessage: "Non-RPC error" },
    });
  });

  it.each([undefined, null, "0x1", 12, -1n])("maps an invalid block number %s to UPSTREAM_INVALID_RESPONSE", async (value) => {
    const error = await captureAppError(
      createAlchemyBaseProvider({ rpcUrl: SECRET_URL, client: clientReturning(value) }).getLatestBlock(),
    );
    expect(error.code).toBe("UPSTREAM_INVALID_RESPONSE");
    expect(error.httpStatus).toBe(502);
    expect(error.retryable).toBe(false);
  });

  it("redacts unknown thrown values", () => {
    expect(redactProviderError("boom")).toEqual({ name: "UnknownError", shortMessage: "Non-error value thrown" });
  });
});
