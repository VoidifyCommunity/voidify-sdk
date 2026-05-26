import { Command } from "commander";
import { startRelayer } from "@/relayer/server/index.js";
import { listRelayers } from "@/voidify/relayer/list.js";
import {
  createServiceContext,
  contextFromConfig,
  loadCliConfig,
  type GlobalOptions,
} from "@/cli/helpers.js";
import { createCliProgressBar } from "@/cli/progress.js";

export function registerRelayerCommands(program: Command): void {
  const relayerCommand = new Command("relayer")
    .enablePositionalOptions()
    .description("Relayer commands");

  relayerCommand
    .command("list [pubkey]")
    .description("List relayer information for a specific relayer")
    .option("-o, --output <file>", "Write output to a file")
    .action(async (pubkey: string, options) => {
      try {
        const ctx = await createServiceContext(program.opts<GlobalOptions>());
        const progress = createCliProgressBar("Sync relayers");
        const relayers = await (async () => {
          try {
            return await listRelayers(ctx, pubkey, {
              output: options.output,
              sync: { reporter: progress },
            });
          } finally {
            progress.finish();
          }
        })();
        console.log("Relayer records:", relayers);
      } catch (error) {
        console.error("List relayers failed:", error);
        process.exit(1);
      }
    });

  relayerCommand
    .command("start")
    .description("Start the relayer HTTP service")
    .option("--port <number>", "Service port")
    .option("--host <host>", "Service listen address")
    .action(async (options) => {
      try {
        const opts = program.opts<GlobalOptions>();
        const cfg = loadCliConfig(opts);
        if (!cfg.relayerServer) {
          throw new Error(
            "relayerServer is not configured. Set relayerServer to {port, host, feedId}, or rerun `voidify-cli config init --type relayer`.",
          );
        }
        const feedId = cfg.relayerServer.feedId;
        if (!feedId) {
          throw new Error(
            "relayerServer.feedId is not configured. Run `voidify-cli config set relayerServer.feedId <0x...>`.",
          );
        }

        const ctx = await contextFromConfig(cfg, opts.keypair);
        const port = options.port
          ? parseInt(options.port)
          : cfg.relayerServer.port;
        const host = options.host ?? cfg.relayerServer.host;

        await startRelayer(ctx, {
          port,
          host,
          feedId,
        });
      } catch (error) {
        console.error("Start relayer failed:", error);
        process.exit(1);
      }
    });

  program.addCommand(relayerCommand);
}
