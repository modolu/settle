/**
 * Chain read port. Services depend on this interface; the Alchemy adapter in
 * `src/integrations/chain/` is the only implementation that knows RPC details
 * (ARCHITECTURE.md §6). It is deliberately provider-neutral: no viem types
 * cross this boundary.
 */

/** One canonical native-USDC `Transfer` log, normalized for reconciliation. */
export interface ChainTransfer {
  readonly txHash: string;
  readonly logIndex: number;
  readonly blockNumber: bigint;
  readonly blockHash: string;
  /** Lowercase sender. */
  readonly from: string;
  /** Lowercase recipient. */
  readonly to: string;
  /** Exact USDC base units. */
  readonly amountUnits: bigint;
}

export interface UsdcTransferQuery {
  /** Inclusive block range; `fromBlock <= toBlock`. */
  readonly fromBlock: bigint;
  readonly toBlock: bigint;
  /** Lowercase addresses; both are filtered at the log-query level. */
  readonly recipient: string;
  readonly payer: string;
}

export interface ChainProvider {
  /** Latest canonical Base block number. Throws `UPSTREAM_*` application errors on failure. */
  getLatestBlock(): Promise<bigint>;

  /**
   * Canonical native Base USDC transfers from `payer` to `recipient` within the
   * block range. A query failure throws an `UPSTREAM_*` error and is never
   * reported as "no transfers".
   */
  getUsdcTransfers(query: UsdcTransferQuery): Promise<ChainTransfer[]>;

  /** Timestamp of the canonical block at `blockNumber`. */
  getBlockTimestamp(blockNumber: bigint): Promise<Date>;
}
