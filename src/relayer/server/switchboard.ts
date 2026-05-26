import * as sb from "@switchboard-xyz/on-demand";
import { CrossbarClient } from "@switchboard-xyz/common";
import { Context } from "@/context.js";
import { PublicKey } from "@solana/web3.js";
import { signAndSend } from "@/utils/tx.js";
import { VoidifyProgram } from "@/voidify/program.js";
import { relayerLogger as logger } from "@/utils/logger.js";

async function getQuoteSlot(
  ctx: Context,
  quotePDA: PublicKey,
): Promise<number> {
  const SWITCHBOARD_QUOTE_ACCOUNT_PAYLOAD_OFFSET = 42;
  const SWITCHBOARD_QUOTE_TAIL_DISCRIMINATOR = "SBOD";
  try {
    const account = await ctx.connection.getAccountInfo(quotePDA, "confirmed");
    if (!account) return 0;

    const quote = sb.OracleQuote.decode(
      Buffer.from(account.data).subarray(
        SWITCHBOARD_QUOTE_ACCOUNT_PAYLOAD_OFFSET,
      ),
    );

    if (quote.tailDiscriminator !== SWITCHBOARD_QUOTE_TAIL_DISCRIMINATOR) {
      throw new Error(
        `Invalid Switchboard quote discriminator: ${quote.tailDiscriminator}`,
      );
    }

    return quote.slot;
  } catch (error) {
    throw new Error("Failed to fetch quote slot from chain", {
      cause: error,
    });
  }
}

export async function updateQuote(ctx: Context, feedID: string): Promise<void> {
  const voidifyProgram = new VoidifyProgram(ctx.connection, ctx.programId);
  const oracleConfig = await voidifyProgram.program.account.oracleConfig.fetch(
    voidifyProgram.oracleConfig(),
  );
  const maxPriceAgeSlots =
    (BigInt(oracleConfig.maxPriceAgeSecs.toString()) * 5n) / 2n;

  const queue = await sb.Queue.loadDefault(
    await sb.AnchorUtils.loadProgramFromConnection(ctx.connection),
  );
  const crossbar = CrossbarClient.default();
  const currentSlot = await ctx.connection.getSlot("confirmed");
  const [quotePDA] = sb.OracleQuote.getCanonicalPubkey(queue.pubkey, [feedID]);
  const quoteSlot = await getQuoteSlot(ctx, quotePDA);
  const currentAgeSlots = BigInt(currentSlot - quoteSlot);

  if (currentAgeSlots >= maxPriceAgeSlots) {
    logger.info(
      { currentAgeSlots, maxPriceAgeSlots },
      "Updating switchboard oracle",
    );
    const ixs = await queue.fetchManagedUpdateIxs(crossbar, [feedID], {
      variableOverrides: {},
      instructionIdx: 0,
      payer: ctx.publicKey,
    });

    const tx = await sb.asV0Tx({
      connection: ctx.connection,
      ixs: ixs,
      payer: ctx.publicKey,
      computeUnitPrice: 20_000,
      computeUnitLimitMultiple: 1.1,
    });

    await signAndSend(ctx, tx);
  }
}
