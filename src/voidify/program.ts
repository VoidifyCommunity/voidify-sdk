import { Program } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import type { Voidify } from "@/idl/voidify/idl.js";
import idl from "@/idl/voidify/idl.json" with { type: "json" };
import { getConstSeed } from "@/utils/idl-seed.js";

export class VoidifyProgram {
  private connection: Connection;
  private _program: Program<Voidify> | null = null;
  private _programId: PublicKey;

  static readonly SEEDS = {
    STAKE_CONFIG: getConstSeed(idl, "stake_config"),
    TREASURY_CONFIG: getConstSeed(idl, "treasury_config"),
    ORACLE_CONFIG: getConstSeed(idl, "oracle_config"),
    POOL: getConstSeed(idl, "pool"),
    TREASURY: getConstSeed(idl, "treasury"),
    COMMITMENT: getConstSeed(idl, "commitment"),
    NULLIFIER: getConstSeed(idl, "nullifier"),
    RELAYER_CONFIG: getConstSeed(idl, "relayer_config"),
    RELAYER_EVENT_COUNTER: getConstSeed(idl, "relayer_event_counter"),
  } as const;

  constructor(connection: Connection, programId: PublicKey) {
    this.connection = connection;
    this._programId = programId;
  }

  get program(): Program<Voidify> {
    if (!this._program) {
      idl["address"] = this._programId.toBase58();
      this._program = new Program<Voidify>(idl as any, {
        connection: this.connection,
      });
    }
    return this._program;
  }

  get programId(): PublicKey {
    return this._programId;
  }

  get rpcConnection(): Connection {
    return this.connection;
  }

  stakeConfig(): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [VoidifyProgram.SEEDS.STAKE_CONFIG],
      this._programId,
    );
    return pda;
  }

  treasuryConfig(): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [VoidifyProgram.SEEDS.TREASURY_CONFIG],
      this._programId,
    );
    return pda;
  }

  oracleConfig(): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [VoidifyProgram.SEEDS.ORACLE_CONFIG],
      this._programId,
    );
    return pda;
  }

  pool(denomination: number | bigint): PublicKey {
    const denominationBuffer = Buffer.alloc(8);
    denominationBuffer.writeBigUInt64BE(BigInt(denomination));

    const [pda] = PublicKey.findProgramAddressSync(
      [VoidifyProgram.SEEDS.POOL, denominationBuffer],
      this._programId,
    );
    return pda;
  }

  treasury(): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [VoidifyProgram.SEEDS.TREASURY],
      this._programId,
    );
    return pda;
  }

  commitment(commitment: Uint8Array): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [VoidifyProgram.SEEDS.COMMITMENT, commitment],
      this._programId,
    );
    return pda;
  }

  nullifier(nullifierHash: Uint8Array): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [VoidifyProgram.SEEDS.NULLIFIER, nullifierHash],
      this._programId,
    );
    return pda;
  }

  relayerConfig(relayerPubkey: PublicKey): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [VoidifyProgram.SEEDS.RELAYER_CONFIG, relayerPubkey.toBuffer()],
      this._programId,
    );
    return pda;
  }

  relayerEventCounter(): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [VoidifyProgram.SEEDS.RELAYER_EVENT_COUNTER],
      this._programId,
    );
    return pda;
  }
}
