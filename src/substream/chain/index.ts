import type { PublicKey } from "@solana/web3.js";
import type {
  ChainEventRecord,
  EventProjection,
  EventScope,
  EventStore,
  SyncProgress,
  SyncStatusReporter,
} from "@/substream/types.js";
import { substreamLogger } from "@/utils/logger.js";

export interface ChainSyncOptions {
  reporter?: SyncStatusReporter;
}

export interface ChainSyncRun {
  updateProgress(progress: SyncProgress): void;
}

export interface EventStreamSpec {
  id: string;
  scope: EventScope;
  address: PublicKey;
  getChainLastIndex(): Promise<bigint>;
  collectBatches(
    lastSignature?: string,
    run?: ChainSyncRun,
  ): AsyncIterable<ChainEventRecord[]>;
}

export class ProjectionRegistry {
  private projections: EventProjection[] = [];

  register(projection: EventProjection): void {
    const existing = this.projections.find((p) => p.id === projection.id);
    if (existing) {
      throw new Error(`Projection already registered: ${projection.id}`);
    }
    this.projections.push(projection);
  }

  async apply(events: ChainEventRecord[]): Promise<void> {
    if (events.length === 0) return;
    for (const projection of this.projections) {
      const matched = events.filter((event) => projection.matches(event));
      if (matched.length > 0) await projection.apply(matched);
    }
  }

  get(id: string): EventProjection | null {
    return this.projections.find((projection) => projection.id === id) ?? null;
  }
}

export class ChainEventSyncer {
  constructor(
    private events: EventStore,
    private projections = new ProjectionRegistry(),
  ) {}

  registerProjection(projection: EventProjection): void {
    this.projections.register(projection);
  }

  async checkAndSync(
    spec: EventStreamSpec,
    run?: ChainSyncRun,
  ): Promise<boolean> {
    const cursor = await this.events.getCursor(spec.scope);
    const localIndex = cursor?.lastIndex ?? -1n;
    let chainLastIndex: bigint;
    try {
      chainLastIndex = await spec.getChainLastIndex();
    } catch (error) {
      substreamLogger.warn(
        { err: error, streamId: spec.id },
        "substream alignment check failed",
      );
      await this.sync(spec, run);
      return false;
    }

    if (localIndex >= chainLastIndex) return true;
    await this.sync(spec, run);
    return false;
  }

  async applyLiveEvent(
    spec: EventStreamSpec,
    event: ChainEventRecord,
  ): Promise<void> {
    const outcome = await this.events.apply(spec.scope, event);
    if (outcome.kind === "gap") {
      await this.sync(spec);
      return;
    }
    if (outcome.kind === "applied") {
      await this.projections.apply([event]);
    }
  }

  private async sync(spec: EventStreamSpec, run?: ChainSyncRun): Promise<void> {
    const cursor = await this.events.getCursor(spec.scope);
    for await (const records of spec.collectBatches(
      cursor?.lastSignature ?? undefined,
      run,
    )) {
      const shouldContinue = await this.applyRecords(spec, records);
      if (!shouldContinue) return;
    }
  }

  private async applyRecords(
    spec: EventStreamSpec,
    records: ChainEventRecord[],
  ): Promise<boolean> {
    if (records.length === 0) return true;
    const outcome = await this.events.applyBatch(spec.scope, records);
    if (outcome.kind === "gap") {
      substreamLogger.warn(
        {
          streamId: spec.id,
          scopeType: spec.scope.scopeType,
          scopeKey: spec.scope.scopeKey,
          expected: outcome.expected.toString(),
          got: outcome.got.toString(),
        },
        "chain event batch apply found a gap; RPC history window may be exhausted",
      );
      return false;
    }

    await this.projections.apply(records);
    return true;
  }
}
