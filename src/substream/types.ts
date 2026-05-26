export type EventScopeType = string;

export interface EventScope {
  scopeType: EventScopeType;
  scopeKey: string;
}

export type ChainEventPayload = Record<string, unknown>;

export interface ChainEventRecord extends EventScope {
  eventName: string;
  eventIndex: bigint;
  signature: string;
  slot: number | null;
  blockTime: number | null;
  address: string;
  payload: ChainEventPayload;
  createdAt: number;
}

export interface ChainEventWire extends Omit<ChainEventRecord, "eventIndex"> {
  eventIndex: string;
}

export interface DepositRecord {
  denomination: bigint;
  depositor: string;
  commitment: string;
  index: number;
  timestamp: number;
  signature: string;
}

export interface RelayerRecord {
  relayerPubkey: string;
  name: string;
  url: string;
  feeBps: number;
  stakeAmount: bigint;
  isActive: boolean;
  totalWithdrawals: number;
  totalSolEarned: bigint;
  totalTokenDeducted: bigint;
  lastUpdated: number;
}

export interface EventCursor {
  scopeType: EventScopeType;
  scopeKey: string;
  lastIndex: bigint | null;
  lastSignature: string | null;
  lastSyncAt: number;
}

export interface SyncProgress {
  current: number;
  total: number;
  signature: string;
}

export type SyncPhase = "idle" | "checking" | "syncing" | "complete" | "failed";

export interface SyncStatus extends EventScope {
  mode: "local" | "remote";
  phase: SyncPhase;
  running: boolean;
  progress: SyncProgress | null;
  cursor: EventCursor | null;
  error: string | null;
  startedAt: number | null;
  updatedAt: number;
  completedAt: number | null;
}

export interface SyncStatusReporter {
  update(status: SyncStatus): void;
}

export type ApplyOutcome =
  | { kind: "applied"; cursor: bigint }
  | { kind: "duplicate"; cursor: bigint }
  | { kind: "gap"; expected: bigint; got: bigint };

export interface EventStore {
  initialize(): Promise<void>;
  apply(scope: EventScope, event: ChainEventRecord): Promise<ApplyOutcome>;
  applyBatch(
    scope: EventScope,
    events: ChainEventRecord[],
  ): Promise<ApplyOutcome>;
  list(
    scope: EventScope,
    opts?: { offset?: number; limit?: number },
  ): Promise<ChainEventRecord[]>;
  getAfter(scope: EventScope, afterIndex?: bigint): Promise<ChainEventRecord[]>;
  count(scope: EventScope): Promise<number>;
  getCursor(scope: EventScope): Promise<EventCursor | null>;
}

export interface EventProjection {
  id: string;
  matches(event: ChainEventRecord): boolean;
  apply(events: ChainEventRecord[]): Promise<void>;
}

export type ProjectionStateValue = Record<string, unknown>;

export interface ProjectionStateRecord {
  projectionId: string;
  key: string;
  value: ProjectionStateValue;
  updatedAt: number;
  lastEventIndex: bigint | null;
}

export interface ProjectionStore {
  initialize(): Promise<void>;
  get(projectionId: string, key: string): Promise<ProjectionStateRecord | null>;
  put(record: ProjectionStateRecord): Promise<void>;
  delete(projectionId: string, key: string): Promise<void>;
  list(projectionId: string): Promise<ProjectionStateRecord[]>;
  clear(projectionId: string): Promise<void>;
}

export interface SubstreamStores {
  events: EventStore;
  projections: ProjectionStore;
}

export type SubstreamRepos = SubstreamStores;
