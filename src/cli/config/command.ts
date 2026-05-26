import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import {
  defaultUserConfigPath,
  getStore,
  getStorePath,
  isValidConfigKey,
} from "./loader.js";
import { buildTemplate, postInitHint, type InitType } from "./init.js";

interface GlobalOpts {
  config?: string;
}

function requireConfigPath(cmd: Command): string {
  const root = cmd.parent?.parent ?? cmd.parent ?? cmd;
  const cfgPath = (root.opts() as GlobalOpts).config;
  return cfgPath ?? defaultUserConfigPath();
}

const VALID_INIT_TYPES: readonly InitType[] = [
  "default",
  "relayer",
  "substream",
  "full",
];

function parseInitType(raw: string): InitType {
  if ((VALID_INIT_TYPES as readonly string[]).includes(raw)) {
    return raw as InitType;
  }
  console.error(
    `Unknown --type: ${raw}. Available values: ${VALID_INIT_TYPES.join(", ")}`,
  );
  process.exit(1);
}

function resolveInitPath(cmd: Command, initPath: string | undefined): string {
  if (initPath) return initPath;
  const root = cmd.parent?.parent ?? cmd.parent ?? cmd;
  const fromGlobal = (root.opts() as GlobalOpts).config;
  if (fromGlobal) return fromGlobal;
  return defaultUserConfigPath();
}

export function registerConfigCommand(program: Command): void {
  const configCommand = new Command("config")
    .enablePositionalOptions()
    .description(
      "Client config file management; does not affect on-chain program state",
    );

  configCommand
    .command("path")
    .description("Print the config file path; requires -c <path>")
    .action(function (this: Command) {
      console.log(getStorePath(requireConfigPath(this)));
    });

  configCommand
    .command("init")
    .description(
      "Write the initial config only if the file does not exist. --type selects the template and default filename; --path or global -c overrides the location.",
    )
    .option(
      "-t, --type <type>",
      `Template type: ${VALID_INIT_TYPES.join(" | ")}`,
      "default",
    )
    .option(
      "--path <path>",
      "Config file path; defaults to ~/.config/voidify/config.json, or %APPDATA%\\voidify\\config.json on Windows; can also be specified with global -c",
    )
    .action(function (this: Command, opts: { type: string; path?: string }) {
      const type = parseInitType(opts.type);
      const filePath = getStorePath(resolveInitPath(this, opts.path));

      if (fs.existsSync(filePath)) {
        console.log(`Config file already exists: ${filePath}`);
        return;
      }

      const template = buildTemplate(type);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(template, null, 2) + "\n");

      console.log(`Wrote [${type}] template: ${filePath}`);
      console.log("");
      console.log(postInitHint(type));
    });

  configCommand
    .command("get <key>")
    .description(
      "Read one config item; supports dot notation such as substream.url",
    )
    .action(function (this: Command, key: string) {
      const store = getStore(requireConfigPath(this));
      const value = store.get(key as never);
      console.log(JSON.stringify(value, null, 2));
    });

  configCommand
    .command("set <key> <value>")
    .description(
      "Set one config item; supports dot notation, and falls back to string when JSON parsing fails",
    )
    .action(function (this: Command, key: string, raw: string) {
      if (!isValidConfigKey(key)) {
        console.error(`Unknown config key: ${key}`);
        process.exit(1);
      }
      const store = getStore(requireConfigPath(this));
      let value: unknown;
      try {
        value = JSON.parse(raw);
      } catch {
        value = raw;
      }
      store.set(key as never, value as never);
      console.log(`Wrote: ${key} = ${JSON.stringify(value)}`);
      console.log(`File: ${store.path}`);
    });

  program.addCommand(configCommand);
}
