import os from "node:os";
import path from "node:path";
import { PublicKey } from "@solana/web3.js";
import { Context } from "@/context.js";
import { defaultUserConfigPath, loadConfig } from "@/cli/config/loader.js";
import type { VoidifyConfig } from "@/cli/config/types.js";
import { resolveKeypair } from "@/cli/config/keypair.js";
import { makeSQLiteStores } from "@/substream/database/sqlite.js";

export const SOL_DECIMALS = 9;

export interface GlobalOptions {
  config?: string;
  keypair?: string;
  url?: string;
}

export function expandHome(p: string): string {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

export function loadCliConfig(opts: GlobalOptions): VoidifyConfig {
  return loadConfig({
    configPath: opts.config ?? defaultUserConfigPath(),
    rpcUrl: opts.url,
  });
}

export async function contextFromConfig(
  cfg: VoidifyConfig,
  cliKeypairPath?: string,
): Promise<Context> {
  const keypair = resolveKeypair(cfg, cliKeypairPath);

  const substream = (() => {
    const cs = cfg.substream;
    if (!cs) return undefined;
    const dbPath = expandHome(cs.dbPath);
    const makeRepos = () => makeSQLiteStores(dbPath, cfg.programId);
    switch (cs.type) {
      case "remote":
        return { type: "remote" as const, url: cs.url, makeRepos };
      case "local":
        return { type: "local" as const, makeRepos };
      case "auto":
        return { type: "auto" as const, url: cs.url, makeRepos };
    }
  })();

  return new Context({
    rpcUrl: cfg.rpcUrl,
    programId: cfg.programId ? new PublicKey(cfg.programId) : undefined,
    wallet: keypair,
    substream,
    wasmPath: cfg.proof ? expandHome(cfg.proof.wasmPath) : undefined,
    zkeyPath: cfg.proof ? expandHome(cfg.proof.zkeyPath) : undefined,
  });
}

export async function createServiceContext(
  opts: GlobalOptions,
): Promise<Context> {
  return contextFromConfig(loadCliConfig(opts), opts.keypair);
}
