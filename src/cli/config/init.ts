import { defaults } from "./types.js";

export type InitType = "default" | "relayer" | "substream" | "full";

const REQUIRED = (desc: string): string => `<TODO: ${desc}>`;

const FILE_KEYPAIR_PATH_HINT = "absolute path to your solana-keygen JSON file";

function fileKeypairPlaceholder(role: string): {
  type: "file";
  path: string;
} {
  return {
    type: "file",
    path: REQUIRED(`${role} - ${FILE_KEYPAIR_PATH_HINT}`),
  };
}

export function buildTemplate(type: InitType): Record<string, unknown> {
  switch (type) {
    case "default":
      return {
        rpcUrl: defaults.rpcUrl,
        programId: REQUIRED("voidify program ID"),
        keypair: fileKeypairPlaceholder("user keypair"),
        substream: { ...defaults.substream },
        proof: { ...defaults.proof },
      };

    case "relayer":
      return {
        rpcUrl: defaults.rpcUrl,
        programId: REQUIRED("voidify program ID"),
        keypair: fileKeypairPlaceholder("relayer keypair"),
        relayerServer: { ...defaults.relayerServer },
      };

    case "substream":
      return {
        rpcUrl: defaults.rpcUrl,
        programId: REQUIRED("voidify program ID"),
        keypair: null,
        substreamServer: { ...defaults.substreamServer },
      };

    case "full":
      return {
        rpcUrl: defaults.rpcUrl,
        programId: REQUIRED("voidify program ID"),
        keypair: fileKeypairPlaceholder("keypair for this config"),
        substream: { ...defaults.substream },
        proof: { ...defaults.proof },
        substreamServer: { ...defaults.substreamServer },
        relayerServer: { ...defaults.relayerServer },
      };
  }
}

export function postInitHint(type: InitType): string {
  switch (type) {
    case "default":
      return [
        "Next steps:",
        "  - programId      <- voidify main program",
        "  - keypair.path   <- your keypair JSON file path",
        "  (substream / proof already use defaults; no changes needed)",
        "",
        "Applicable commands: deposit / withdraw / note.",
      ].join("\n");
    case "relayer":
      return [
        "Next steps:",
        "  - programId                  <- voidify main program",
        "  - keypair.path               <- keypair for the relayer service itself",
        "  - relayerServer.feedId       ← Switchboard on-demand feed ID",
        "",
        "Applicable commands: relayer start / relayer list.",
      ].join("\n");
    case "substream":
      return [
        "Next steps:",
        "  - programId               <- voidify main program (used to filter on-chain events)",
        "  - substreamServer.dbPath  <- server's local SQLite DB file path",
        "",
        "Applicable command: substream.",
      ].join("\n");
    case "full":
      return [
        "Next steps: full template; fill in values as needed.",
        "  required: programId, keypair.path, relayerServer.feedId",
        "",
        "Reminder: one config should use one keypair. Create separate config files and switch with -c when roles differ.",
      ].join("\n");
  }
}
