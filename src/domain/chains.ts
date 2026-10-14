/**
 * Supported settlement rails and immutable chain facts.
 *
 * Pure TypeScript only: no environment, network, viem, database, or framework imports.
 * Provider endpoints remain deployment configuration; chain identity, accounting precision,
 * canonical USDC interfaces, explorer roots, and finality semantics are code constants.
 */

export const SUPPORTED_CHAINS = ["base", "arc"] as const;
export type SupportedChain = (typeof SUPPORTED_CHAINS)[number];

export type FinalityPolicy =
  | {
      readonly kind: "confirmation-depth";
      readonly defaultRequiredConfirmations: number;
      readonly minRequiredConfirmations: number;
      readonly maxRequiredConfirmations: number;
    }
  | {
      readonly kind: "deterministic";
      /** Arc transactions are final once included in a committed block. */
      readonly requiredConfirmations: 1;
    };

export interface ChainDefinition {
  readonly chain: SupportedChain;
  readonly displayName: string;
  readonly chainId: number;
  /** Canonical Settle accounting precision for this rail. */
  readonly usdcDecimals: number;
  /** Canonical public USDC interface/address stored with payment intents. */
  readonly usdcTokenAddress: string;
  /** Address whose Transfer logs represent the complete USDC movement stream. */
  readonly usdcTransferEmitterAddress: string;
  readonly explorerBaseUrl: string;
  readonly finality: FinalityPolicy;
}

const BASE_USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const ARC_USDC_INTERFACE = "0x3600000000000000000000000000000000000000";
const ARC_USDC_SYSTEM_EMITTER = "0xfffffffffffffffffffffffffffffffffffffFFE".toLowerCase();

export const CHAIN_DEFINITIONS = {
  base: {
    chain: "base",
    displayName: "Base",
    chainId: 8453,
    usdcDecimals: 6,
    usdcTokenAddress: BASE_USDC,
    usdcTransferEmitterAddress: BASE_USDC,
    explorerBaseUrl: "https://basescan.org",
    finality: {
      kind: "confirmation-depth",
      defaultRequiredConfirmations: 3,
      minRequiredConfirmations: 1,
      maxRequiredConfirmations: 64,
    },
  },
  arc: {
    chain: "arc",
    displayName: "Arc",
    chainId: 5042,
    // Arc's complete native/system transfer stream emits 18-decimal values.
    // Settle therefore keeps Arc payment/evidence units at 18 decimals exactly.
    usdcDecimals: 18,
    usdcTokenAddress: ARC_USDC_INTERFACE,
    usdcTransferEmitterAddress: ARC_USDC_SYSTEM_EMITTER,
    explorerBaseUrl: "https://explorer.arc.io",
    finality: { kind: "deterministic", requiredConfirmations: 1 },
  },
} as const satisfies Readonly<Record<SupportedChain, ChainDefinition>>;

export function getChainDefinition(chain: SupportedChain): ChainDefinition {
  return CHAIN_DEFINITIONS[chain];
}
