import { Context } from "@/context.js";
import { RelayerHttpServer } from "@/relayer/server/server.js";
import { relayerLogger as logger } from "@/utils/logger.js";

export async function startRelayer(
  ctx: Context,
  config: {
    port: number;
    host: string;
    feedId: string;
  },
): Promise<string> {
  process.on("unhandledRejection", (reason) => {
    logger.error({ reason }, "unhandledRejection");
  });
  process.on("uncaughtException", (err) => {
    logger.error({ err }, "uncaughtException");
    process.exit(1);
  });

  logger.info(
    {
      relayer: ctx.publicKey.toBase58(),
      host: config.host,
      port: config.port,
    },
    "Starting Relayer service",
  );

  const server = new RelayerHttpServer(ctx, config);
  await server.start();

  const shutdown = async (sig: string) => {
    logger.info({ sig }, "shutting down relayer");
    try {
      await server.stop();
    } catch (err) {
      logger.error({ err }, "relayer stop failed");
    }
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await new Promise(() => {});
  return `http://${config.host}:${config.port}`;
}
