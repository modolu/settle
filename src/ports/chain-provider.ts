/**
 * Chain read port. Services depend on this interface; the Alchemy adapter in
 * `src/integrations/chain/` is the only implementation that knows RPC details
 * (ARCHITECTURE.md §6). Milestone 1 needs only the latest block, which fixes
 * an intent's `start_block` boundary.
 */
export interface ChainProvider {
  /** Latest canonical Base block number. Throws `UPSTREAM_*` application errors on failure. */
  getLatestBlock(): Promise<bigint>;
}
