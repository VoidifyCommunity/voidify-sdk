import { PublicKey } from "@solana/web3.js";

export const bigIntToBytes = (bigInt: bigint, length = 32): Buffer => {
  const hexString = bigInt.toString(16).padStart(length * 2, "0");
  return Buffer.from(hexString, "hex");
};

export function bytesToBigInt(bytes: Uint8Array | Buffer): bigint {
  const hex = bytesToHex(bytes);
  return BigInt("0x" + hex);
}

export function bytesToHex(bytes: Uint8Array | Buffer): string {
  return Buffer.from(bytes).toString("hex");
}

export function hexToBytes(hex: string): Buffer {
  const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;
  return Buffer.from(cleanHex, "hex");
}

export function generateRandomFieldElement(): bigint {
  const randomBytes = new Uint8Array(31);
  crypto.getRandomValues(randomBytes);
  const hex = Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return BigInt("0x" + hex);
}

export function publicKeyToLoHi(publicKey: PublicKey): {
  lo: bigint;
  hi: bigint;
} {
  const bytes = publicKey.toBytes();
  const hi = BigInt("0x" + Buffer.from(bytes.slice(0, 16)).toString("hex"));
  const lo = BigInt("0x" + Buffer.from(bytes.slice(16, 32)).toString("hex"));
  return { lo, hi };
}
