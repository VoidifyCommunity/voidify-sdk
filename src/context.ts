import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import type { SubstreamRepos } from "@/substream/types.js";

export type SubstreamMode = "remote" | "local" | "auto";

export type SubstreamConfig =
  | { type: "remote"; url: string; makeRepos?: () => SubstreamRepos }
  | { type: "local"; makeRepos?: () => SubstreamRepos }
  | { type: "auto"; url: string; makeRepos?: () => SubstreamRepos };

export interface ContextOptions {
  rpcUrl?: string;
  programId?: PublicKey;
  wallet?: anchor.Wallet | Keypair | null;
  substream?: SubstreamConfig;
  wasmPath?: string;
  zkeyPath?: string;
}

export class Context {
  private readonly _rpcUrl: string | null;
  private readonly _connection: Connection | null;
  private readonly _programId: PublicKey | null;
  private readonly _substream: SubstreamConfig | null;
  private readonly _wasmPath: string | null;
  private readonly _zkeyPath: string | null;
  readonly wallet: anchor.Wallet | null;

  constructor(opts: ContextOptions = {}) {
    this._rpcUrl = opts.rpcUrl ?? null;
    this._connection = opts.rpcUrl
      ? new Connection(opts.rpcUrl, {
          commitment: "confirmed",
          disableRetryOnRateLimit: true,
        })
      : null;
    this._programId = opts.programId ?? null;
    this._substream = opts.substream ?? null;
    this._wasmPath = opts.wasmPath ?? null;
    this._zkeyPath = opts.zkeyPath ?? null;

    const w = opts.wallet ?? null;
    this.wallet =
      w === null ? null : w instanceof Keypair ? new anchor.Wallet(w) : w;
  }

  withRpcUrl(rpcUrl: string): Context {
    return new Context({
      rpcUrl,
      programId: this._programId ?? undefined,
      wallet: this.wallet,
      substream: this._substream ?? undefined,
      wasmPath: this._wasmPath ?? undefined,
      zkeyPath: this._zkeyPath ?? undefined,
    });
  }

  get rpcUrl(): string {
    if (!this._rpcUrl) {
      throw new Error("rpcUrl is required for this operation");
    }
    return this._rpcUrl;
  }

  get connection(): Connection {
    if (!this._connection) {
      throw new Error("rpcUrl/connection is required for this operation");
    }
    return this._connection;
  }

  get programId(): PublicKey {
    if (!this._programId) {
      throw new Error("programId is required for this operation");
    }
    return this._programId;
  }

  get substream(): SubstreamConfig {
    if (!this._substream) {
      throw new Error("substream config is required for this operation");
    }
    return this._substream;
  }

  get wasmPath(): string {
    if (!this._wasmPath) {
      throw new Error(
        "wasmPath is required for this operation (proof generation)",
      );
    }
    return this._wasmPath;
  }

  get zkeyPath(): string {
    if (!this._zkeyPath) {
      throw new Error(
        "zkeyPath is required for this operation (proof generation)",
      );
    }
    return this._zkeyPath;
  }

  get publicKey(): PublicKey {
    if (!this.wallet) {
      throw new Error("wallet is required for this operation");
    }
    return this.wallet.publicKey;
  }
}
