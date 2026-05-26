import type { Context } from "@/context.js";
import type {
  ChainEventRecord,
  EventProjection,
  EventScope,
  EventScopeType,
  EventStore,
  ProjectionStore,
} from "@/substream/types.js";
import type { VoidifyProgram } from "@/voidify/program.js";
import type { ChainSyncOptions, EventStreamSpec } from "./index.js";

export interface LiveEventContext {
  ctx: Context;
  voidify: VoidifyProgram;
  event: unknown;
  signature: string;
  slot: number;
}

export interface LiveEventAdapter {
  eventName: string;
  toRecord(args: LiveEventContext): Promise<ChainEventRecord>;
}

export interface SubstreamModuleRuntime {
  ctx: Context;
  voidify: VoidifyProgram;
  events: EventStore;
  projections: ProjectionStore;
  sync(scope: EventScope, options?: ChainSyncOptions): Promise<void>;
  rebuildProjection(scope: EventScope, projectionId: string): Promise<void>;
}

export interface SubstreamModule {
  id: string;
  scopeType: EventScopeType;
  parseScopeKey(scopeKey: string): EventScope | null;
  createStream(
    ctx: Context,
    voidify: VoidifyProgram,
    scope: EventScope,
  ): EventStreamSpec;
  liveEvents?: LiveEventAdapter[];
  createProjections?(store: ProjectionStore): EventProjection[];
  createClientApi?(runtime: SubstreamModuleRuntime): unknown;
}

export class SubstreamModuleRegistry {
  constructor(private modules: SubstreamModule[]) {}

  getByScopeType(scopeType: string): SubstreamModule | null {
    return this.modules.find((m) => m.scopeType === scopeType) ?? null;
  }

  getById(id: string): SubstreamModule | null {
    return this.modules.find((m) => m.id === id) ?? null;
  }

  parseScope(scopeType: string, scopeKey: string): EventScope | null {
    return this.getByScopeType(scopeType)?.parseScopeKey(scopeKey) ?? null;
  }

  createStream(
    ctx: Context,
    voidify: VoidifyProgram,
    scope: EventScope,
  ): EventStreamSpec {
    const module = this.getByScopeType(scope.scopeType);
    if (!module) {
      throw new Error(`No substream module registered for ${scope.scopeType}`);
    }
    return module.createStream(ctx, voidify, scope);
  }

  liveEvents(): Array<LiveEventAdapter & { module: SubstreamModule }> {
    return this.modules.flatMap((module) =>
      (module.liveEvents ?? []).map((event) => ({ ...event, module })),
    );
  }

  createProjections(store: ProjectionStore): EventProjection[] {
    return this.modules.flatMap((module) =>
      module.createProjections ? module.createProjections(store) : [],
    );
  }
}
