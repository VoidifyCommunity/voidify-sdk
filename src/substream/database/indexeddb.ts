import { Dexie, type Table } from "dexie";
import type {
  ApplyOutcome,
  ChainEventPayload,
  ChainEventRecord,
  EventCursor,
  EventScope,
  EventStore,
  ProjectionStateRecord,
  ProjectionStateValue,
  ProjectionStore,
  SubstreamStores,
} from "@/substream/types.js";

interface EventRow {
  id?: number;
  scope_type: string;
  scope_key: string;
  event_name: string;
  event_index: number;
  signature: string;
  slot: number | null;
  block_time: number | null;
  address: string;
  payload: ChainEventPayload;
  created_at: number;
}

interface ProjectionStateRow {
  projection_id: string;
  entity_key: string;
  value: ProjectionStateValue;
  updated_at: number;
  last_event_index: number | null;
}

interface CursorRow {
  scope_type: string;
  scope_key: string;
  last_index: number | null;
  last_signature: string | null;
  last_sync_at: number;
}

class VoidifyDexie extends Dexie {
  events!: Table<EventRow, number>;
  projection_states!: Table<ProjectionStateRow, [string, string]>;
  cursors!: Table<CursorRow, [string, string]>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      events:
        "++id, &[scope_type+scope_key+event_index], event_name, signature, address",
      projection_states: "[projection_id+entity_key], projection_id",
      cursors: "[scope_type+scope_key]",
    });
  }
}

const dbCache = new Map<string, Promise<VoidifyDexie>>();

async function getDb(dbName: string): Promise<VoidifyDexie> {
  let pending = dbCache.get(dbName);
  if (!pending) {
    pending = (async () => {
      const db = new VoidifyDexie(dbName);
      await db.open();
      return db;
    })();
    dbCache.set(dbName, pending);
  }
  return pending;
}

type GapOutcome = Extract<ApplyOutcome, { kind: "gap" }>;

function guardEvent(
  cursor: EventCursor | null,
  eventIndex: bigint,
): "applied" | "duplicate" | GapOutcome {
  const last = cursor?.lastIndex ?? -1n;
  if (eventIndex <= last) return "duplicate";
  if (eventIndex > last + 1n) {
    return { kind: "gap", expected: last + 1n, got: eventIndex };
  }
  return "applied";
}

function rowToCursor(row: CursorRow): EventCursor {
  return {
    scopeType: row.scope_type as EventCursor["scopeType"],
    scopeKey: row.scope_key,
    lastIndex: row.last_index === null ? null : BigInt(row.last_index),
    lastSignature: row.last_signature,
    lastSyncAt: row.last_sync_at,
  };
}

function eventToRow(event: ChainEventRecord): Omit<EventRow, "id"> {
  return {
    scope_type: event.scopeType,
    scope_key: event.scopeKey,
    event_name: event.eventName,
    event_index: eventIndexToNumber(event.eventIndex),
    signature: event.signature,
    slot: event.slot,
    block_time: event.blockTime,
    address: event.address,
    payload: event.payload,
    created_at: event.createdAt,
  };
}

function rowToEvent(row: EventRow): ChainEventRecord {
  return {
    scopeType: row.scope_type as ChainEventRecord["scopeType"],
    scopeKey: row.scope_key,
    eventName: row.event_name,
    eventIndex: BigInt(row.event_index),
    signature: row.signature,
    slot: row.slot,
    blockTime: row.block_time,
    address: row.address,
    payload: row.payload,
    createdAt: row.created_at,
  };
}

function compareEvents(a: ChainEventRecord, b: ChainEventRecord): number {
  return a.eventIndex < b.eventIndex ? -1 : a.eventIndex > b.eventIndex ? 1 : 0;
}

function eventIndexToNumber(eventIndex: bigint): number {
  if (eventIndex < 0n || eventIndex > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(
      `Event index ${eventIndex.toString()} is outside the safe integer range`,
    );
  }
  return Number(eventIndex);
}

class IndexedDBEventStore implements EventStore {
  private db: VoidifyDexie | null = null;

  constructor(private dbName: string) {}

  async initialize(): Promise<void> {
    this.db = await getDb(this.dbName);
  }

  private getDb(): VoidifyDexie {
    if (!this.db) {
      throw new Error("Database not initialized. Call initialize() first.");
    }
    return this.db;
  }

  async apply(
    scope: EventScope,
    event: ChainEventRecord,
  ): Promise<ApplyOutcome> {
    return this.applyBatch(scope, [event]);
  }

