import { Command } from "commander";
import { startSubstream } from "@/substream/server/index.js";
import {
  contextFromConfig,
  expandHome,
  loadCliConfig,
  type GlobalOptions,
} from "@/cli/helpers.js";

export function registerSubstreamCommands(program: Command): void {
  program
    .command("substream")
    .description("Start the Substream service")
    .option("--port <number>", "Service port")
    .option("--host <host>", "Service listen address")
    .option("--db <path>", "Database path")
    .action(async (options) => {
      try {
        const opts = program.opts<GlobalOptions>();
        const cfg = loadCliConfig(opts);
        if (!cfg.substreamServer) {
          throw new Error(
            "substreamServer is not configured. Set substreamServer to {port, host, dbPath}, or rerun `voidify-cli config init --type substream`.",
          );
        }
        const dbPath = options.db ?? cfg.substreamServer.dbPath;
        if (!dbPath) {
          throw new Error(
            "substreamServer.dbPath is not configured, and --db was not provided. Choose one of them.",
          );
        }
        const ctx = await contextFromConfig(cfg, opts.keypair);
        await startSubstream(ctx, {
          port: options.port
            ? parseInt(options.port)
            : cfg.substreamServer.port,
          host: options.host ?? cfg.substreamServer.host,
          dbPath: expandHome(dbPath),
        });
      } catch (error) {
        console.error("Substream service failed:", error);
        process.exit(1);
      }
    });
}
