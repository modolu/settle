/**
 * Arc mainnet `ChainProvider` using standard EVM JSON-RPC through viem.
 *
 * Arc exposes a native/system USDC Transfer emitter whose values use 18-decimal
 * native units. This adapter reads only that stream, in bounded block chunks,
 * validates every returned log, and returns a result only after the complete
 * requested window succeeds. A failed chunk is never interpreted as no payment.
 */
import "server-only";

import { BaseError, createPublicClient, getAddress, http, isAddress, type Address } from "viem";

import { AppError } from "@/lib/errors";
import type { BlockRange, ChainProvider, ChainTransfer, UsdcTransferQuery } from "@/ports/chain-provider";

import { ARC_CHAIN, ARC_USDC_SYSTEM_EMITTER_ADDRESS, ARC_USDC_TRANSFER_EVENT_ABI } from "./arc-usdc";
import { findLastBlockAtOrBefore } from "./block-search";

export interface ArcLogsQuery {
  readonly address: Address;
  readonly event: (typeof ARC_USDC_TRANSFER_EVENT_ABI)[0];
  readonly args: { readonly from?: Address; readonly to: Address };
  readonly fromBlock: bigint;
  readonly toBlock: bigint;
  readonly strict: true;
}

/** Small defensive RPC seam: provider code validates every returned value before use. */
export interface ArcRpcClient {
  getBlockNumber(args?: { readonly cacheTime?: number }): Promise<unknown>;
  getBlock(args: { readonly blockNumber: bigint; readonly includeTransactions: false }): Promise<unknown>;
  getLogs(args: ArcLogsQuery): Promise<readonly unknown[]>;
}

export interface ArcChainProviderOptions {
  readonly rpcUrl: string;
  readonly timeoutMs?: number;
  readonly client?: ArcRpcClient;
}

const DEFAULT_TIMEOUT_MS = 10_000;
/** Arc RPC documents a 10,000-block getLogs ceiling; stay one block below it. */
export const ARC_LOG_CHUNK_BLOCKS = 9_999n;
const HASH_32 = /^0x[0-9a-f]{64}$/;
const MAX_SAFE_TIMESTAMP_SECONDS = BigInt(Math.floor(Number.MAX_SAFE_INTEGER / 1_000));
const EMITTER_LOWER = ARC_USDC_SYSTEM_EMITTER_ADDRESS.toLowerCase();

function safeProviderSummary(error: unknown): { readonly name: string; readonly shortMessage: string } {
  if (error instanceof BaseError) {
    return { name: error.name, shortMessage: error.shortMessage };
  }
  if (error instanceof Error) {
    return { name: error.name, shortMessage: "Non-RPC error" };
  }
  return { name: "UnknownError", shortMessage: "Non-error value thrown" };
}

function upstreamError(operation: string, error: unknown): AppError {
  return new AppError("UPSTREAM_UNAVAILABLE", "Blockchain provider is temporarily unavailable", {
    retryable: true,
    context: { provider: "arc-rpc", operation, providerError: safeProviderSummary(error) },
  });
}

function invalidResponse(operation: string, reason: string): AppError {
  return new AppError("UPSTREAM_INVALID_RESPONSE", "Blockchain provider returned an invalid response", {
    context: { provider: "arc-rpc", operation, reason },
  });
}

function parseArcTransferLog(log: unknown, query: UsdcTransferQuery): ChainTransfer | null {
  if (typeof log !== "object" || log === null) {
    throw invalidResponse("getLogs", "log is not an object");
  }
  const candidate = log as {
    address?: unknown;
    transactionHash?: unknown;
    blockNumber?: unknown;
    blockHash?: unknown;
    logIndex?: unknown;
    removed?: unknown;
    args?: unknown;
  };
  if (typeof candidate.address !== "string" || candidate.address.toLowerCase() !== EMITTER_LOWER) {
    throw invalidResponse("getLogs", "unexpected log emitter");
  }
  if (typeof candidate.transactionHash !== "string" || !HASH_32.test(candidate.transactionHash.toLowerCase())) {
    throw invalidResponse("getLogs", "transaction hash malformed");
  }
  if (typeof candidate.blockNumber !== "bigint" || candidate.blockNumber < query.fromBlock || candidate.blockNumber > query.toBlock) {
    throw invalidResponse("getLogs", "block number outside requested window");
  }
  if (typeof candidate.blockHash !== "string" || !HASH_32.test(candidate.blockHash.toLowerCase())) {
    throw invalidResponse("getLogs", "block hash malformed");
  }
  if (typeof candidate.logIndex !== "number" || !Number.isInteger(candidate.logIndex) || candidate.logIndex < 0) {
    throw invalidResponse("getLogs", "log index malformed");
  }
  if (candidate.removed === true) {
    throw invalidResponse("getLogs", "log marked removed");
  }
  if (typeof candidate.args !== "object" || candidate.args === null) {
    throw invalidResponse("getLogs", "Transfer arguments missing");
  }
  const { from, to, value } = candidate.args as { from?: unknown; to?: unknown; value?: unknown };
  if (
    typeof from !== "string" ||
    !isAddress(from) ||
    typeof to !== "string" ||
    !isAddress(to) ||
    typeof value !== "bigint" ||
    value < 0n
  ) {
    throw invalidResponse("getLogs", "Transfer arguments malformed");
  }

  const sender = from.toLowerCase();
  const recipient = to.toLowerCase();
  if (recipient !== query.recipient || (query.payer !== null && sender !== query.payer)) {
    return null;
  }

  return {
    txHash: candidate.transactionHash.toLowerCase(),
    logIndex: candidate.logIndex,
    blockNumber: candidate.blockNumber,
    blockHash: candidate.blockHash.toLowerCase(),
    from: sender,
    to: recipient,
    amountUnits: value,
  };
}

