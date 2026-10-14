/**
 * Exact USDC money helpers. API money is a decimal string ("850.00"); domain
 * money is `bigint` token units. JavaScript `number` is never used for monetary
 * values (ARCHITECTURE.md §4.4, §12).
 */
import { getChainDefinition, type SupportedChain } from "./chains";

export type ParseAmountResult =
  | { readonly ok: true; readonly units: bigint }
  | { readonly ok: false; readonly reason: string };

/**
 * Parses an API decimal string into positive chain-canonical USDC units.
 * Base defaults preserve the original public behavior; Arc uses 18-decimal
 * native/system-transfer units so no onchain value is rounded or truncated.
 */
export function parseUsdcAmount(input: unknown, chain: SupportedChain = "base"): ParseAmountResult {
  const decimals = getChainDefinition(chain).usdcDecimals;
  if (typeof input !== "string") {
    return { ok: false, reason: "must be a decimal string such as \"850.00\"" };
  }

  // Keep the existing 30-digit integer-part abuse bound for both rails. With
  // Arc's 18 decimals this still fits comfortably inside PostgreSQL numeric(78,0).
  const pattern = new RegExp(`^(0|[1-9][0-9]{0,29})(?:\\.([0-9]{1,${decimals}}))?$`);
  const match = pattern.exec(input);
  if (match === null) {
    return {
      ok: false,
      reason: `must be a positive decimal string with at most ${decimals} decimal places`,
    };
  }

  const integerPart = match[1] ?? "0";
  const fractionPart = (match[2] ?? "").padEnd(decimals, "0");
  const units = BigInt(`${integerPart}${fractionPart}`);
  if (units === 0n) {
    return { ok: false, reason: "must be greater than zero" };
  }
  return { ok: true, units };
}

/**
 * Formats chain-canonical USDC units as an API decimal string with at least two
 * fractional digits and no trailing zeros beyond them.
 */
export function formatUsdcAmount(units: bigint, chain: SupportedChain = "base"): string {
  if (units < 0n) {
    throw new RangeError("USDC amounts are never negative");
  }
  const decimals = getChainDefinition(chain).usdcDecimals;
  const digits = units.toString().padStart(decimals + 1, "0");
  const integerPart = digits.slice(0, -decimals);
  const fraction = digits.slice(-decimals).replace(/0+$/, "");
  return `${integerPart}.${fraction.length < 2 ? fraction.padEnd(2, "0") : fraction}`;
}
