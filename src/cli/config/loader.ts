import Conf from "conf";
import fs from "node:fs";
import path from "node:path";
import { defaultUserConfigDir, defaults, type VoidifyConfig } from "./types.js";

export function defaultUserConfigPath(): string {
  return path.join(defaultUserConfigDir(), "config.json");
}

const OPTIONAL_KEYS = [
  "keypair",
  "keypair.type",
  "keypair.path",
  "keypair.key",
  "substream",
  "substream.type",
  "substream.url",
  "substream.dbPath",
];

function collectPaths(obj: unknown, prefix = ""): string[] {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) return [];
  const paths: string[] = [];
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const next = prefix ? `${prefix}.${k}` : k;
    paths.push(next);
    paths.push(...collectPaths(v, next));
  }
  return paths;
}

const VALID_KEYS = new Set<string>([
  ...collectPaths(defaults),
  ...OPTIONAL_KEYS,
]);

export function isValidConfigKey(key: string): boolean {
  return VALID_KEYS.has(key);
}

export interface LoadOptions {
  configPath: string;
  rpcUrl?: string;
}

function buildStore(configPath: string): Conf<VoidifyConfig> {
  const resolved = path.resolve(configPath);
  return new Conf<VoidifyConfig>({
    projectName: "voidify",
    cwd: path.dirname(resolved),
    configName: path.basename(resolved, path.extname(resolved)),
  });
}

export function getStore(configPath: string): Conf<VoidifyConfig> {
  const resolved = path.resolve(configPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(
      `Config file does not exist: ${resolved}. Run \`voidify config init [--type ...]\` first to generate a template.`,
    );
  }
  return buildStore(configPath);
}

export function getStorePath(configPath: string): string {
  return path.resolve(configPath);
}

export function loadConfig(opts: LoadOptions): VoidifyConfig {
  const resolved = path.resolve(opts.configPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(
      `Config file does not exist: ${resolved}. Run \`voidify config init [--type ...]\` first to generate a template.`,
    );
  }

  const store = buildStore(opts.configPath);
  const cfg = { ...store.store } as VoidifyConfig;

  if (opts.rpcUrl) cfg.rpcUrl = opts.rpcUrl;

  return cfg;
}
