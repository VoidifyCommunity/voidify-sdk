import { Connection, ConfirmedSignatureInfo, PublicKey } from "@solana/web3.js";
import pRetry from "p-retry";
import type { SyncProgress } from "@/substream/types.js";

const retryConnection = <T>(operation: () => Promise<T>): Promise<T> =>
  pRetry(operation, {
    minTimeout: 1000,
    retries: 5,
  });

export async function fetchSignaturesForAddress(
  connection: Connection,
  address: PublicKey,
  lastSignature?: string,
  batchSize = 1000,
): Promise<ConfirmedSignatureInfo[]> {
  const signatures: ConfirmedSignatureInfo[] = [];
  let beforeSignature: string | undefined = undefined;

  while (true) {
    const batch = await retryConnection(() =>
      connection.getSignaturesForAddress(address, {
        limit: batchSize,
        before: beforeSignature,
        until: lastSignature,
      }),
    );

    if (batch.length === 0) break;
    signatures.push(...batch);
    if (batch.length < batchSize) break;
    beforeSignature = batch[batch.length - 1].signature;
  }

  signatures.reverse();
  return signatures;
}

export interface TransactionEvent {
  signature: string;
  logs: string[];
  slot: number | null;
  blockTime: number | null;
}

export async function* syncTransactionBatches(
  connection: Connection,
  address: PublicKey,
  lastSignature?: string,
  signatureBatchSize = 1000,
  transactionBatchSize = 50,
  updateProgress?: (progress: SyncProgress) => void,
): AsyncGenerator<TransactionEvent[]> {
  const signatures = await fetchSignaturesForAddress(
    connection,
    address,
    lastSignature,
    signatureBatchSize,
  );

  if (signatures.length === 0) {
    return;
  }

  const events: TransactionEvent[] = [];
  let current = 0;

  for (const sigInfo of signatures) {
    const tx = await retryConnection(async () => {
      const transaction = await connection.getTransaction(sigInfo.signature, {
        maxSupportedTransactionVersion: 0,
      });

      if (!transaction?.meta) {
        throw new Error(`transaction unavailable: ${sigInfo.signature}`);
      }

      return transaction;
    });
    const meta = tx.meta;
    if (!meta) {
      throw new Error(`transaction unavailable: ${sigInfo.signature}`);
    }

    events.push({
      signature: sigInfo.signature,
      logs: meta.logMessages || [],
      slot: tx.slot ?? null,
      blockTime: tx.blockTime ?? null,
    });

    current += 1;
    updateProgress?.({
      current,
      total: signatures.length,
      signature: sigInfo.signature,
    });

    if (events.length >= transactionBatchSize) {
      yield events.splice(0, events.length);
    }
  }

  if (events.length > 0) {
    yield events.splice(0, events.length);
  }
}
