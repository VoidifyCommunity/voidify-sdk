import express, { Express, NextFunction, Request, Response } from "express";
import cors from "cors";
import { Server } from "http";
import Database from "better-sqlite3";
import { Program } from "@coral-xyz/anchor";
import type { Voidify } from "@/idl/voidify/idl.js";
import { Context } from "@/context.js";
import {
  SQLiteEventStore,
  SQLiteProjectionStore,
} from "@/substream/database/sqlite.js";
import { EventListener } from "./event-listener.js";
import { chainEventToWire } from "@/substream/chain/events.js";
import type { EventCursor, EventScope, SyncStatus } from "@/substream/types.js";
import {
  createSubstreamRuntime,
  type SubstreamRuntime,
} from "@/substream/runtime.js";
import { substreamLogger as logger } from "@/utils/logger.js";

export interface HttpServerConfig {
  port: number;
  host?: string;
}

export interface SubstreamServiceOptions {
  port: number;
  host?: string;
  dbPath: string;
}

export class HttpServer {
  private app: Express;
  private server: Server | null = null;
  private readonly host: string;
  private readonly port: number;

  constructor(
    private runtime: SubstreamRuntime,
    config: HttpServerConfig,
  ) {
    this.port = config.port;
    this.host = config.host || "0.0.0.0";
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
    this.app.get(
      "/api/events/:scopeType/:scopeKey",
      this.handleGetEvents.bind(this),
    );
    this.app.get(
      "/api/sync/:scopeType/:scopeKey/status",
      this.handleGetSyncStatus.bind(this),
    );

    this.app.use((_req: Request, res: Response) => {
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

  private async handleHealth(_req: Request, res: Response): Promise<void> {
    res.json({
      status: "ok",
      timestamp: Date.now(),
    });
  }

  private async handleGetEvents(req: Request, res: Response): Promise<void> {
    try {
      const scope = this.parseScope(req, res);
      if (!scope) return;

      const afterIndex = this.parseAfterIndex(req, res);
      if (afterIndex === false) return;

      const syncMode = req.query.sync;
      const syncStatus =
        syncMode === "skip"
          ? this.runtime.getSyncStatus(scope, "local")
          : syncMode === "background"
            ? this.runtime.syncLocalInBackground(scope)
            : await this.syncAndGetStatus(scope);

      const events = await this.runtime.events.getAfter(
        scope,
        afterIndex === null ? undefined : afterIndex,
      );
      const cursor = await this.runtime.events.getCursor(scope);

      res.json({
        events: events.map(chainEventToWire),
        total: events.length,
        cursor: cursorToWire(cursor),
        syncStatus: syncStatusToWire(syncStatus),
      });
    } catch (error) {
      logger.error(
        { err: error, params: req.params },
        "fetch chain events failed",
      );
      res.status(500).json({ error: "Failed to fetch events" });
    }
  }

  private async handleGetSyncStatus(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const scope = this.parseScope(req, res);
      if (!scope) return;
      res.json(syncStatusToWire(this.runtime.getSyncStatus(scope, "local")));
    } catch (error) {
      logger.error(
        { err: error, params: req.params },
        "fetch sync status failed",
      );
      res.status(500).json({ error: "Failed to fetch sync status" });
    }
  }

  private async syncAndGetStatus(scope: EventScope): Promise<SyncStatus> {
    await this.runtime.syncLocal(scope);
    return this.runtime.getSyncStatus(scope, "local");
  }

  private parseScope(req: Request, res: Response): EventScope | null {
    const scopeType = String(req.params.scopeType);
    const scopeKey = String(req.params.scopeKey);
    const scope = this.runtime.registry.parseScope(scopeType, scopeKey);
    if (!scope) {
      res.status(400).json({ error: "Invalid scopeType parameter" });
      return null;
    }
    return scope;
  }

  private parseAfterIndex(req: Request, res: Response): bigint | null | false {
    const raw = req.query.after_index;
    if (raw === undefined) return null;
    if (Array.isArray(raw)) {
      res.status(400).json({ error: "Invalid after_index parameter" });
      return false;
    }
    try {
      return BigInt(String(raw));
    } catch {
      res.status(400).json({ error: "Invalid after_index parameter" });
      return false;
    }
  }

  async start(): Promise<void> {
    await this.runtime.initialize();
    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(this.port, this.host, () => {
          logger.info({ address: this.getAddress() }, "HTTP server listening");
          resolve();
        });

        this.server.on("error", (error) => {
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }

      this.server.close((error) => {
        if (error) {
          reject(error);
        } else {
          logger.info("HTTP server stopped");
          this.server = null;
          resolve();
        }
      });
    });
  }

  getAddress(): string {
    return `http://${this.host}:${this.port}`;
  }
}

function cursorToWire(cursor: EventCursor | null) {
  return cursor
    ? {
        scopeType: cursor.scopeType,
        scopeKey: cursor.scopeKey,
        lastIndex:
          cursor.lastIndex === null ? null : cursor.lastIndex.toString(),
        lastSignature: cursor.lastSignature,
        lastSyncAt: cursor.lastSyncAt,
      }
    : null;
}

function syncStatusToWire(status: SyncStatus) {
  return {
    ...status,
    cursor: cursorToWire(status.cursor),
  };
}

export class SubstreamService {
  private database: Database.Database;
  private eventListener: EventListener;
  private httpServer: HttpServer;
  private program: Program<Voidify>;
  private runtime: SubstreamRuntime;
  private isRunning = false;

  constructor(
    private ctx: Context,
    private options: SubstreamServiceOptions,
  ) {
    this.database = new Database(options.dbPath);

    const stores = {
      events: new SQLiteEventStore(this.database),
      projections: new SQLiteProjectionStore(this.database),
    };
    this.runtime = createSubstreamRuntime(ctx, stores, { mode: "local" });
    this.program = this.runtime.voidify.program;
    this.eventListener = new EventListener(this.program);
    this.httpServer = new HttpServer(this.runtime, {
      port: options.port,
      host: options.host,
    });
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error("Service is already running");
    }

    try {
      logger.info({ dbPath: this.options.dbPath }, "initializing database");
      await this.runtime.initialize();

      logger.info("starting event listeners");
      await this.startEventListeners();

      await this.httpServer.start();

      this.isRunning = true;
      logger.info("service ready");
    } catch (error) {
      await this.cleanup();
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    await this.cleanup();
    this.isRunning = false;
    logger.info("service stopped");
  }

  private async startEventListeners(): Promise<void> {
    for (const liveEvent of this.runtime.registry.liveEvents()) {
      this.eventListener.registerHandler(
        liveEvent.eventName,
        async (event, signature, slot) => {
          const record = await liveEvent.toRecord({
            ctx: this.ctx,
            voidify: this.runtime.voidify,
            event,
            signature,
            slot,
          });
          await this.runtime.applyLiveRecord(record, record);
        },
      );
    }
  }

  private async cleanup(): Promise<void> {
    try {
      this.eventListener.removeAllListeners();
      await this.httpServer.stop();
      this.database.close();
    } catch (error) {
      logger.error({ err: error }, "cleanup error");
    }
  }
}
