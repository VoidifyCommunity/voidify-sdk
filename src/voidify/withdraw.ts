import {
  ComputeBudgetProgram,
  PublicKey,
  TransactionInstruction,
} from "@solana/web3.js";
import { Context } from "@/context.js";
import { bigIntToBytes } from "@/utils/bytes.js";
import { Note } from "@/utils/note.js";
import { generateProof, proofToBytes } from "@/utils/proof.js";
import { toBN } from "@/utils/amount.js";
import { signAndSend } from "@/utils/tx.js";
import type { ChainSyncOptions } from "@/substream/chain/index.js";
import { SubstreamCliClient } from "@/substream/client.js";
import type { RelayerRecord } from "@/substream/types.js";
import { VoidifyProgram } from "./program.js";

const WITHDRAW_COMPUTE_UNIT_LIMIT = 600_000;

function withdrawComputeBudgetIx(): TransactionInstruction {
  return ComputeBudgetProgram.setComputeUnitLimit({
    units: WITHDRAW_COMPUTE_UNIT_LIMIT,
  });
}

export async function directWithdrawIx(
  ctx: Context,
  proof: Uint8Array,
  root: Uint8Array,
  nullifierHash: Uint8Array,
  recipient: string,
  fee: bigint,
  treasury: bigint,
  denomination: bigint,
): Promise<TransactionInstruction[]> {
  const recipientPubkey = new PublicKey(recipient);

  const voidifyProgram = new VoidifyProgram(ctx.connection, ctx.programId);

  const treasuryConfig =
    await voidifyProgram.program.account.treasuryConfig.fetch(
      voidifyProgram.treasuryConfig(),
    );

  const ix = await voidifyProgram.program.methods
    .directWithdraw(
      Array.from(proof),
      Array.from(root),
      Array.from(nullifierHash),
      toBN(fee),
      toBN(treasury),
    )
    .accountsPartial({
      sender: ctx.publicKey,
      recipient: recipientPubkey,
      pool: voidifyProgram.pool(denomination),
      treasurySolDestination: treasuryConfig.treasurySolAddress as PublicKey,
    })
    .instruction();

  return [withdrawComputeBudgetIx(), ix];
}

export async function withdrawIx(
  ctx: Context,
  proof: Uint8Array,
  root: Uint8Array,
  nullifierHash: Uint8Array,
  recipient: string,
  relayer: string,
  fee: bigint,
  treasury: bigint,
  switchboardQuote: PublicKey,
  denomination: bigint,
): Promise<TransactionInstruction[]> {
  const recipientPubkey = new PublicKey(recipient);
  const relayerPubkey = new PublicKey(relayer);

  const voidifyProgram = new VoidifyProgram(ctx.connection, ctx.programId);

  const [treasuryConfig, stakeConfig] = await Promise.all([
    voidifyProgram.program.account.treasuryConfig.fetch(
      voidifyProgram.treasuryConfig(),
    ),
    voidifyProgram.program.account.stakeConfig.fetch(
      voidifyProgram.stakeConfig(),
    ),
  ]);

  const ix = await voidifyProgram.program.methods
    .withdraw(
      Array.from(proof),
      Array.from(root),
      Array.from(nullifierHash),
      toBN(fee),
      toBN(treasury),
    )
    .accountsPartial({
      relayer: relayerPubkey,
      recipient: recipientPubkey,
      pool: voidifyProgram.pool(denomination),
      switchboardQuote,
      stakeTokenMint: stakeConfig.stakeTokenMint as PublicKey,
      stakingRewardVault: treasuryConfig.stakingRewardVault as PublicKey,
      treasuryTokenAccount: treasuryConfig.treasuryTokenAccount as PublicKey,
    })
    .instruction();

  return [withdrawComputeBudgetIx(), ix];
}

export interface WithdrawArtifact {
  withdrawData: string;
  relayerUrl: string;
}

export interface WithdrawSyncOptions {
  depositSync?: ChainSyncOptions;
  relayerSync?: ChainSyncOptions;
}

function scoreRelayer(stake: number, feeBps: number): number {
  const fee = feeBps / 10000;
  return stake * Math.max(0, 1 - 25 * fee * fee);
}

function pickRandomRelayer(list: RelayerRecord[]): RelayerRecord | null {
  if (list.length === 0) return null;
  if (list.length === 1) return list[0]!;

  const weights = list.map((r) =>
    scoreRelayer(Number(r.stakeAmount ?? 0n), r.feeBps),
  );
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total === 0) return list[Math.floor(Math.random() * list.length)]!;

  let rnd = Math.random() * total;
  for (let i = 0; i < list.length; i++) {
    rnd -= weights[i]!;
    if (rnd <= 0) return list[i]!;
  }

  return list[list.length - 1]!;
}

