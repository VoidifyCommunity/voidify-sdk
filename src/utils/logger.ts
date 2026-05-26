import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:yyyy-mm-dd HH:MM:ss.l",
            ignore: "pid,hostname",
          },
        },
      }),
});

export const substreamLogger = logger.child({ module: "substream" });
export const relayerLogger = logger.child({ module: "relayer" });
