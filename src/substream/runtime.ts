import type { Context, SubstreamMode } from "@/context.js";
import type {
  ChainEventWire,
  EventCursor,
  EventScope,
  EventStore,
  ProjectionStore,
  SyncProgress,
  SyncStatus,
  SubstreamStores,
} from "@/substream/types.js";
import {
  type ChainSyncOptions,
  ChainEventSyncer,
  ProjectionRegistry,
} from "@/substream/chain/index.js";
import { chainEventFromWire } from "@/substream/chain/events.js";
import {
  SubstreamModuleRegistry,
  type SubstreamModule,
  type SubstreamModuleRuntime,
} from "@/substream/chain/registry.js";
import { createSubstreamRegistry } from "@/substream/modules/index.js";
import { VoidifyProgram } from "@/voidify/program.js";

export interface SubstreamRuntimeConfig {
  mode?: SubstreamMode;
  timeout?: number;
  healthCacheMs?: number;
}

interface EventsApiResponse {
  events: ChainEventWire[];
  syncStatus?: SyncStatusWire | null;
}

interface SyncStatusWire extends Omit<SyncStatus, "cursor"> {
  cursor: CursorWire | null;
}

interface CursorWire {
  scopeType: string;
  scopeKey: string;
  lastIndex: string | null;
  lastSignature: string | null;
  lastSyncAt: number;
}

export class SubstreamRuntime implements SubstreamModuleRuntime {
  readonly ctx: Context;
  readonly events: EventStore;
  readonly projections: ProjectionStore;
  readonly registry: SubstreamModuleRegistry;
  readonly projectionRegistry: ProjectionRegistry;
  readonly syncer: ChainEventSyncer;
  readonly voidify: VoidifyProgram;

  private readonly mode: SubstreamMode;
  private readonly timeout: number;
  private readonly healthCacheMs: number;
  private readonly syncInFlight = new Map<string, Promise<void>>();
  private readonly syncStatuses = new Map<string, SyncStatus>();
  private healthState: { ok: boolean; checkedAt: number } | null = null;
  private initialized = false;

  constructor(
    ctx: Context,
    stores: SubstreamStores,
    config?: SubstreamRuntimeConfig,
    modules?: readonly SubstreamModule[],
  ) {
    this.ctx = ctx;
    this.events = stores.events;
    this.projections = stores.projections;
    this.mode = config?.mode ?? ctx.substream.type;
    this.timeout = config?.timeout ?? 10000;
    this.healthCacheMs = config?.healthCacheMs ?? 10000;
    this.registry = modules
      ? new SubstreamModuleRegistry([...modules])
      : createSubstreamRegistry();
    this.projectionRegistry = new ProjectionRegistry();
    for (const projection of this.registry.createProjections(
      this.projections,
    )) {
      this.projectionRegistry.register(projection);
    }
    this.syncer = new ChainEventSyncer(this.events, this.projectionRegistry);
    this.voidify = new VoidifyProgram(ctx.connection, ctx.programId);
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.events.initialize();
    await this.projections.initialize();
    this.initialized = true;
  }

  module(id: string): unknown {
    const module = this.registry.getById(id);
    if (!module?.createClientApi) {
      throw new Error(`Unknown substream module: ${id}`);
    }
    return module.createClientApi(this);
  }

