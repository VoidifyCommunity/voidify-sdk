import Database from "better-sqlite3";
import type {
  ApplyOutcome,
  ChainEventRecord,
  EventCursor,
  EventScope,
  EventStore,
  ProjectionStateRecord,
  ProjectionStateValue,
  ProjectionStore,
  SubstreamStores,
} from "@/substream/types.js";

interface CursorRow {
  scope_type: string;
  scope_key: string;
  last_index: number | null;
  last_signature: string | null;
  last_sync_at: number;
}

function ensureCursorsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS cursors (
      scope_type TEXT NOT NULL,
      scope_key TEXT NOT NULL,
      last_index INTEGER,
      last_signature TEXT,
      last_sync_at INTEGER NOT NULL,
      PRIMARY KEY (scope_type, scope_key)
    )
  `);
}

function readCursorSync(
  db: Database.Database,
  scope: EventScope,
): EventCursor | null {
  const row = db
    .prepare(
      `SELECT scope_type, scope_key, last_index, last_signature, last_sync_at
       FROM cursors WHERE scope_type = ? AND scope_key = ?`,
    )
    .get(scope.scopeType, scope.scopeKey) as CursorRow | undefined;
  if (!row) return null;
  return {
    scopeType: row.scope_type as EventCursor["scopeType"],
    scopeKey: row.scope_key,
    lastIndex: row.last_index === null ? null : BigInt(row.last_index),
    lastSignature: row.last_signature,
    lastSyncAt: row.last_sync_at,
  };
}

function writeCursorSync(
  db: Database.Database,
  scope: EventScope,
  event: ChainEventRecord,
  lastSyncAt: number,
): void {
  db.prepare(
    `INSERT INTO cursors (scope_type, scope_key, last_index, last_signature, last_sync_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(scope_type, scope_key) DO UPDATE SET
       last_index = excluded.last_index,
       last_signature = excluded.last_signature,
       last_sync_at = excluded.last_sync_at`,
  ).run(
    scope.scopeType,
    scope.scopeKey,
    eventIndexToNumber(event.eventIndex),
    event.signature,
    lastSyncAt,
  );
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

export class SQLiteEventStore implements EventStore {
  constructor(private db: Database.Database) {}

  async initialize(): Promise<void> {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scope_type TEXT NOT NULL,
        scope_key TEXT NOT NULL,
        event_name TEXT NOT NULL,
        event_index INTEGER NOT NULL,
        signature TEXT NOT NULL,
        slot INTEGER,
        block_time INTEGER,
        address TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE(scope_type, scope_key, event_index)
      );
      CREATE INDEX IF NOT EXISTS idx_events_scope_index
        ON events(scope_type, scope_key, event_index);
      CREATE INDEX IF NOT EXISTS idx_events_name ON events(event_name);
      CREATE INDEX IF NOT EXISTS idx_events_signature ON events(signature);
      CREATE INDEX IF NOT EXISTS idx_events_address ON events(address);
    `);
    ensureCursorsTable(this.db);
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

    class GapError extends Error {
      constructor(public outcome: GapOutcome) {
        super("gap");
      }
    }

    const sorted = [...events].sort(compareEvents);
    const tx = this.db.transaction((): ApplyOutcome => {
      let cursor = readCursorSync(this.db, scope);
      let last: ApplyOutcome = {
        kind: "applied",
        cursor: cursor?.lastIndex ?? -1n,
      };

      for (const event of sorted) {
        const guard = guardEvent(cursor, event.eventIndex);
        if (typeof guard !== "string") throw new GapError(guard);
        if (guard === "duplicate") {
          last = { kind: "duplicate", cursor: cursor?.lastIndex ?? -1n };
          continue;
        }
        insertEventSync(this.db, event);
        const now = Date.now();
        writeCursorSync(this.db, scope, event, now);
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

    try {
      return tx();
    } catch (error) {
      if (error instanceof GapError) return error.outcome;
      throw new Error("Failed to apply chain events", { cause: error });
    }
  }

  async list(
    scope: EventScope,
    opts?: { offset?: number; limit?: number },
  ): Promise<ChainEventRecord[]> {
    let query = `
      SELECT * FROM events
      WHERE scope_type = ? AND scope_key = ?
      ORDER BY event_index DESC
    `;
    const params: unknown[] = [scope.scopeType, scope.scopeKey];
    const { offset, limit } = opts ?? {};
    if (limit !== undefined) {
      query += " LIMIT ?";
      params.push(limit);
      if (offset !== undefined && offset > 0) {
        query += " OFFSET ?";
        params.push(offset);
      }
    } else if (offset !== undefined && offset > 0) {
      query += " LIMIT -1 OFFSET ?";
      params.push(offset);
    }
    const rows = this.db.prepare(query).all(...params) as any[];
    return rows.map(rowToEvent);
  }

  async getAfter(
    scope: EventScope,
    afterIndex?: bigint,
  ): Promise<ChainEventRecord[]> {
    let query = `
      SELECT * FROM events
      WHERE scope_type = ? AND scope_key = ?
    `;
    const params: unknown[] = [scope.scopeType, scope.scopeKey];
    if (afterIndex !== undefined) {
      query += " AND event_index > ?";
      params.push(eventIndexToNumber(afterIndex));
    }
    query += " ORDER BY event_index ASC";
    const rows = this.db.prepare(query).all(...params) as any[];
    return rows.map(rowToEvent);
  }

  async count(scope: EventScope): Promise<number> {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) as count FROM events
         WHERE scope_type = ? AND scope_key = ?`,
      )
      .get(scope.scopeType, scope.scopeKey) as { count: number } | undefined;
    return row?.count ?? 0;
  }

  async getCursor(scope: EventScope): Promise<EventCursor | null> {
    return readCursorSync(this.db, scope);
  }
}

function insertEventSync(db: Database.Database, event: ChainEventRecord): void {
  db.prepare(
    `INSERT INTO events
     (scope_type, scope_key, event_name, event_index,
      signature, slot, block_time, address, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    event.scopeType,
    event.scopeKey,
    event.eventName,
    eventIndexToNumber(event.eventIndex),
    event.signature,
    event.slot,
    event.blockTime,
    event.address,
    JSON.stringify(event.payload),
    event.createdAt,
  );
}

function rowToEvent(row: any): ChainEventRecord {
  return {
    scopeType: row.scope_type,
    scopeKey: row.scope_key,
    eventName: row.event_name,
    eventIndex: BigInt(row.event_index),
    signature: row.signature,
    slot: row.slot ?? null,
    blockTime: row.block_time ?? null,
    address: row.address,
    payload: JSON.parse(row.payload_json),
    createdAt: row.created_at,
  };
}

function eventIndexToNumber(eventIndex: bigint): number {
  if (eventIndex < 0n || eventIndex > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(
      `Event index ${eventIndex.toString()} is outside the safe integer range`,
    );
  }
  return Number(eventIndex);
}

function compareEvents(a: ChainEventRecord, b: ChainEventRecord): number {
  return a.eventIndex < b.eventIndex ? -1 : a.eventIndex > b.eventIndex ? 1 : 0;
}

export class SQLiteProjectionStore implements ProjectionStore {
  constructor(private db: Database.Database) {}

  async initialize(): Promise<void> {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projection_states (
        projection_id TEXT NOT NULL,
        entity_key TEXT NOT NULL,
        value_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        last_event_index INTEGER,
        PRIMARY KEY (projection_id, entity_key)
      );
      CREATE INDEX IF NOT EXISTS idx_projection_states_projection
        ON projection_states(projection_id);
    `);
  }

  async get(
    projectionId: string,
    key: string,
  ): Promise<ProjectionStateRecord | null> {
    const row = this.db
      .prepare(
        `SELECT * FROM projection_states
         WHERE projection_id = ? AND entity_key = ?`,
      )
      .get(projectionId, key) as any;
    return row ? rowToProjectionState(row) : null;
  }

  async put(record: ProjectionStateRecord): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO projection_states
         (projection_id, entity_key, value_json, updated_at, last_event_index)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(projection_id, entity_key) DO UPDATE SET
          value_json = excluded.value_json,
          updated_at = excluded.updated_at,
          last_event_index = excluded.last_event_index`,
      )
      .run(
        record.projectionId,
        record.key,
        JSON.stringify(record.value),
        record.updatedAt,
        record.lastEventIndex === null
          ? null
          : eventIndexToNumber(record.lastEventIndex),
      );
  }

  async delete(projectionId: string, key: string): Promise<void> {
    this.db
      .prepare(
        `DELETE FROM projection_states
         WHERE projection_id = ? AND entity_key = ?`,
      )
      .run(projectionId, key);
  }

  async list(projectionId: string): Promise<ProjectionStateRecord[]> {
    const rows = this.db
      .prepare(
        `SELECT * FROM projection_states
         WHERE projection_id = ?
         ORDER BY entity_key ASC`,
      )
      .all(projectionId) as any[];
    return rows.map(rowToProjectionState);
  }

  async clear(projectionId: string): Promise<void> {
    this.db
      .prepare("DELETE FROM projection_states WHERE projection_id = ?")
      .run(projectionId);
  }
}

function rowToProjectionState(row: any): ProjectionStateRecord {
  return {
    projectionId: row.projection_id,
    key: row.entity_key,
    value: JSON.parse(row.value_json) as ProjectionStateValue,
    updatedAt: row.updated_at,
    lastEventIndex:
      row.last_event_index === null ? null : BigInt(row.last_event_index),
  };
}

export function makeSQLiteStores(
  path: string,
  _programId?: string,
): SubstreamStores {
  const db = new Database(path && path.length > 0 ? path : ":memory:");
  const events = new SQLiteEventStore(db);
  const projections = new SQLiteProjectionStore(db);
  return {
    events,
    projections,
  };
}
