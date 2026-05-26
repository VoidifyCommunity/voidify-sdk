import { Context } from "@/context.js";
import {
  SubstreamService,
  SubstreamServiceOptions,
} from "@/substream/server/server.js";
import { substreamLogger as logger } from "@/utils/logger.js";

export async function startSubstream(
  ctx: Context,
  options: SubstreamServiceOptions,
): Promise<void> {
  process.on("unhandledRejection", (reason) => {
    logger.error({ reason }, "unhandledRejection");
  });
  process.on("uncaughtException", (err) => {
    logger.error({ err }, "uncaughtException");
    process.exit(1);
  });

  logger.info(
    {
      port: options.port,
      dbPath: options.dbPath,
    },
    "Starting Substream service",
  );

  const service = new SubstreamService(ctx, options);
  await service.start();

  const shutdown = async () => {
    logger.info("Received shutdown signal, stopping Substream service");
    try {
      await service.stop();
    } catch (err) {
      logger.error({ err }, "substream stop failed");
    }
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await new Promise(() => {});
}
