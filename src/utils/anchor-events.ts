import type BN from "bn.js";

export function toBigInt(v: BN | bigint | number | string): bigint {
  if (typeof v === "bigint") return v;
  if (typeof v === "number") return BigInt(v);
  if (typeof v === "string") return BigInt(v);
  return BigInt(v.toString());
}

export type DecodedEvent<M, K extends keyof M = keyof M> = K extends keyof M
  ? { name: K; data: M[K] }
  : never;

export function parseEventsFromLogs<M>(
  logs: string[],
  coder: { decode: (data: string) => { name: string; data: unknown } | null },
): DecodedEvent<M>[] {
  const events: DecodedEvent<M>[] = [];
  for (const log of logs) {
    if (!log.includes("Program data:")) continue;
    const encoded = log.split("Program data: ")[1];
    const decoded = coder.decode(encoded);
    if (decoded) events.push(decoded as DecodedEvent<M>);
  }
  return events;
}

export function findEventByName<M, K extends keyof M & string>(
  events: DecodedEvent<M>[],
  name: K,
): M[K] | null {
  for (const e of events) {
    if (e.name === name) return e.data as M[K];
  }
  return null;
}
