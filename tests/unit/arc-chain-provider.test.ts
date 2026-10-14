import { describe, expect, it, vi } from "vitest";

import { AppError } from "@/lib/errors";
import {
  ARC_LOG_CHUNK_BLOCKS,
  createArcChainProvider,
  type ArcLogsQuery,
  type ArcRpcClient,
} from "@/integrations/chain/arc-chain-provider";
import {
  ARC_CHAIN,
  ARC_USDC_INTERFACE_ADDRESS,
  ARC_USDC_SYSTEM_EMITTER_ADDRESS,
} from "@/integrations/chain/arc-usdc";

const PAYER = "0xd8da6bf26964af9d7eed9e03e53415d37aa96045";
const RECIPIENT = "0x1111111111111111111111111111111111111111";
const TX = `0x${"a".repeat(64)}`;
const BLOCK_HASH = `0x${"b".repeat(64)}`;

function log(overrides: Record<string, unknown> = {}) {
  return {
    address: ARC_USDC_SYSTEM_EMITTER_ADDRESS,
    transactionHash: TX,
    blockNumber: 100n,
    blockHash: BLOCK_HASH,
    logIndex: 7,
    removed: false,
    args: { from: PAYER, to: RECIPIENT, value: 100_000_000_000_000_000n },
    ...overrides,
  };
}

function client(overrides: Partial<ArcRpcClient> = {}): ArcRpcClient {
  return {
    getBlockNumber: vi.fn(async () => 1_000n),
    getBlock: vi.fn(async () => ({ timestamp: 1_700_000_000n })),
    getLogs: vi.fn(async (query: ArcLogsQuery) => { void query; return []; }),
    ...overrides,
  } as ArcRpcClient;
}

describe("Arc chain constants", () => {
  it("pins Arc mainnet and keeps the ERC-20 interface distinct from the system emitter", () => {
    expect(ARC_CHAIN.id).toBe(5042);
    expect(ARC_CHAIN.nativeCurrency.decimals).toBe(18);
    expect(ARC_USDC_INTERFACE_ADDRESS.toLowerCase()).toBe("0x3600000000000000000000000000000000000000");
    expect(ARC_USDC_SYSTEM_EMITTER_ADDRESS.toLowerCase()).toBe("0xfffffffffffffffffffffffffffffffffffffffe");
    expect(ARC_USDC_SYSTEM_EMITTER_ADDRESS.toLowerCase()).not.toBe(ARC_USDC_INTERFACE_ADDRESS.toLowerCase());
    expect(ARC_LOG_CHUNK_BLOCKS).toBe(9_999n);
  });
});

