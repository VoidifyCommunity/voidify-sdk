import type { Context, SubstreamMode } from "@/context.js";
import type {
  ChainEventWire,
  SubstreamRepos,
  SyncStatus,
} from "@/substream/types.js";
import {
  createSubstreamRuntime,
  type SubstreamRuntimeConfig,
} from "@/substream/runtime.js";
import type { BuiltinSubstreamModuleApis } from "@/substream/modules/index.js";

export interface SubstreamCliConfig {
  timeout?: number;
  mode?: SubstreamMode;
  healthCacheMs?: number;
}

export interface CursorWire {
  scopeType: string;
  scopeKey: string;
  lastIndex: string | null;
  lastSignature: string | null;
  lastSyncAt: number;
}

export interface EventsApiResponse {
  events: ChainEventWire[];
  total: number;
  cursor: CursorWire | null;
  syncStatus:
    | (Omit<SyncStatus, "cursor"> & { cursor: CursorWire | null })
    | null;
}

export class SubstreamCliClient {
  private readonly runtime;
  private initialized = false;

  constructor(
    ctx: Context,
    repos?: SubstreamRepos,
    config?: SubstreamCliConfig,
  ) {
    const resolved = repos ?? ctx.substream.makeRepos?.();
    if (!resolved) {
      throw new Error(
        "SubstreamCliClient: repos not provided and ctx.substream.makeRepos is not configured. " +
          "Pass stores explicitly or set ctx.substream.makeRepos (Node: makeSQLiteStores(path); Browser: makeIndexedDBStores(dbName)).",
      );
    }
    this.runtime = createSubstreamRuntime(
      ctx,
      resolved,
      config satisfies SubstreamRuntimeConfig | undefined,
    );
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    await this.runtime.initialize();
    this.initialized = true;
  }

  module<K extends keyof BuiltinSubstreamModuleApis>(
    id: K,
  ): BuiltinSubstreamModuleApis[K];
  module(id: string): unknown;
  module(id: string): unknown {
    this.ensureInitialized();
    return this.runtime.module(id);
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error("SubstreamCliClient not initialized. Call init() first.");
    }
  }
}
