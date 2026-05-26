import { PublicKey } from "@solana/web3.js";
import type { Context } from "@/context.js";
import type {
  ChainEventRecord,
  EventProjection,
  EventScope,
  ProjectionStateValue,
  ProjectionStore,
  RelayerRecord,
} from "@/substream/types.js";
import type { VoidifyProgram } from "@/voidify/program.js";
import type { SubstreamModule } from "@/substream/chain/registry.js";
import type {
  ChainSyncRun,
  ChainSyncOptions,
  EventStreamSpec,
} from "@/substream/chain/index.js";
import { normalizePayload } from "@/substream/chain/events.js";
import type { VoidifyEventMap, VoidifyEventName } from "@/types/events.js";
import {
  parseEventsFromLogs,
  type DecodedEvent,
} from "@/utils/anchor-events.js";
import { substreamLogger } from "@/utils/logger.js";
import {
  syncTransactionBatches,
  type TransactionEvent,
} from "@/substream/chain/utils.js";

export interface RelayerModuleApi {
  sync(options?: ChainSyncOptions): Promise<void>;
  list(): Promise<RelayerRecord[]>;
  get(pubkey: string): Promise<RelayerRecord | null>;
  rebuild(): Promise<void>;
}

type IndexedRelayerEventName =
  | Extract<VoidifyEventName, `relayer${string}Event`>
  | "withdrawalEvent";

type DecodedRelayerEvent = DecodedEvent<
  VoidifyEventMap,
  IndexedRelayerEventName
>;

interface RelayerConfigSnapshot {
  name?: unknown;
  url?: unknown;
  feeBps?: unknown;
}

interface RelayerStateRecord extends RelayerRecord {
  lastEventIndex: bigint;
}

export const RELAYER_SCOPE: EventScope = {
  scopeType: "relayer",
  scopeKey: "global",
};

const RELAYER_LIVE_EVENTS = [
  "relayerRegisteredEvent",
  "relayerUpdatedEvent",
  "relayerActivatedEvent",
  "relayerUnregisteredEvent",
  "relayerDeactivatedEvent",
  "relayerSlashedEvent",
  "withdrawalEvent",
] as const;

const INDEXED_RELAYER_EVENT_NAMES: ReadonlySet<IndexedRelayerEventName> =
  new Set<IndexedRelayerEventName>(RELAYER_LIVE_EVENTS);

export const relayerModule: SubstreamModule = {
  id: "relayer",
  scopeType: "relayer",

  parseScopeKey(scopeKey: string): EventScope | null {
    return scopeKey === RELAYER_SCOPE.scopeKey ? RELAYER_SCOPE : null;
  },

  createStream(ctx: Context, voidify: VoidifyProgram) {
    return createRelayerStream(ctx, voidify);
  },

  liveEvents: RELAYER_LIVE_EVENTS.map((eventName) => ({
    eventName,
    async toRecord({ ctx, voidify, event, signature, slot }) {
      const decoded = { name: eventName, data: event } as DecodedRelayerEvent;
      const pubkey = decoded.data.relayer.toBase58();
      const cfg =
        decoded.name === "relayerRegisteredEvent"
          ? await fetchRelayerConfig(voidify, pubkey, false)
          : null;
      return relayerEventToChainEvent({
        event: decoded,
        signature,
        slot,
        address: ctx.programId,
        config: cfg,
      });
    },
  })),

  createProjections(store: ProjectionStore) {
    return [new RelayerProjection(store)];
  },

  createClientApi(runtime): RelayerModuleApi {
    return {
      async sync(options) {
        await runtime.sync(RELAYER_SCOPE, options);
      },
      async list() {
        const rows = await runtime.projections.list("relayer");
        return rows.map((row) => relayerRecordFromValue(row.value));
      },
      async get(pubkey) {
        const row = await runtime.projections.get("relayer", pubkey);
        return row ? relayerRecordFromValue(row.value) : null;
      },
      async rebuild() {
        await runtime.rebuildProjection(RELAYER_SCOPE, "relayer");
      },
    };
  },
};

function createRelayerStream(
  ctx: Context,
  voidify: VoidifyProgram,
): EventStreamSpec {
  return {
    id: "relayer",
    scope: RELAYER_SCOPE,
    address: ctx.programId,
    getChainLastIndex: async () => {
      const counterPda = voidify.relayerEventCounter();
      const counter =
        await voidify.program.account.relayerEventCounter.fetch(counterPda);
      return BigInt(counter.count.toString()) - 1n;
    },
    collectBatches: async function* (
      lastSignature?: string,
      run?: ChainSyncRun,
    ) {
      for await (const transactions of syncTransactionBatches(
        ctx.connection,
        ctx.programId,
        lastSignature,
        undefined,
        undefined,
        run?.updateProgress,
      )) {
        yield await collectRelayerRecords(transactions, voidify, ctx.programId);
      }
    },
  };
}

