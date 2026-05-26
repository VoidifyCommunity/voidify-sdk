import { Command } from "commander";
import { withdraw } from "@/voidify/withdraw.js";
import { createServiceContext, type GlobalOptions } from "@/cli/helpers.js";
import { createCliProgressBar } from "@/cli/progress.js";

export function registerWithdrawCommands(program: Command): void {
  program
    .command("withdraw")
    .description("Withdraw through a relayer")
    .argument("<note>", "Note generated when depositing")
    .option("--recipient <pubkey>", "Recipient address")
    .option("--relayer <name>", "Relayer name")
    .option(
      "--send-rpc",
      "Send this client's RPC URL to the relayer for this withdraw request",
    )
    .action(async (note: string, options) => {
      try {
        const ctx = await createServiceContext(program.opts<GlobalOptions>());
        const depositProgress = createCliProgressBar("Sync deposits");
        const relayerProgress = createCliProgressBar("Sync relayers");
        const result = await (async () => {
          try {
            return await withdraw(
              ctx,
              note,
              options.recipient,
              options.relayer,
              {
                depositSync: { reporter: depositProgress },
                relayerSync: { reporter: relayerProgress },
              },
              options.sendRpc ?? false,
            );
          } finally {
            depositProgress.finish();
            relayerProgress.finish();
          }
        })();
        console.log("Withdraw successful:", { txSignature: result });
        process.exit(0);
      } catch (error) {
        console.error("Withdraw failed:", error);
        process.exit(1);
      }
    });
}