function findRelayerByName(
  relayers: RelayerRecord[],
  name: string,
): RelayerRecord | null {
  return relayers.find((r) => r.name === name) ?? null;
}

async function isRelayerHealthy(url: string): Promise<boolean> {
  try {
    const res = await fetch(url.replace(/\/$/, "") + "/health", {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function pickAutoRelayer(
  relayers: RelayerRecord[],
): Promise<RelayerRecord> {
  const active = relayers.filter((r) => r.isActive);
  const healthChecks = await Promise.all(
    active.map(async (relayer) => ({
      relayer,
      isHealthy: await isRelayerHealthy(relayer.url),
    })),
  );
  const healthy = healthChecks
    .filter((item) => item.isHealthy)
    .map((item) => item.relayer);

  const selected = pickRandomRelayer(healthy);
  if (!selected) {
    throw new Error("Failed to auto-select relayer: no healthy relayer found");
  }

  return selected;
}

export async function validateNote(
  ctx: Context,
  note_str: string,
): Promise<{ note: Note }> {
  const note = await Note.deserialize(note_str);

  const voidifyProgram = new VoidifyProgram(ctx.connection, ctx.programId);

  const nullifierBytes = bigIntToBytes(BigInt(note.nullifierHash));
  const nullifierPda = voidifyProgram.nullifier(nullifierBytes);
  const nullifierAccount = await ctx.connection.getAccountInfo(nullifierPda);
  if (nullifierAccount !== null) {
    throw new Error(
      "Note already used: this note has been withdrawn. Each deposit note can be used only once.",
    );
  }

  const client = new SubstreamCliClient(ctx);
  await client.init();
  const depositModule = client.module("deposit");
  await depositModule.sync(note.amountRaw);
  const deposits = await depositModule.list(note.amountRaw);
  const commitmentInPool = deposits.some(
    (d) => d.commitment === note.commitment,
  );
  if (!commitmentInPool) {
    throw new Error(
      "Invalid note: deposit not found in the pool. Verify the note is correct and the deposit transaction has been confirmed.",
    );
  }

  return { note };
}

export async function prepareWithdraw(
  ctx: Context,
  note_str: string,
  recipient?: string,
  relayerName?: string,
  options?: WithdrawSyncOptions,
  sendRpc = false,
): Promise<WithdrawArtifact> {
  const note = await Note.deserialize(note_str);

  const recipientPubkey = recipient ? new PublicKey(recipient) : ctx.publicKey;
  const recipientAddress = recipientPubkey.toBase58();

  const voidifyProgram = new VoidifyProgram(ctx.connection, ctx.programId);

  const nullifierBytes = bigIntToBytes(BigInt(note.nullifierHash));
  const nullifierPda = voidifyProgram.nullifier(nullifierBytes);
  const nullifierAccount = await ctx.connection.getAccountInfo(nullifierPda);
  if (nullifierAccount !== null) {
    throw new Error(
      "Note already used: this note has been withdrawn. Each deposit note can be used only once.",
    );
  }

  const client = new SubstreamCliClient(ctx);
  await client.init();

  const depositModule = client.module("deposit");
  await depositModule.sync(note.amountRaw, options?.depositSync);
  const deposits = await depositModule.list(note.amountRaw);
  const commitments = [...deposits]
    .sort((a, b) => a.index - b.index)
    .map((d) => d.commitment);

  if (commitments.length === 0) {
    throw new Error("Failed to get commitments.");
  }

  if (!commitments.includes(note.commitment)) {
    throw new Error(
      "Invalid note: deposit not found in the pool. Verify the note is correct and the deposit transaction has been confirmed.",
    );
  }

  const relayerModule = client.module("relayer");
  await relayerModule.sync(options?.relayerSync);
  const relayers = await relayerModule.list();
  const relayerInfo = relayerName
    ? findRelayerByName(relayers, relayerName)
    : await pickAutoRelayer(relayers);
  if (!relayerInfo) {
    throw new Error(
      relayerName
        ? `Failed to get relayer info for name: ${relayerName}`
        : "Failed to get relayer info",
    );
  }
  const relayerPubkey = new PublicKey(relayerInfo.relayerPubkey);
  const treasuryConfig =
    await voidifyProgram.program.account.treasuryConfig.fetch(
      voidifyProgram.treasuryConfig(),
    );
  const fee = (note.amountRaw * BigInt(relayerInfo.feeBps)) / BigInt(10000);
  const treasury =
    (note.amountRaw * BigInt(treasuryConfig.treasuryBps)) / BigInt(10000);

  const { root, proof } = await generateProof(
    note.nullifier,
    note.secret,
    note.amountRaw.toString(),
    note.commitment,
    note.nullifierHash,
    recipientPubkey,
    relayerPubkey,
    fee,
    treasury,
    commitments,
    ctx.wasmPath,
    ctx.zkeyPath,
  );

  const withdrawData = JSON.stringify({
    proof: await proofToBytes(proof),
    root: Array.from(bigIntToBytes(BigInt(root))),
    nullifierHash: Array.from(bigIntToBytes(BigInt(note.nullifierHash))),
    recipient: recipientAddress,
    amount: note.amountRaw.toString(),
    fee: fee.toString(),
    treasury: treasury.toString(),
    ...(sendRpc ? { rpcUrl: ctx.rpcUrl } : {}),
  });

  return { withdrawData, relayerUrl: relayerInfo.url };
}

export async function submitWithdrawToRelayer(
  artifact: WithdrawArtifact,
): Promise<string> {
  const response = await fetch(artifact.relayerUrl + "/api/relay/withdraw", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: artifact.withdrawData,
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "<unreadable body>");
    let formatted = errorBody;
    try {
      const parsed = JSON.parse(errorBody);
      formatted =
        typeof parsed?.error === "string"
          ? parsed.error
          : JSON.stringify(parsed, null, 2);
    } catch {}
    throw new Error(
      `Failed to send withdraw data: ${response.status} ${response.statusText}\n${formatted}`,
    );
  }

  const responseText = await response.text();
  let result: any;
  try {
    result = JSON.parse(responseText);
  } catch {
    throw new Error(
      `Relayer returned non-JSON response: ${responseText.slice(0, 200)}`,
    );
  }

  if (!result?.success || !result?.signature) {
    throw new Error(result?.error || "Relayer returned unsuccessful response");
  }

  return result.signature as string;
}

export async function withdraw(
  ctx: Context,
  note_str: string,
  recipient?: string,
  relayerName?: string,
  options?: WithdrawSyncOptions,
  sendRpc = false,
): Promise<string> {
  const artifact = await prepareWithdraw(
    ctx,
    note_str,
    recipient,
    relayerName,
    options,
    sendRpc,
  );
  return submitWithdrawToRelayer(artifact);
}

export async function directWithdraw(
  ctx: Context,
  note_str: string,
  recipient: string,
): Promise<string> {
  const note = await Note.deserialize(note_str);
  const recipientPubkey = new PublicKey(recipient);

  const voidifyProgram = new VoidifyProgram(ctx.connection, ctx.programId);

  const nullifierBytes = bigIntToBytes(BigInt(note.nullifierHash));
  const nullifierPda = voidifyProgram.nullifier(nullifierBytes);
  const nullifierAccount = await ctx.connection.getAccountInfo(nullifierPda);
  if (nullifierAccount !== null) {
    throw new Error(
      "Note already used: this note has been withdrawn. Each deposit note can be used only once.",
    );
  }

  const client = new SubstreamCliClient(ctx);
  await client.init();
  const depositModule = client.module("deposit");
  await depositModule.sync(note.amountRaw);
  const deposits = await depositModule.list(note.amountRaw);
  const commitments = [...deposits]
    .sort((a, b) => a.index - b.index)
    .map((d) => d.commitment);
  if (commitments.length === 0) {
    throw new Error("Failed to get commitments.");
  }
  if (!commitments.includes(note.commitment)) {
    throw new Error(
      "Invalid note: deposit not found in the pool. Verify the note is correct and the deposit transaction has been confirmed.",
    );
  }

  const treasuryConfig =
    await voidifyProgram.program.account.treasuryConfig.fetch(
      voidifyProgram.treasuryConfig(),
    );
  const fee = 0n;
  const treasury =
    (note.amountRaw * BigInt(treasuryConfig.directWithdrawBps)) / 10000n;

  const senderAsRelayer = ctx.publicKey;

  const { root, proof } = await generateProof(
    note.nullifier,
    note.secret,
    note.amountRaw.toString(),
    note.commitment,
    note.nullifierHash,
    recipientPubkey,
    senderAsRelayer,
    fee,
    treasury,
    commitments,
    ctx.wasmPath,
    ctx.zkeyPath,
  );

  const proofBytes = new Uint8Array(await proofToBytes(proof));
  const rootBytes = bigIntToBytes(BigInt(root));
  const nullifierHashBytes = bigIntToBytes(BigInt(note.nullifierHash));

  const ixs = await directWithdrawIx(
    ctx,
    proofBytes,
    rootBytes,
    nullifierHashBytes,
    recipient,
    fee,
    treasury,
    note.amountRaw,
  );

  return signAndSend(ctx, ixs);
}
