import express, { Express, Request, Response, NextFunction } from "express";
import cors from "cors";
import { Server } from "http";
import { PublicKey } from "@solana/web3.js";
import { Context } from "@/context.js";
import { updateQuote } from "./switchboard.js";
import { withdrawIx } from "@/voidify/withdraw.js";
import { signAndSend } from "@/utils/tx.js";
import type { WithdrawRequestBody, WithdrawResponse } from "@/relayer/types.js";
import { relayerLogger as logger } from "@/utils/logger.js";

export interface RelayerServerConfig {
  port: number;
  host?: string;
  feedId: string;
}

export class RelayerHttpServer {
  private app: Express;
  private server: Server | null = null;
  private readonly host: string;
  private readonly port: number;
  private readonly feedId: string;

  constructor(
    private ctx: Context,
    config: RelayerServerConfig,
  ) {
    this.port = config.port;
    this.host = config.host || "0.0.0.0";
    this.feedId = config.feedId;
    this.app = express();

    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(cors());
    this.app.use(express.json());

    this.app.use((req: Request, _res: Response, next: NextFunction) => {
      logger.info({ method: req.method, path: req.path }, "HTTP request");
      next();
    });
  }

  private setupRoutes(): void {
    this.app.get("/health", this.handleHealth.bind(this));

    this.app.post("/api/relay/withdraw", this.handleWithdraw.bind(this));

    this.app.use((req: Request, res: Response) => {
      res.status(404).json({ error: "Not found" });
    });

    this.app.use(
      (err: Error, req: Request, res: Response, _next: NextFunction) => {
        logger.error(
          { err, method: req.method, path: req.path },
          "unhandled express error",
        );
        res.status(500).json({ error: "Internal server error" });
      },
    );
  }

  private async handleHealth(req: Request, res: Response): Promise<void> {
    res.json({
      status: "ok",
      timestamp: Date.now(),
      relayer: this.ctx.publicKey.toBase58(),
    });
  }

  private async handleWithdraw(req: Request, res: Response): Promise<void> {
    try {
      const body = req.body as WithdrawRequestBody;
      const validationError = this.validateWithdrawRequest(body);
      if (validationError) {
        res.status(400).json({
          success: false,
          error: validationError,
        } as WithdrawResponse);
        return;
      }

      const requestCtx = body.rpcUrl
        ? this.ctx.withRpcUrl(body.rpcUrl)
        : this.ctx;

      await updateQuote(requestCtx, this.feedId);
      const switchboardQuote = await this.getSwitchboardQuote(requestCtx);

      const ixs = await withdrawIx(
        requestCtx,
        new Uint8Array(body.proof),
        new Uint8Array(body.root),
        new Uint8Array(body.nullifierHash),
        body.recipient,
        requestCtx.publicKey.toBase58(),
        BigInt(body.fee),
        BigInt(body.treasury),
        switchboardQuote,
        BigInt(body.amount),
      );

      const signature = await signAndSend(requestCtx, ixs);
      logger.info({ signature }, "withdraw submitted");

      res.json({
        success: true,
        signature,
      } as WithdrawResponse);
    } catch (error: any) {
      let error_msg = error instanceof Error ? error.message : String(error);
      logger.error({ error_msg }, "Failed to withdraw");
      res.status(500).json({
        success: false,
        error: error_msg,
      } as WithdrawResponse);
    }
  }

  private validateWithdrawRequest(body: WithdrawRequestBody): string | null {
    if (
      !body.proof ||
      !Array.isArray(body.proof) ||
      body.proof.length !== 256
    ) {
      return "Invalid proof: must be an array of 256 bytes";
    }

    if (!body.root || !Array.isArray(body.root) || body.root.length !== 32) {
      return "Invalid root: must be an array of 32 bytes";
    }

    if (
      !body.nullifierHash ||
      !Array.isArray(body.nullifierHash) ||
      body.nullifierHash.length !== 32
    ) {
      return "Invalid nullifierHash: must be an array of 32 bytes";
    }

    if (!body.recipient || typeof body.recipient !== "string") {
      return "Invalid recipient: must be a string";
    }

    if (body.rpcUrl !== undefined) {
      if (typeof body.rpcUrl !== "string") {
        return "Invalid rpcUrl: must be a string";
      }
      if (body.rpcUrl.length > 2048) {
        return "Invalid rpcUrl: too long";
      }
      try {
        const parsed = new URL(body.rpcUrl);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          return "Invalid rpcUrl: must use http or https";
        }
      } catch {
        return "Invalid rpcUrl: not a valid URL";
      }
    }

    for (const field of ["fee", "treasury", "amount"] as const) {
      const value = body[field];
      if (value === undefined || value === null) {
        return `Missing ${field}`;
      }
      try {
        if (BigInt(value as any) < 0n) {
          return `Invalid ${field}: must be non-negative`;
        }
      } catch {
        return `Invalid ${field}: not a valid integer`;
      }
    }

    return null;
  }

  private async getSwitchboardQuote(ctx: Context): Promise<PublicKey> {
    const sb = await import("@switchboard-xyz/on-demand");
    const queue = await sb.Queue.loadDefault(
      await sb.AnchorUtils.loadProgramFromConnection(ctx.connection),
    );
    const [quotePDA] = sb.OracleQuote.getCanonicalPubkey(queue.pubkey, [
      this.feedId,
    ]);
    return quotePDA;
  }

  public getAddress(): string {
    return `http://${this.host}:${this.port}`;
  }

  public async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.port, this.host, (error?: Error) => {
        if (error) {
          reject(error);
        } else {
          logger.info({ address: this.getAddress() }, "HTTP server listening");
          resolve();
        }
      });
    });
  }

  public async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.server) {
        this.server.close((error?: Error) => {
          if (error) {
            reject(error);
          } else {
            logger.info("HTTP server stopped");
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }
}
