import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import bs58 from "bs58";
import { Keypair } from "@solana/web3.js";
import type { KeypairSource, VoidifyConfig } from "./types.js";

function expandHome(p: string): string {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

export function loadKeypairSource(
  src: KeypairSource | null | undefined,
): Keypair | null {
  if (!src) return null;
  switch (src.type) {
    case "file": {
      const data = JSON.parse(
        fs.readFileSync(expandHome(src.path), "utf-8"),
      ) as number[];
      return Keypair.fromSecretKey(Uint8Array.from(data));
    }
    case "base58": {
      const decoded = bs58.decode(src.key);
      if (decoded.length !== 64) {
        throw new Error(
          `Decoded keypair base58 value is ${decoded.length} bytes; expected 64 bytes for a standard Solana secret key`,
        );
      }
      return Keypair.fromSecretKey(decoded);
    }
  }
}

export function resolveKeypair(
  cfg: VoidifyConfig,
  cliKeypairPath: string | undefined,
): Keypair | null {
  if (cliKeypairPath) {
    return loadKeypairSource({ type: "file", path: cliKeypairPath });
  }
  return loadKeypairSource(cfg.keypair);
}
