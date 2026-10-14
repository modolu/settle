import { describe, expect, it } from "vitest";

import { CHAIN_DEFINITIONS, getChainDefinition, SUPPORTED_CHAINS } from "@/domain/chains";

describe("chain registry", () => {
  it("supports exactly Base and Arc for this build", () => {
    expect(SUPPORTED_CHAINS).toEqual(["base", "arc"]);
  });

  it("preserves the existing Base rail", () => {
    expect(CHAIN_DEFINITIONS.base).toEqual({
      chain: "base",
      displayName: "Base",
      chainId: 8453,
      usdcDecimals: 6,
      usdcTokenAddress: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
      usdcTransferEmitterAddress: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
      explorerBaseUrl: "https://basescan.org",
      finality: {
        kind: "confirmation-depth",
        defaultRequiredConfirmations: 3,
        minRequiredConfirmations: 1,
        maxRequiredConfirmations: 64,
      },
    });
  });

  it("records Arc native accounting and deterministic finality facts", () => {
    const arc = getChainDefinition("arc");
    expect(arc.chainId).toBe(5042);
    expect(arc.usdcDecimals).toBe(18);
    expect(arc.usdcTokenAddress).toBe("0x3600000000000000000000000000000000000000");
    expect(arc.usdcTransferEmitterAddress).toBe("0xfffffffffffffffffffffffffffffffffffffffe");
    expect(arc.explorerBaseUrl).toBe("https://explorer.arc.io");
    expect(arc.finality).toEqual({ kind: "deterministic", requiredConfirmations: 1 });
  });
});
