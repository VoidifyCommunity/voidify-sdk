import BN from "bn.js";

const VALID_NUMBER_RE = /^[0-9]+(\.[0-9]+)?$/;

export function parseUnits(input: string, decimals: number): bigint {
  if (typeof input !== "string") {
    throw new Error(`parseUnits: expected string, got ${typeof input}`);
  }
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new Error(`parseUnits: invalid decimals ${decimals}`);
  }
  if (!VALID_NUMBER_RE.test(input)) {
    throw new Error(`parseUnits: invalid number format "${input}"`);
  }

  const [intPart, fracPart = ""] = input.split(".");

  if (intPart.length > 1 && intPart.startsWith("0")) {
    throw new Error(`parseUnits: leading zeros not allowed "${input}"`);
  }
  if (fracPart.length > decimals) {
    throw new Error(
      `parseUnits: too many fractional digits in "${input}" for ${decimals} decimals`,
    );
  }

  const padded = fracPart.padEnd(decimals, "0");
  const combined = (intPart + padded).replace(/^0+/, "") || "0";
  return BigInt(combined);
}

export function formatUnits(value: bigint, decimals: number): string {
  if (typeof value !== "bigint") {
    throw new Error(`formatUnits: expected bigint, got ${typeof value}`);
  }
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new Error(`formatUnits: invalid decimals ${decimals}`);
  }

  const negative = value < 0n;
  const abs = negative ? -value : value;
  const padded = abs.toString().padStart(decimals + 1, "0");
  const intPart = padded.slice(0, padded.length - decimals);
  const fracPart = padded.slice(padded.length - decimals).replace(/0+$/, "");
  const result = fracPart.length > 0 ? `${intPart}.${fracPart}` : intPart;
  return negative ? `-${result}` : result;
}

export function toBN(value: bigint): BN {
  return new BN(value.toString());
}
