import os from "node:os";
import path from "node:path";

export type KeypairSource =
  | { type: "file"; path: string }
  | { type: "base58"; key: string };

export type SubstreamSource =
  | { type: "remote"; url: string; dbPath: string }
  | { type: "local"; dbPath: string }
  | { type: "auto"; url: string; dbPath: string };

export interface VoidifyConfig {
  rpcUrl: string;
  programId: string;

  keypair?: KeypairSource | null;
  substream?: SubstreamSource | null;
  proof?: { wasmPath: string; zkeyPath: string } | null;
  substreamServer?: { port: number; host: string; dbPath: string } | null;
  relayerServer?: {
    port: number;
    host: string;
    feedId: string;
  } | null;
}

interface VoidifyDefaults {
  rpcUrl: string;
  substream: NonNullable<VoidifyConfig["substream"]>;
  proof: NonNullable<VoidifyConfig["proof"]>;
  substreamServer: NonNullable<VoidifyConfig["substreamServer"]>;
  relayerServer: NonNullable<VoidifyConfig["relayerServer"]>;
}

export function defaultUserConfigDir(): string {
  if (process.platform === "win32") {
    const appData =
      process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
    return path.join(appData, "voidify");
  }
  const xdgHome =
    process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config");
  return path.join(xdgHome, "voidify");
}

const defaultConfigPath = (...parts: string[]): string =>
  path.join(defaultUserConfigDir(), ...parts);

export const defaults: VoidifyDefaults = {
  rpcUrl: "https://api.mainnet-beta.solana.com",
  substream: {
    type: "auto",
    url: "https://substream.voidifycto.com",
    dbPath: defaultConfigPath("substream.db"),
  },
  proof: {
    wasmPath: defaultConfigPath("assets", "withdraw.wasm"),
    zkeyPath: defaultConfigPath("assets", "withdraw.zkey"),
  },
  substreamServer: {
    port: 3003,
    host: "0.0.0.0",
    dbPath: defaultConfigPath("substream-server.db"),
  },
  relayerServer: {
    port: 3002,
    host: "0.0.0.0",
    feedId:
      "0xc5844a98ff37b7ea928409eb08507e1bfe54f5493c3d7f6012ef9c5e457ec031",
  },
};
