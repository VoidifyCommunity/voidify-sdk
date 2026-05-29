import type { IdlEvents } from "@coral-xyz/anchor";
import type { Voidify } from "@/idl/voidify/idl.js";

export type VoidifyEventMap = IdlEvents<Voidify>;
export type VoidifyEventName = keyof VoidifyEventMap;

export type DepositEvent = VoidifyEventMap["depositEvent"];

export type WithdrawalEvent = VoidifyEventMap["withdrawalEvent"];

export type DirectWithdrawalEvent = VoidifyEventMap["directWithdrawalEvent"];

export type RelayerRegisteredEvent = VoidifyEventMap["relayerRegisteredEvent"];
export type RelayerRegisteredV2Event =
  VoidifyEventMap["relayerRegisteredV2Event"];
export type RelayerUnregisteredEvent =
  VoidifyEventMap["relayerUnregisteredEvent"];
export type RelayerDeactivatedEvent =
  VoidifyEventMap["relayerDeactivatedEvent"];
export type RelayerSlashedEvent = VoidifyEventMap["relayerSlashedEvent"];

export type RelayerUpdatedEvent = VoidifyEventMap["relayerUpdatedEvent"];

export type RelayerActivatedEvent = VoidifyEventMap["relayerActivatedEvent"];