  async sync(scope: EventScope, options?: ChainSyncOptions): Promise<void> {
    const mode = await this.resolveMode();
    if (mode === "local") {
      await this.syncLocal(scope, options);
      return;
    }

    try {
      await this.syncRemote(scope, options);
    } catch (error) {
      if (this.mode === "auto") {
        this.healthState = { ok: false, checkedAt: Date.now() };
        await this.syncLocal(scope, options);
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to sync substream scope ${scope.scopeType}:${scope.scopeKey}: ${message}`,
        {
          cause: error,
        },
      );
    }
  }

  async syncLocal(
    scope: EventScope,
    options?: ChainSyncOptions,
  ): Promise<void> {
    await this.runScopedSync(scope, "local", options, (run) =>
      this.syncer.checkAndSync(
        this.registry.createStream(this.ctx, this.voidify, scope),
        run,
      ),
    );
  }

  syncLocalInBackground(scope: EventScope): SyncStatus {
    const key = this.syncKey(scope, "local");
    const running = this.syncInFlight.get(key);
    if (!running) {
      this.setSyncStatus(scope, "local", {
        phase: "checking",
        running: true,
        progress: null,
        error: null,
        startedAt: Date.now(),
        completedAt: null,
      });
      void this.syncLocal(scope).catch(() => undefined);
    }
    return this.getSyncStatus(scope, "local");
  }

  async applyLiveEvent(eventScope: EventScope): Promise<void> {
    await this.syncLocal(eventScope);
  }

  async applyLiveRecord(
    scope: EventScope,
    record: Parameters<ChainEventSyncer["applyLiveEvent"]>[1],
  ): Promise<void> {
    await this.syncer.applyLiveEvent(
      this.registry.createStream(this.ctx, this.voidify, scope),
      record,
    );
  }

  async rebuildProjection(
    scope: EventScope,
    projectionId: string,
  ): Promise<void> {
    const projection = this.projectionRegistry.get(projectionId);
    if (!projection) {
      throw new Error(`Unknown substream projection: ${projectionId}`);
    }
    await this.projections.clear(projectionId);
    const events = await this.events.getAfter(scope);
    await projection.apply(events.filter((event) => projection.matches(event)));
  }

  getSyncStatus(
    scope: EventScope,
    mode: "local" | "remote" = "local",
  ): SyncStatus {
    const status = this.ensureSyncStatus(scope, mode);
    if (status.running && !this.syncInFlight.has(this.syncKey(scope, mode))) {
      return this.setSyncStatus(scope, mode, {
        phase: status.error ? "failed" : "complete",
        running: false,
        completedAt: status.completedAt ?? Date.now(),
      });
    }
    return status;
  }

  private get baseUrl(): string {
    const s = this.ctx.substream;
    if (s.type === "local") {
      throw new Error("baseUrl unavailable in local-only substream mode");
    }
    return s.url.replace(/\/$/, "");
  }

  private async resolveMode(): Promise<"remote" | "local"> {
    if (this.mode === "remote") return "remote";
    if (this.mode === "local") return "local";

    const now = Date.now();
    if (
      this.healthState &&
      now - this.healthState.checkedAt < this.healthCacheMs
    ) {
      return this.healthState.ok ? "remote" : "local";
    }

    const ok = await this.healthCheck();
    const wasOk = this.healthState?.ok;
    this.healthState = { ok, checkedAt: now };
    if (!ok && wasOk !== false) {
      console.log(
        `substream server unreachable at ${this.baseUrl}, falling back to local`,
      );
    } else if (ok && wasOk === false) {
      console.log(
        `substream server reachable at ${this.baseUrl}, using remote`,
      );
    }
    return ok ? "remote" : "local";
  }

  private async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: "GET",
        signal: AbortSignal.timeout(this.timeout),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private async syncRemote(
    scope: EventScope,
    options?: ChainSyncOptions,
  ): Promise<void> {
    await this.runScopedSync(scope, "remote", options, async () => {
      const cursor = await this.events.getCursor(scope);
      const afterIndex = cursor?.lastIndex ?? null;
      const response = await this.fetchRemoteEvents(
        scope,
        afterIndex,
        "background",
      );
      await this.applyRemoteEvents(scope, response.events, afterIndex);

      if (response.syncStatus?.running) {
        await this.waitForRemoteSync(scope, options);
        const nextCursor = await this.events.getCursor(scope);
        const nextAfterIndex = nextCursor?.lastIndex ?? null;
        const nextResponse = await this.fetchRemoteEvents(
          scope,
          nextAfterIndex,
          "skip",
        );
        await this.applyRemoteEvents(
          scope,
          nextResponse.events,
          nextAfterIndex,
        );
      }
    });
  }

  private async applyRemoteEvents(
    scope: EventScope,
    events: ReturnType<typeof chainEventFromWire>[],
    afterIndex: bigint | null,
  ): Promise<void> {
    const newEvents = events.filter(
      (event) => afterIndex === null || event.eventIndex > afterIndex,
    );
    if (newEvents.length === 0) return;
    const outcome = await this.events.applyBatch(scope, newEvents);
    if (outcome.kind === "gap") {
      throw new Error(
        `Remote events have a gap: expected ${outcome.expected.toString()}, got ${outcome.got.toString()}`,
      );
    }
    await this.projectionRegistry.apply(newEvents);
  }

  private async runScopedSync(
    scope: EventScope,
    mode: "local" | "remote",
    options: ChainSyncOptions | undefined,
    task: (run: {
      updateProgress(progress: SyncProgress): void;
    }) => Promise<unknown>,
  ): Promise<void> {
    const key = this.syncKey(scope, mode);
    const running = this.syncInFlight.get(key);
    if (running) {
      options?.reporter?.update(this.ensureSyncStatus(scope, mode));
      await running;
      options?.reporter?.update(this.ensureSyncStatus(scope, mode));
      return;
    }

    const pending = Promise.resolve().then(async () => {
      options?.reporter?.update(
        await this.updateSyncStatus(scope, mode, {
          phase: "checking",
          running: true,
          progress: null,
          cursor: await this.events.getCursor(scope),
          error: null,
          startedAt: Date.now(),
          completedAt: null,
        }),
      );
      await task({
        updateProgress: (progress) => {
          void this.updateSyncStatus(scope, mode, {
            phase: "syncing",
            running: true,
            progress,
          }).then((status) => options?.reporter?.update(status));
        },
      });
      options?.reporter?.update(
        await this.updateSyncStatus(scope, mode, {
          phase: "complete",
          running: false,
          cursor: await this.events.getCursor(scope),
          completedAt: Date.now(),
        }),
      );
    });
    this.syncInFlight.set(key, pending);

    try {
      options?.reporter?.update(this.ensureSyncStatus(scope, mode));
      await pending;
      options?.reporter?.update(this.ensureSyncStatus(scope, mode));
    } catch (error) {
      await this.updateSyncStatus(scope, mode, {
        phase: "failed",
        running: false,
        error: error instanceof Error ? error.message : String(error),
        cursor: await this.events.getCursor(scope),
        completedAt: Date.now(),
      });
      options?.reporter?.update(this.ensureSyncStatus(scope, mode));
      throw error;
    } finally {
      if (this.syncInFlight.get(key) === pending) {
        this.syncInFlight.delete(key);
      }
    }
  }

  private syncKey(scope: EventScope, mode: "local" | "remote"): string {
    return `${mode}:${scope.scopeType}:${scope.scopeKey}`;
  }

  private ensureSyncStatus(
    scope: EventScope,
    mode: "local" | "remote",
  ): SyncStatus {
    const key = this.syncKey(scope, mode);
    const status = this.syncStatuses.get(key);
    if (status) return status;
    const initial: SyncStatus = {
      ...scope,
      mode,
      phase: "idle",
      running: false,
      progress: null,
      cursor: null,
      error: null,
      startedAt: null,
      updatedAt: Date.now(),
      completedAt: null,
    };
    this.syncStatuses.set(key, initial);
    return initial;
  }

  private setSyncStatus(
    scope: EventScope,
    mode: "local" | "remote",
    patch: Partial<SyncStatus>,
  ): SyncStatus {
    const current = this.ensureSyncStatus(scope, mode);
    const next = {
      ...current,
      ...patch,
      updatedAt: Date.now(),
    };
    this.syncStatuses.set(this.syncKey(scope, mode), next);
    return next;
  }

  private async updateSyncStatus(
    scope: EventScope,
    mode: "local" | "remote",
    patch: Partial<SyncStatus>,
  ): Promise<SyncStatus> {
    return this.setSyncStatus(scope, mode, patch);
  }

  private async waitForRemoteSync(
    scope: EventScope,
    options?: ChainSyncOptions,
  ): Promise<void> {
    while (true) {
      await this.sleep(1000);
      const status = await this.fetchRemoteSyncStatus(scope);
      options?.reporter?.update(
        await this.updateSyncStatus(scope, "remote", {
          phase: status.phase,
          running: status.running,
          progress: status.progress,
          error: status.error,
          startedAt: status.startedAt,
          completedAt: status.completedAt,
        }),
      );
      if (!status.running) {
        if (status.error) throw new Error(status.error);
        return;
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async fetchRemoteEvents(
    scope: EventScope,
    afterIndex?: bigint | null,
    syncMode: "background" | "skip" | false = false,
  ): Promise<{
    events: ReturnType<typeof chainEventFromWire>[];
    syncStatus: SyncStatus | null;
  }> {
    const url = this.remoteEventsUrl(scope, afterIndex, syncMode);
    let response = await this.fetchWithTimeout(url);

    if (!response.ok && syncMode) {
      response = await this.fetchWithTimeout(
        this.remoteEventsUrl(scope, afterIndex, false),
      );
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch events: ${response.statusText}`);
    }

    const data = (await response.json()) as EventsApiResponse;
    return {
      events: data.events.map(chainEventFromWire),
      syncStatus: data.syncStatus ? syncStatusFromWire(data.syncStatus) : null,
    };
  }