async function collectRelayerRecords(
  transactions: TransactionEvent[],
  voidify: VoidifyProgram,
  address: PublicKey,
): Promise<ChainEventRecord[]> {
  const records: ChainEventRecord[] = [];
  for (const tx of transactions) {
    const decoded = parseEventsFromLogs<VoidifyEventMap>(
      tx.logs,
      voidify.program.coder.events,
    );
    for (const item of decoded) {
      if (!isIndexedRelayerEventName(item.name)) continue;
      const event = item as DecodedRelayerEvent;
      const pubkey = event.data.relayer.toBase58();
      const cfg =
        event.name === "relayerRegisteredEvent"
          ? await fetchRelayerConfig(voidify, pubkey, true)
          : null;
      records.push(
        relayerEventToChainEvent({
          event,
          signature: tx.signature,
          slot: tx.slot,
          blockTime: tx.blockTime,
          address,
          config: cfg,
        }),
      );
    }
  }
  return records;
}

function relayerEventToChainEvent(args: {
  event: DecodedRelayerEvent;
  signature: string;
  slot?: number | null;
  blockTime?: number | null;
  address: { toBase58(): string };
  config?: { name: string; url: string; feeBps: number } | null;
}): ChainEventRecord {
  const payload = normalizePayload(args.event.data as Record<string, unknown>);
  if (args.event.name === "relayerRegisteredEvent") {
    payload.config = args.config ?? { name: "", url: "", feeBps: 0 };
  }

  return {
    ...RELAYER_SCOPE,
    eventName: args.event.name,
    eventIndex: BigInt(String(payload.index)),
    signature: args.signature,
    slot: args.slot ?? null,
    blockTime: args.blockTime ?? null,
    address: args.address.toBase58(),
    payload,
    createdAt: Date.now(),
  };
}

function isIndexedRelayerEventName(
  name: string,
): name is IndexedRelayerEventName {
  return INDEXED_RELAYER_EVENT_NAMES.has(name as IndexedRelayerEventName);
}

async function fetchRelayerConfig(
  voidify: VoidifyProgram,
  relayerPubkey: string,
  quietNotFound = false,
): Promise<{ name: string; url: string; feeBps: number } | null> {
  try {
    const cfgKey = voidify.relayerConfig(new PublicKey(relayerPubkey));
    const cfg = await voidify.program.account.relayerConfig.fetch(cfgKey);
    return { name: cfg.name, url: cfg.url, feeBps: cfg.feeBps };
  } catch (err) {
    if (!quietNotFound) {
      substreamLogger.warn({ err, relayerPubkey }, "fetchRelayerConfig failed");
    }
    return null;
  }
}

class RelayerProjection implements EventProjection {
  id = "relayer";

  constructor(private store: ProjectionStore) {}

  matches(event: ChainEventRecord): boolean {
    return event.scopeType === "relayer";
  }

  async apply(events: ChainEventRecord[]): Promise<void> {
    const sorted = [...events].sort((a, b) =>
      a.eventIndex < b.eventIndex ? -1 : a.eventIndex > b.eventIndex ? 1 : 0,
    );

    for (const event of sorted) {
      const pubkey = relayerPubkeyFromEvent(event);
      if (!pubkey) continue;
      const existing = await this.store.get(this.id, pubkey);
      const current = existing ? valueToRelayerState(existing.value) : null;
      const next = reduceRelayerEvent(current, event);
      if (!next) {
        await this.store.delete(this.id, pubkey);
        continue;
      }
      await this.store.put({
        projectionId: this.id,
        key: pubkey,
        value: relayerStateToValue(next),
        updatedAt: next.lastUpdated,
        lastEventIndex: next.lastEventIndex,
      });
    }
  }
}

function defaultRelayerRecord(pubkey: string): RelayerStateRecord {
  return {
    relayerPubkey: pubkey,
    name: "",
    url: "",
    feeBps: 0,
    stakeAmount: 0n,
    isActive: true,
    totalWithdrawals: 0,
    totalSolEarned: 0n,
    totalTokenDeducted: 0n,
    lastUpdated: Date.now(),
    lastEventIndex: -1n,
  };
}

