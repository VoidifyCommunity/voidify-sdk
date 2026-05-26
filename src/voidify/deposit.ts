import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { Context } from "@/context.js";
import { bigIntToBytes } from "@/utils/bytes.js";
import { makeCommand } from "@/utils/tx.js";
import type { DepositRecord } from "@/substream/types.js";
import type { ChainSyncOptions } from "@/substream/chain/index.js";
import { SubstreamCliClient } from "@/substream/client.js";
import { VoidifyProgram } from "./program.js";

export async function depositIx(
  ctx: Context,
  commitment: string,
  denomination: bigint,
): Promise<TransactionInstruction[]> {
  const commitmentBytes = bigIntToBytes(BigInt(commitment));

  const voidifyProgram = new VoidifyProgram(ctx.connection, ctx.programId);

  const poolPDA = voidifyProgram.pool(denomination);
  const treasuryPDA = voidifyProgram.treasury();
  const commitmentPDA = voidifyProgram.commitment(commitmentBytes);

  const ix = await voidifyProgram.program.methods
    .deposit(Array.from(commitmentBytes))
    .accountsPartial({
      sender: ctx.publicKey,
      pool: poolPDA,
      poolTreasury: treasuryPDA,
      commitmentAccount: commitmentPDA,
      systemProgram: PublicKey.default,
    })
    .instruction();

  return [ix];
}

export const deposit = makeCommand(depositIx);

export async function listDeposits(
  ctx: Context,
  denomination: bigint,
  options?: {
    offset?: number;
    limit?: number;
    output?: string;
    sync?: ChainSyncOptions;
  },
): Promise<DepositRecord[]> {
  const client = new SubstreamCliClient(ctx);
  await client.init();

  const depositModule = client.module("deposit");
  await depositModule.sync(denomination, options?.sync);
  const deposits = await depositModule.list(denomination, {
    offset: options?.offset,
    limit: options?.limit,
  });

  if (options?.output) {
    const fs = await import("fs/promises");
    const data = JSON.stringify(
      deposits,
      (_, v) => (typeof v === "bigint" ? v.toString() : v),
      2,
    );
    await fs.writeFile(options.output, data, "utf-8");
  }

  return deposits;
}
