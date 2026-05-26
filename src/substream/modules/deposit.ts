import type { PublicKey } from "@solana/web3.js";
import type { Context } from "@/context.js";
import type { DepositEvent, VoidifyEventMap } from "@/types/events.js";
import { toBigInt } from "@/utils/anchor-events.js";
import { bytesToBigInt, bytesToHex } from "@/utils/bytes.js";
import type {
  ChainEventPayload,
  ChainEventRecord,
  DepositRecord,
  EventCursor,
  EventScope,
} from "@/substream/types.js";
import type { VoidifyProgram } from "@/voidify/program.js";
import type { SubstreamModule } from "@/substream/chain/registry.js";
import type {
  ChainSyncRun,
  ChainSyncOptions,
  EventStreamSpec,
} from "@/substream/chain/index.js";
import { parseEventsFromLogs } from "@/utils/anchor-events.js";
import {
  syncTransactionBatches,
  type TransactionEvent,
} from "@/substream/chain/utils.js";

export interface DepositModuleApi {
  sync(denomination: bigint, options?: ChainSyncOptions): Promise<void>;
  list(
    denomination: bigint,
    opts?: { offset?: number; limit?: number },
  ): Promise<DepositRecord[]>;
  getAfter(denomination: bigint, afterIndex?: bigint): Promise<DepositRecord[]>;
  count(denomination: bigint): Promise<number>;
  getCursor(denomination: bigint): Promise<EventCursor | null>;
}

export function depositScope(denomination: bigint): EventScope {
  return { scopeType: "deposit", scopeKey: denomination.toString() };
}

export const depositModule: SubstreamModule = {
  id: "deposit",
  scopeType: "deposit",

  parseScopeKey(scopeKey: string): EventScope | null {
    try {
      return depositScope(BigInt(scopeKey));
    } catch {
      return null;
    }
  },

  createStream(ctx: Context, voidify: VoidifyProgram, scope: EventScope) {
    return createDepositStream(ctx, voidify, BigInt(scope.scopeKey));
  },

  liveEvents: [
    {
      eventName: "depositEvent",
      async toRecord({ voidify, event, signature, slot }) {
        const deposit = event as DepositEvent;
        return depositEventToChainEvent({
          event: deposit,
          signature,
          slot,
          address: voidify.pool(BigInt(String(deposit.denomination))),
        });
      },
    },
  ],

  createClientApi(runtime): DepositModuleApi {
    return {
      async sync(denomination, options) {
        await runtime.sync(depositScope(denomination), options);
      },
      async list(denomination, opts) {
        const rows = await runtime.events.list(
          depositScope(denomination),
          opts,
        );
        return rows.map(depositRecordFromEvent);
      },
      async getAfter(denomination, afterIndex) {
        const rows = await runtime.events.getAfter(
          depositScope(denomination),
          afterIndex,
        );
        return rows.map(depositRecordFromEvent);
      },
      async count(denomination) {
        return runtime.events.count(depositScope(denomination));
      },
      async getCursor(denomination) {
        return runtime.events.getCursor(depositScope(denomination));
      },
    };
  },
};

function createDepositStream(
  ctx: Context,
  voidify: VoidifyProgram,
  denomination: bigint,
): EventStreamSpec {
  const address = voidify.pool(denomination);
  return {
    id: "deposit",
    scope: depositScope(denomination),
    address,
    getChainLastIndex: async () => {
      const poolAccount = await voidify.program.account.pool.fetch(address);
      return BigInt(poolAccount.merkleTree.nextIndex) - 1n;
    },
    collectBatches: async function* (
      lastSignature?: string,
      run?: ChainSyncRun,
    ) {
      for await (const transactions of syncTransactionBatches(
        ctx.connection,
        address,
        lastSignature,
        undefined,
        undefined,
        run?.updateProgress,
      )) {
        yield collectDepositRecords(transactions, voidify, address);
      }
    },
  };
}

function collectDepositRecords(
  transactions: TransactionEvent[],
  voidify: VoidifyProgram,
  address: PublicKey,
): ChainEventRecord[] {
  const records: ChainEventRecord[] = [];
  for (const tx of transactions) {
    const decoded = parseEventsFromLogs<VoidifyEventMap>(
      tx.logs,
      voidify.program.coder.events,
    );
    for (const item of decoded) {
      if (item.name !== "depositEvent") continue;
      records.push(
        depositEventToChainEvent({
          event: item.data as DepositEvent,
          signature: tx.signature,
          slot: tx.slot,
          blockTime: tx.blockTime,
          address,
        }),
      );
    }
  }
  return records;
}

function depositEventToChainEvent(args: {
  event: DepositEvent;
  signature: string;
  slot?: number | null;
  blockTime?: number | null;
  address: { toBase58(): string };
}): ChainEventRecord {
  const event = args.event as DepositEvent & {
    depositor: { toString(): string };
  };
  const denomination = toBigInt(event.denomination);
  const index = Number(event.index);
  const commitmentBytes = Uint8Array.from(event.commitment);
  const payload: ChainEventPayload = {
    denomination: denomination.toString(),
    depositor: event.depositor.toString(),
    commitment: bytesToBigInt(commitmentBytes).toString(),
    commitmentHex: bytesToHex(commitmentBytes),
    index,
    timestamp: toBigInt(event.timestamp).toString(),
  };

  return {
    ...depositScope(denomination),
    eventName: "depositEvent",
    eventIndex: BigInt(index),
    signature: args.signature,
    slot: args.slot ?? null,
    blockTime: args.blockTime ?? null,
    address: args.address.toBase58(),
    payload,
    createdAt: Date.now(),
  };
}

function depositRecordFromEvent(event: ChainEventRecord): DepositRecord {
  return {
    denomination: BigInt(String(event.payload.denomination)),
    depositor: String(event.payload.depositor),
    commitment: String(event.payload.commitment),
    index: Number(event.payload.index),
    timestamp: Number(BigInt(String(event.payload.timestamp))),
    signature: event.signature,
  };
}
