import type {
  ChainEventPayload,
  ChainEventRecord,
  ChainEventWire,
} from "@/substream/types.js";

export function chainEventToWire(event: ChainEventRecord): ChainEventWire {
  return { ...event, eventIndex: event.eventIndex.toString() };
}

export function chainEventFromWire(wire: ChainEventWire): ChainEventRecord {
  return { ...wire, eventIndex: BigInt(wire.eventIndex) };
}

export function normalizePayload(value: unknown): ChainEventPayload {
  if (!value || typeof value !== "object") return {};
  const out: ChainEventPayload = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = normalizeValue(item);
  }
  return out;
}

function normalizeValue(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number" || typeof value === "string") return value;
  if (typeof value === "boolean" || value === null || value === undefined) {
    return value ?? null;
  }
  if (Array.isArray(value)) return value.map((v) => normalizeValue(v));
  if (value instanceof Uint8Array) {
    return Array.from(value)
      .map((item) => item.toString(16).padStart(2, "0"))
      .join("");
  }
  if (
    typeof value === "object" &&
    "toBase58" in value &&
    typeof (value as { toBase58?: unknown }).toBase58 === "function"
  ) {
    return (value as { toBase58(): string }).toBase58();
  }
  if (
    typeof value === "object" &&
    "toString" in value &&
    typeof (value as { toString?: unknown }).toString === "function" &&
    value.constructor?.name === "BN"
  ) {
    return (value as { toString(): string }).toString();
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = normalizeValue(item);
    }
    return out;
  }
  return String(value);
}