  async applyBatch(
    scope: EventScope,
    events: ChainEventRecord[],
  ): Promise<ApplyOutcome> {
    if (events.length === 0) {
      const cursor = await this.getCursor(scope);
      return { kind: "applied", cursor: cursor?.lastIndex ?? -1n };
    }

    const db = this.getDb();
    const sorted = [...events].sort(compareEvents);
    return db.transaction("rw", [db.events, db.cursors], async () => {
      const cursorRow = await db.cursors.get([scope.scopeType, scope.scopeKey]);
      let cursor = cursorRow ? rowToCursor(cursorRow) : null;
      let last: ApplyOutcome = {
        kind: "applied",
        cursor: cursor?.lastIndex ?? -1n,
      };

      for (const event of sorted) {
        const guard = guardEvent(cursor, event.eventIndex);
        if (typeof guard !== "string") {
          Dexie.currentTransaction?.abort();
          return guard;
        }
        if (guard === "duplicate") {
          last = { kind: "duplicate", cursor: cursor?.lastIndex ?? -1n };
          continue;
        }
        await db.events.add(eventToRow(event));
        const now = Date.now();
        await db.cursors.put({
          scope_type: scope.scopeType,
          scope_key: scope.scopeKey,
          last_index: eventIndexToNumber(event.eventIndex),
          last_signature: event.signature,
          last_sync_at: now,
        });
        cursor = {
          scopeType: scope.scopeType,
          scopeKey: scope.scopeKey,
          lastIndex: event.eventIndex,
          lastSignature: event.signature,
          lastSyncAt: now,
        };
        last = { kind: "applied", cursor: event.eventIndex };
      }
      return last;
    });
  }

  async list(
    scope: EventScope,
    opts?: { offset?: number; limit?: number },
  ): Promise<ChainEventRecord[]> {
    const db = this.getDb();
    const rows = await db.events
      .where("[scope_type+scope_key+event_index]")
      .between(
        [scope.scopeType, scope.scopeKey, Dexie.minKey],
        [scope.scopeType, scope.scopeKey, Dexie.maxKey],
      )
      .reverse()
      .toArray();
    const start = opts?.offset ?? 0;
    const end = opts?.limit === undefined ? undefined : start + opts.limit;
    return rows.slice(start, end).map(rowToEvent);
  }

  async getAfter(
    scope: EventScope,
    afterIndex?: bigint,
  ): Promise<ChainEventRecord[]> {
    const db = this.getDb();
    const cutoff =
      afterIndex === undefined ? -Infinity : eventIndexToNumber(afterIndex);
    const rows = await db.events
      .where("[scope_type+scope_key+event_index]")
      .between(
        [scope.scopeType, scope.scopeKey, cutoff],
        [scope.scopeType, scope.scopeKey, Dexie.maxKey],
        false,
        true,
      )
      .toArray();
    return rows.map(rowToEvent);
  }

  async count(scope: EventScope): Promise<number> {
    const db = this.getDb();
    return db.events
      .where("[scope_type+scope_key+event_index]")
      .between(
        [scope.scopeType, scope.scopeKey, Dexie.minKey],
        [scope.scopeType, scope.scopeKey, Dexie.maxKey],
      )
      .count();
  }

  async getCursor(scope: EventScope): Promise<EventCursor | null> {
    const db = this.getDb();
    const row = await db.cursors.get([scope.scopeType, scope.scopeKey]);
    return row ? rowToCursor(row) : null;
  }
}

class IndexedDBProjectionStore implements ProjectionStore {
  private db: VoidifyDexie | null = null;

  constructor(private dbName: string) {}

  async initialize(): Promise<void> {
    this.db = await getDb(this.dbName);
  }

  private getDb(): VoidifyDexie {
    if (!this.db) {
      throw new Error("Database not initialized. Call initialize() first.");
    }
    return this.db;
  }

  async get(
    projectionId: string,
    key: string,
  ): Promise<ProjectionStateRecord | null> {
    const row = await this.getDb().projection_states.get([projectionId, key]);
    return row ? rowToProjectionState(row) : null;
  }

  async put(record: ProjectionStateRecord): Promise<void> {
    await this.getDb().projection_states.put(projectionStateToRow(record));
  }

  async delete(projectionId: string, key: string): Promise<void> {
    await this.getDb().projection_states.delete([projectionId, key]);
  }

  async list(projectionId: string): Promise<ProjectionStateRecord[]> {
    const rows = await this.getDb()
      .projection_states.where("projection_id")
      .equals(projectionId)
      .toArray();
    return rows.map(rowToProjectionState);
  }

  async clear(projectionId: string): Promise<void> {
    await this.getDb()
      .projection_states.where("projection_id")
      .equals(projectionId)
      .delete();
  }
}

function projectionStateToRow(
  record: ProjectionStateRecord,
): ProjectionStateRow {
  return {
    projection_id: record.projectionId,
    entity_key: record.key,
    value: record.value,
    updated_at: record.updatedAt,
    last_event_index:
      record.lastEventIndex === null
        ? null
        : eventIndexToNumber(record.lastEventIndex),
  };
}

function rowToProjectionState(row: ProjectionStateRow): ProjectionStateRecord {
  return {
    projectionId: row.projection_id,
    key: row.entity_key,
    value: row.value,
    updatedAt: row.updated_at,
    lastEventIndex:
      row.last_event_index === null ? null : BigInt(row.last_event_index),
  };
}

export function makeIndexedDBStores(
  dbName: string,
  _programId?: string,
): SubstreamStores {
  const events = new IndexedDBEventStore(dbName);
  const projections = new IndexedDBProjectionStore(dbName);
  return {
    events,
    projections,
  };
}