export function createArcChainProvider(options: ArcChainProviderOptions): ChainProvider {
  const client: ArcRpcClient =
    options.client ??
    (createPublicClient({
      chain: ARC_CHAIN,
      transport: http(options.rpcUrl, { timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS, retryCount: 0 }),
      cacheTime: 0,
    }) as unknown as ArcRpcClient);

  return {
    providerName: "arc-rpc",

    async getLatestBlock(): Promise<bigint> {
      let result: unknown;
      try {
        result = await client.getBlockNumber({ cacheTime: 0 });
      } catch (error) {
        throw upstreamError("getBlockNumber", error);
      }
      if (typeof result !== "bigint" || result < 0n) {
        throw invalidResponse("getBlockNumber", `block number is ${typeof result}`);
      }
      return result;
    },

    async getUsdcTransfers(query: UsdcTransferQuery): Promise<ChainTransfer[]> {
      if (query.fromBlock > query.toBlock || query.fromBlock < 0n) {
        throw new RangeError(`invalid block range ${query.fromBlock}..${query.toBlock}`);
      }

      const found = new Map<string, ChainTransfer>();
      let fromBlock = query.fromBlock;
      while (fromBlock <= query.toBlock) {
        const candidateEnd = fromBlock + ARC_LOG_CHUNK_BLOCKS - 1n;
        const toBlock = candidateEnd < query.toBlock ? candidateEnd : query.toBlock;
        const args: { from?: `0x${string}`; to: `0x${string}` } = { to: getAddress(query.recipient) };
        if (query.payer !== null) {
          args.from = getAddress(query.payer);
        }

        let logs: readonly unknown[];
        try {
          logs = await client.getLogs({
            address: ARC_USDC_SYSTEM_EMITTER_ADDRESS,
            event: ARC_USDC_TRANSFER_EVENT_ABI[0],
            args,
            fromBlock,
            toBlock,
            strict: true,
          });
        } catch (error) {
          throw upstreamError("getLogs", error);
        }

        for (const log of logs) {
          const transfer = parseArcTransferLog(log, query);
          if (transfer === null) {
            continue;
          }
          found.set(`${transfer.txHash}:${transfer.logIndex}`, transfer);
        }
        fromBlock = toBlock + 1n;
      }

      return [...found.values()].sort((a, b) => {
        if (a.blockNumber !== b.blockNumber) return a.blockNumber < b.blockNumber ? -1 : 1;
        if (a.logIndex !== b.logIndex) return a.logIndex - b.logIndex;
        return a.txHash < b.txHash ? -1 : a.txHash > b.txHash ? 1 : 0;
      });
    },

    async getBlockTimestamp(blockNumber: bigint): Promise<Date> {
      let block: unknown;
      try {
        block = await client.getBlock({ blockNumber, includeTransactions: false });
      } catch (error) {
        throw upstreamError("getBlock", error);
      }
      const timestamp = (block as { timestamp?: unknown } | null)?.timestamp;
      if (typeof timestamp !== "bigint" || timestamp < 0n || timestamp > MAX_SAFE_TIMESTAMP_SECONDS) {
        throw invalidResponse("getBlock", "block timestamp malformed");
      }
      return new Date(Number(timestamp) * 1_000);
    },

    async findLastBlockAtOrBefore(at: Date, range: BlockRange): Promise<bigint | null> {
      const outcome = await findLastBlockAtOrBefore((blockNumber) => this.getBlockTimestamp(blockNumber), at, range);
      return outcome.blockNumber;
    },
  };
}
