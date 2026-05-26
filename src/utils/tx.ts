import {
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";
import { Context } from "@/context.js";
import { SignReturn } from "@/types/index.js";

export async function buildTx(
  ctx: Context,
  txOrIxs: TransactionInstruction[] | VersionedTransaction,
): Promise<{
  tx: VersionedTransaction;
  blockhash: string;
  lastValidBlockHeight: number;
}> {
  if (Array.isArray(txOrIxs)) {
    if (!ctx.wallet) {
      throw new Error("wallet is required to build a transaction from ixs");
    }
    const latest = await ctx.connection.getLatestBlockhash("confirmed");
    const tx = new VersionedTransaction(
      new TransactionMessage({
        payerKey: ctx.wallet.publicKey,
        recentBlockhash: latest.blockhash,
        instructions: txOrIxs,
      }).compileToV0Message(),
    );
    return {
      tx,
      blockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight,
    };
  }

  const tx = txOrIxs;
  return {
    tx,
    blockhash: tx.message.recentBlockhash,
    lastValidBlockHeight:
      (await ctx.connection.getBlockHeight("confirmed")) + 150,
  };
}

export async function signAndSend(
  ctx: Context,
  txOrIxs: TransactionInstruction[] | VersionedTransaction,
): Promise<string> {
  if (!ctx.wallet) {
    throw new Error("wallet is required to sign transactions");
  }

  const { tx, blockhash, lastValidBlockHeight } = await buildTx(ctx, txOrIxs);

  const signedTx = await ctx.wallet.signTransaction(tx);

  const signature = bs58.encode(signedTx.signatures[0]);

  try {
    await ctx.connection.sendTransaction(signedTx, {
      preflightCommitment: "processed",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    if (!msg.toLowerCase().includes("already been processed")) {
      throw err;
    }
  }

  await ctx.connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    "confirmed",
  );
  return signature;
}

export async function signOrBuild<S extends boolean = true>(
  ctx: Context,
  ixs: TransactionInstruction[],
  sign: S = true as S,
): Promise<SignReturn<S>> {
  if (sign) return (await signAndSend(ctx, ixs)) as SignReturn<S>;
  return (await buildTx(ctx, ixs)).tx as SignReturn<S>;
}

export function makeCommand<TArgs extends unknown[]>(
  ixFn: (ctx: Context, ...args: TArgs) => Promise<TransactionInstruction[]>,
): <S extends boolean = true>(
  ctx: Context,
  ...args: [...TArgs, sign?: S]
) => Promise<SignReturn<S>> {
  return async (ctx, ...rest) => {
    const argCount = ixFn.length - 1;
    const hasSign = rest.length > argCount;
    const args = (hasSign ? rest.slice(0, argCount) : rest) as TArgs;
    const sign = (hasSign ? rest[argCount] : true) as boolean;
    const ixs = await ixFn(ctx, ...args);
    return signOrBuild(ctx, ixs, sign) as never;
  };
}
