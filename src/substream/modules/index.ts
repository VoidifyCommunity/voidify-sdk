import { SubstreamModuleRegistry } from "@/substream/chain/registry.js";
import { depositModule, type DepositModuleApi } from "./deposit.js";
import { relayerModule, type RelayerModuleApi } from "./relayer.js";

export interface BuiltinSubstreamModuleApis {
  deposit: DepositModuleApi;
  relayer: RelayerModuleApi;
}

export const substreamModules = [depositModule, relayerModule] as const;

export function createSubstreamRegistry(): SubstreamModuleRegistry {
  return new SubstreamModuleRegistry([...substreamModules]);
}

export type { DepositModuleApi } from "./deposit.js";
export type { RelayerModuleApi } from "./relayer.js";
