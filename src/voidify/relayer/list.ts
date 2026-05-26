import { Context } from "@/context.js";
import type { RelayerRecord } from "@/substream/types.js";
import type { ChainSyncOptions } from "@/substream/chain/index.js";
import { SubstreamCliClient } from "@/substream/client.js";

export async function listRelayers(
  ctx: Context,
  pubkey?: string,
  options?: {
    output?: string;
    sync?: ChainSyncOptions;
  },
): Promise<RelayerRecord[] | RelayerRecord | null> {
  const client = new SubstreamCliClient(ctx);
  await client.init();

  const relayerModule = client.module("relayer");
  await relayerModule.sync(options?.sync);

  const result = pubkey
    ? await relayerModule.get(pubkey)
    : await relayerModule.list();

  if (options?.output) {
    const fs = await import("fs/promises");
    const data = JSON.stringify(result, null, 2);
    await fs.writeFile(options.output, data, "utf-8");
  }

  return result;
}