describe("createArcChainProvider", () => {
  it("identifies itself as arc-rpc and reads the latest block", async () => {
    const rpc = client({ getBlockNumber: vi.fn(async () => 42n) });
    const provider = createArcChainProvider({ rpcUrl: "https://rpc.mainnet.arc.io", client: rpc });
    expect(provider.providerName).toBe("arc-rpc");
    await expect(provider.getLatestBlock()).resolves.toBe(42n);
  });

  it("queries only the native system emitter and preserves exact 18-decimal values", async () => {
    const getLogs = vi.fn(async (query: ArcLogsQuery) => { void query; return [log()]; });
    const rpc = client({ getLogs });
    const provider = createArcChainProvider({ rpcUrl: "https://rpc.mainnet.arc.io", client: rpc });

    await expect(
      provider.getUsdcTransfers({ fromBlock: 1n, toBlock: 500n, payer: PAYER, recipient: RECIPIENT }),
    ).resolves.toEqual([
      {
        txHash: TX,
        logIndex: 7,
        blockNumber: 100n,
        blockHash: BLOCK_HASH,
        from: PAYER,
        to: RECIPIENT,
        amountUnits: 100_000_000_000_000_000n,
      },
    ]);

    expect(getLogs).toHaveBeenCalledTimes(1);
    const request = getLogs.mock.calls[0]?.[0] as {
      address: string;
      args: { from?: string; to?: string };
      fromBlock: bigint;
      toBlock: bigint;
    };
    expect(request.address.toLowerCase()).toBe(ARC_USDC_SYSTEM_EMITTER_ADDRESS.toLowerCase());
    expect(request.address.toLowerCase()).not.toBe(ARC_USDC_INTERFACE_ADDRESS.toLowerCase());
    expect(request.args.from?.toLowerCase()).toBe(PAYER);
    expect(request.args.to?.toLowerCase()).toBe(RECIPIENT);
    expect(request.fromBlock).toBe(1n);
    expect(request.toBlock).toBe(500n);
  });

  it("omits the sender filter when payer is not declared", async () => {
    const getLogs = vi.fn(async (query: ArcLogsQuery) => { void query; return []; });
    const provider = createArcChainProvider({ rpcUrl: "https://rpc.mainnet.arc.io", client: client({ getLogs }) });
    await provider.getUsdcTransfers({ fromBlock: 10n, toBlock: 20n, payer: null, recipient: RECIPIENT });
    const request = getLogs.mock.calls[0]?.[0] as { args: Record<string, unknown> };
    expect(request.args).toHaveProperty("to");
    expect(request.args).not.toHaveProperty("from");
  });

  it("chunks a wide window into complete requests no larger than 9,999 blocks", async () => {
    const getLogs = vi.fn(async (query: ArcLogsQuery) => { void query; return []; });
    const provider = createArcChainProvider({ rpcUrl: "https://rpc.mainnet.arc.io", client: client({ getLogs }) });
    await provider.getUsdcTransfers({ fromBlock: 1n, toBlock: 20_000n, payer: PAYER, recipient: RECIPIENT });
    expect(getLogs.mock.calls.map((call) => {
      const q = call[0] as { fromBlock: bigint; toBlock: bigint };
      return [q.fromBlock, q.toBlock];
    })).toEqual([
      [1n, 9_999n],
      [10_000n, 19_998n],
      [19_999n, 20_000n],
    ]);
  });

  it("fails the complete scan if a later chunk fails instead of returning partial evidence", async () => {
    const getLogs = vi
      .fn(async (query: ArcLogsQuery) => { void query; return [] as unknown[]; })
      .mockResolvedValueOnce([log({ blockNumber: 100n })])
      .mockRejectedValueOnce(new Error("rpc unavailable")) ;
    const provider = createArcChainProvider({ rpcUrl: "https://rpc.mainnet.arc.io", client: client({ getLogs }) });
    const promise = provider.getUsdcTransfers({ fromBlock: 1n, toBlock: 15_000n, payer: PAYER, recipient: RECIPIENT });
    await expect(promise).rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE", retryable: true });
  });

  it("rejects malformed evidence rather than accepting an out-of-window or wrong-emitter log", async () => {
    for (const bad of [
      log({ blockNumber: 501n }),
      log({ address: ARC_USDC_INTERFACE_ADDRESS }),
      log({ args: { from: PAYER, to: RECIPIENT, value: "0.1" } }),
    ]) {
      const provider = createArcChainProvider({
        rpcUrl: "https://rpc.mainnet.arc.io",
        client: client({ getLogs: vi.fn(async (query: ArcLogsQuery) => { void query; return [bad]; }) }),
      });
      await expect(
        provider.getUsdcTransfers({ fromBlock: 1n, toBlock: 500n, payer: PAYER, recipient: RECIPIENT }),
      ).rejects.toBeInstanceOf(AppError);
    }
  });

  it("returns UTC block timestamps and rejects malformed timestamp data", async () => {
    const provider = createArcChainProvider({
      rpcUrl: "https://rpc.mainnet.arc.io",
      client: client({ getBlock: vi.fn(async () => ({ timestamp: 1_700_000_000n })) }),
    });
    await expect(provider.getBlockTimestamp(10n)).resolves.toEqual(new Date("2023-11-14T22:13:20.000Z"));

    const broken = createArcChainProvider({
      rpcUrl: "https://rpc.mainnet.arc.io",
      client: client({ getBlock: vi.fn(async () => ({ timestamp: "nope" })) }),
    });
    await expect(broken.getBlockTimestamp(10n)).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
  });
});