  private remoteEventsUrl(
    scope: EventScope,
    afterIndex?: bigint | null,
    syncMode: "background" | "skip" | false = false,
  ): string {
    const params = new URLSearchParams();
    if (afterIndex !== null && afterIndex !== undefined) {
      params.set("after_index", afterIndex.toString());
    }
    if (syncMode) {
      params.set("sync", syncMode);
    }
    const query = params.toString();
    return (
      `${this.baseUrl}/api/events/${scope.scopeType}/${scope.scopeKey}` +
      (query ? `?${query}` : "")
    );
  }

  private fetchWithTimeout(url: string): Promise<Response> {
    return fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(this.timeout),
    });
  }

  private async fetchRemoteSyncStatus(scope: EventScope): Promise<SyncStatus> {
    const url = `${this.baseUrl}/api/sync/${scope.scopeType}/${scope.scopeKey}/status`;

    const response = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch sync status: ${response.statusText}`);
    }

    return syncStatusFromWire((await response.json()) as SyncStatusWire);
  }
}

function cursorFromWire(cursor: CursorWire | null): EventCursor | null {
  if (!cursor) return null;
  return {
    scopeType: cursor.scopeType,
    scopeKey: cursor.scopeKey,
    lastIndex: cursor.lastIndex === null ? null : BigInt(cursor.lastIndex),
    lastSignature: cursor.lastSignature,
    lastSyncAt: cursor.lastSyncAt,
  };
}

function syncStatusFromWire(status: SyncStatusWire): SyncStatus {
  return {
    ...status,
    cursor: cursorFromWire(status.cursor),
  };
}

export function createSubstreamRuntime(
  ctx: Context,
  stores: SubstreamStores,
  config?: SubstreamRuntimeConfig,
  modules?: readonly SubstreamModule[],
): SubstreamRuntime {
  return new SubstreamRuntime(ctx, stores, config, modules);
}
