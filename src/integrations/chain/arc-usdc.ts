/** Arc mainnet + USDC facts bound to viem types for the chain integration layer. */
import { defineChain, getAddress, parseAbi, type Address, type Chain } from "viem";

import { CHAIN_DEFINITIONS } from "@/domain/chains";

const ARC = CHAIN_DEFINITIONS.arc;

/** viem chain definition for Arc mainnet. RPC transport is still supplied by deployment config. */
export const ARC_CHAIN: Chain = defineChain({
  id: ARC.chainId,
  name: ARC.displayName,
  nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: ARC.usdcDecimals },
  rpcUrls: { default: { http: ["https://rpc.mainnet.arc.io"] } },
  blockExplorers: { default: { name: "Arc Explorer", url: ARC.explorerBaseUrl } },
});

/** Arc's public six-decimal ERC-20 compatibility interface. Stored as intent metadata only. */
export const ARC_USDC_INTERFACE_ADDRESS: Address = getAddress(ARC.usdcTokenAddress);

/**
 * Complete native/system USDC movement emitter. Settle monitors this stream only;
 * monitoring the compatibility interface too would double-count ERC-20 initiated movements.
 */
export const ARC_USDC_SYSTEM_EMITTER_ADDRESS: Address = getAddress(ARC.usdcTransferEmitterAddress);

export const ARC_USDC_TRANSFER_EVENT_ABI = parseAbi([
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);
