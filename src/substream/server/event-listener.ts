import { Program } from "@coral-xyz/anchor";
import type { Voidify } from "@/idl/voidify/idl.js";
import { substreamLogger as logger } from "@/utils/logger.js";

export type EventCallback<T = any> = (
  event: T,
  signature: string,
  slot: number,
) => Promise<void>;

export class EventListener {
  private handlers: Map<string, EventCallback[]> = new Map();
  private anchorListeners: Map<number, string> = new Map();
  private nextListenerId = 1;

  constructor(private program: Program<Voidify>) {}

  registerHandler<T = any>(
    eventName: string,
    handler: EventCallback<T>,
  ): number {
    const listenerId = this.nextListenerId++;
    if (!this.handlers.has(eventName)) {
      this.handlers.set(eventName, []);
    }
    this.handlers.get(eventName)!.push(handler as EventCallback);
    if (!this.hasAnchorListener(eventName)) {
      this.createAnchorListener(eventName);
    }
    return listenerId;
  }

  unregisterHandler(_listenerId: number): void {}

  unregisterEvent(eventName: string): void {
    this.handlers.delete(eventName);
    for (const [anchorId, name] of this.anchorListeners.entries()) {
      if (name === eventName) {
        this.program.removeEventListener(anchorId);
        this.anchorListeners.delete(anchorId);
        break;
      }
    }
  }

  removeAllListeners(): void {
    for (const anchorId of this.anchorListeners.keys()) {
      this.program.removeEventListener(anchorId);
    }
    this.anchorListeners.clear();
    this.handlers.clear();
  }

  getListenerCount(): number {
    return this.anchorListeners.size;
  }

  getRegisteredEvents(): string[] {
    return Array.from(this.handlers.keys());
  }

  private hasAnchorListener(eventName: string): boolean {
    for (const [, name] of this.anchorListeners.entries()) {
      if (name === eventName) {
        return true;
      }
    }
    return false;
  }

  private createAnchorListener(eventName: string): void {
    const anchorListenerId = this.program.addEventListener(
      eventName as any,
      async (event: any, slot: number, signature: string) => {
        logger.info({ eventName, slot, signature }, "event received");
        try {
          const handlers = this.handlers.get(eventName);
          if (handlers && handlers.length > 0) {
            await Promise.all(
              handlers.map((handler) => handler(event, signature, slot)),
            );
          }
        } catch (error) {
          logger.error(
            { err: error, eventName, slot, signature },
            "event handler failed",
          );
        }
      },
    );

    this.anchorListeners.set(anchorListenerId, eventName);
  }
}
