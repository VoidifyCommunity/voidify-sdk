import type { VersionedTransaction } from "@solana/web3.js";

export type SignReturn<S> = S extends false ? VersionedTransaction : string;