function reduceRelayerEvent(
  existing: RelayerStateRecord | null,
  event: ChainEventRecord,
): RelayerStateRecord | null {
  const pubkey = relayerPubkeyFromEvent(event);
  if (!pubkey) return existing;

  const record = existing ? { ...existing } : defaultRelayerRecord(pubkey);
  if (event.eventIndex <= record.lastEventIndex) return record;

  switch (event.eventName) {
    case "relayerRegisteredEvent": {
      record.stakeAmount = payloadBigInt(event, "stakeAmount");
      record.isActive = true;
      const cfg = event.payload.config as RelayerConfigSnapshot | undefined;
      record.name = String(cfg?.name ?? "");
      record.url = String(cfg?.url ?? "");
      record.feeBps = Number(cfg?.feeBps ?? 0);
      break;
    }
    case "relayerDeactivatedEvent": {
      record.stakeAmount = payloadBigInt(event, "remainingStake");
      record.isActive = false;
      break;
    }
    case "relayerSlashedEvent":
    case "relayerUnregisteredEvent": {
      return null;
    }
    case "relayerUpdatedEvent": {
      if (event.payload.feeBps !== null && event.payload.feeBps !== undefined) {
        record.feeBps = Number(event.payload.feeBps);
      }
      if (event.payload.url !== null && event.payload.url !== undefined) {
        record.url = String(event.payload.url);
      }
      if (
        event.payload.addedAmount !== null &&
        event.payload.addedAmount !== undefined
      ) {
        record.stakeAmount += payloadBigInt(event, "addedAmount");
      }
      break;
    }
    case "relayerActivatedEvent": {
      record.stakeAmount = payloadBigInt(event, "stakeAmount");
      record.isActive = true;
      break;
    }
    case "withdrawalEvent": {
      const fee = payloadBigInt(event, "fee");
      const treasury = payloadBigInt(event, "treasury");
      const tokenDeducted = payloadBigInt(event, "tokenDeducted");
      record.totalWithdrawals += 1;
      record.totalSolEarned += fee + treasury;
      record.totalTokenDeducted += tokenDeducted;
      record.stakeAmount =
        record.stakeAmount >= tokenDeducted
          ? record.stakeAmount - tokenDeducted
          : 0n;
      break;
    }
    default:
      return existing;
  }

  record.lastEventIndex = event.eventIndex;
  record.lastUpdated = Date.now();
  return record;
}

function relayerPubkeyFromEvent(event: ChainEventRecord): string | null {
  const value = event.payload.relayer;
  return value === null || value === undefined ? null : String(value);
}

function payloadBigInt(event: ChainEventRecord, key: string): bigint {
  const value = event.payload[key];
  if (value === null || value === undefined) return 0n;
  return BigInt(String(value));
}

function relayerStateToValue(state: RelayerStateRecord): ProjectionStateValue {
  return {
    relayerPubkey: state.relayerPubkey,
    name: state.name,
    url: state.url,
    feeBps: state.feeBps,
    stakeAmount: state.stakeAmount.toString(),
    isActive: state.isActive,
    totalWithdrawals: state.totalWithdrawals,
    totalSolEarned: state.totalSolEarned.toString(),
    totalTokenDeducted: state.totalTokenDeducted.toString(),
    lastUpdated: state.lastUpdated,
    lastEventIndex: state.lastEventIndex.toString(),
  };
}

function valueToRelayerState(value: ProjectionStateValue): RelayerStateRecord {
  return {
    relayerPubkey: String(value.relayerPubkey),
    name: String(value.name ?? ""),
    url: String(value.url ?? ""),
    feeBps: Number(value.feeBps ?? 0),
    stakeAmount: BigInt(String(value.stakeAmount ?? "0")),
    isActive: Boolean(value.isActive),
    totalWithdrawals: Number(value.totalWithdrawals ?? 0),
    totalSolEarned: BigInt(String(value.totalSolEarned ?? "0")),
    totalTokenDeducted: BigInt(String(value.totalTokenDeducted ?? "0")),
    lastUpdated: Number(value.lastUpdated ?? Date.now()),
    lastEventIndex: BigInt(String(value.lastEventIndex ?? "-1")),
  };
}

function relayerRecordFromValue(value: ProjectionStateValue): RelayerRecord {
  const { lastEventIndex: _lastEventIndex, ...record } =
    valueToRelayerState(value);
  return record;
}
