#!/usr/bin/env node

import { Command } from "commander";
import { registerDepositCommands } from "@/cli/deposit.js";
import { registerNoteCommands } from "@/cli/note.js";
import { registerWithdrawCommands } from "@/cli/withdraw.js";
import { registerRelayerCommands } from "@/cli/relayer.js";
import { registerSubstreamCommands } from "@/cli/substream.js";
import { registerConfigCommand } from "@/cli/config/command.js";

const program = new Command();

program
  .enablePositionalOptions()
  .option("-k, --keypair <path>", "Specify the keypair file path")
  .option("--url <url>", "Specify the RPC URL")
  .option("-c, --config <path>", "Specify the client config file path")
  .description(
    "Command-line tool for interacting with the Anchor voidify program",
  );

registerDepositCommands(program);
registerNoteCommands(program);
registerWithdrawCommands(program);
registerConfigCommand(program);
registerRelayerCommands(program);
registerSubstreamCommands(program);

process.on("unhandledRejection", (reason) => {
  console.error(
    "Unhandled rejection:",
    reason instanceof Error ? reason.message : reason,
  );
  process.exitCode = 1;
});
process.on("uncaughtException", (err) => {
  console.error(
    "Uncaught exception:",
    err instanceof Error ? err.message : err,
  );
  process.exit(1);
});

program.parse();
