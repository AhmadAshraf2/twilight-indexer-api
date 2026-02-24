import { MESSAGE_TYPES, MESSAGE_TYPE_NAMES, getModuleFromType, BaseMessage, DecodedMessage } from './types.js';
import {
  isBridgeMessage,
  decodeConfirmBtcDeposit,
  decodeRegisterBtcDepositAddress,
  decodeRegisterReserveAddress,
  decodeBootstrapFragment,
  decodeWithdrawBtcRequest,
  decodeSweepProposal,
  decodeWithdrawTxSigned,
  decodeWithdrawTxFinal,
  decodeConfirmBtcWithdraw,
  decodeSignRefund,
  decodeBroadcastTxSweep,
  decodeSignSweep,
  decodeProposeRefundHash,
  decodeUnsignedTxSweep,
  decodeUnsignedTxRefund,
  decodeBroadcastTxRefund,
  decodeProposeSweepAddress,
} from './bridge.js';
import { isForksMessage, decodeSetDelegateAddresses, decodeSeenBtcChainTip } from './forks.js';
import { isVoltMessage, decodeSignerApplication, decodeAcceptSigners } from './volt.js';
import { isZkosMessage, decodeTransferTx, decodeMintBurnTradingBtc, decodeZkosTransactionFromApi } from './zkos.js';
import { logger } from '../logger.js';

// Re-export types and message constants
export { MESSAGE_TYPES, MESSAGE_TYPE_NAMES, getModuleFromType };
export type { BaseMessage, DecodedMessage };

// Re-export module-specific types and functions
export * from './bridge.js';
export * from './forks.js';
export * from './volt.js';
export * from './zkos.js';

/**
 * Decode a Cosmos SDK message based on its @type field
 */
export function decodeMessage(msg: BaseMessage): DecodedMessage {
  const msgType = msg['@type'];
  const typeName = MESSAGE_TYPE_NAMES[msgType] || msgType.split('.').pop() || 'Unknown';
  const module = getModuleFromType(msgType);

  let data: Record<string, unknown> = {};

  try {
    // Bridge Module Messages
    if (isBridgeMessage(msgType)) {
      switch (msgType) {
        case MESSAGE_TYPES.CONFIRM_BTC_DEPOSIT:
          data = decodeConfirmBtcDeposit(msg as any);
          break;
        case MESSAGE_TYPES.REGISTER_BTC_DEPOSIT_ADDRESS:
          data = decodeRegisterBtcDepositAddress(msg as any);
          break;
        case MESSAGE_TYPES.REGISTER_RESERVE_ADDRESS:
          data = decodeRegisterReserveAddress(msg as any);
          break;
        case MESSAGE_TYPES.BOOTSTRAP_FRAGMENT:
          data = decodeBootstrapFragment(msg as any);
          break;
        case MESSAGE_TYPES.WITHDRAW_BTC_REQUEST:
          data = decodeWithdrawBtcRequest(msg as any);
          break;
        case MESSAGE_TYPES.SWEEP_PROPOSAL:
          data = decodeSweepProposal(msg as any);
          break;
        case MESSAGE_TYPES.WITHDRAW_TX_SIGNED:
          data = decodeWithdrawTxSigned(msg as any);
          break;
        case MESSAGE_TYPES.WITHDRAW_TX_FINAL:
          data = decodeWithdrawTxFinal(msg as any);
          break;
        case MESSAGE_TYPES.CONFIRM_BTC_WITHDRAW:
          data = decodeConfirmBtcWithdraw(msg as any);
          break;
        case MESSAGE_TYPES.SIGN_REFUND:
          data = decodeSignRefund(msg as any);
          break;
        case MESSAGE_TYPES.BROADCAST_TX_SWEEP:
          data = decodeBroadcastTxSweep(msg as any);
          break;
        case MESSAGE_TYPES.SIGN_SWEEP:
          data = decodeSignSweep(msg as any);
          break;
        case MESSAGE_TYPES.PROPOSE_REFUND_HASH:
          data = decodeProposeRefundHash(msg as any);
          break;
        case MESSAGE_TYPES.UNSIGNED_TX_SWEEP:
          data = decodeUnsignedTxSweep(msg as any);
          break;
        case MESSAGE_TYPES.UNSIGNED_TX_REFUND:
          data = decodeUnsignedTxRefund(msg as any);
          break;
        case MESSAGE_TYPES.BROADCAST_TX_REFUND:
          data = decodeBroadcastTxRefund(msg as any);
          break;
        case MESSAGE_TYPES.PROPOSE_SWEEP_ADDRESS:
          data = decodeProposeSweepAddress(msg as any);
          break;
        default:
          data = { ...msg };
          delete (data as any)['@type'];
      }
    }
    // Forks Module Messages
    else if (isForksMessage(msgType)) {
      switch (msgType) {
        case MESSAGE_TYPES.SET_DELEGATE_ADDRESSES:
          data = decodeSetDelegateAddresses(msg as any);
          break;
        case MESSAGE_TYPES.SEEN_BTC_CHAIN_TIP:
          data = decodeSeenBtcChainTip(msg as any);
          break;
        default:
          data = { ...msg };
          delete (data as any)['@type'];
      }
    }
    // Volt Module Messages
    else if (isVoltMessage(msgType)) {
      switch (msgType) {
        case MESSAGE_TYPES.SIGNER_APPLICATION:
          data = decodeSignerApplication(msg as any);
          break;
        case MESSAGE_TYPES.ACCEPT_SIGNERS:
          data = decodeAcceptSigners(msg as any);
          break;
        default:
          data = { ...msg };
          delete (data as any)['@type'];
      }
    }
    // zkOS Module Messages
    else if (isZkosMessage(msgType)) {
      switch (msgType) {
        case MESSAGE_TYPES.TRANSFER_TX:
          data = decodeTransferTx(msg as any);
          break;
        case MESSAGE_TYPES.MINT_BURN_TRADING_BTC:
          data = decodeMintBurnTradingBtc(msg as any);
          break;
        default:
          data = { ...msg };
          delete (data as any)['@type'];
      }
    }
    // Unknown message type - pass through
    else {
      data = { ...msg };
      delete (data as any)['@type'];
    }
  } catch (error) {
    logger.error({ msgType, error }, 'Failed to decode message');
    data = { ...msg };
    delete (data as any)['@type'];
  }

  return {
    type: msgType,
    typeName,
    module,
    data,
    raw: msg,
  };
}

/**
 * Get a human-readable name for a message type
 */
export function getMessageTypeName(msgType: string): string {
  // Try to get from our known types
  if (MESSAGE_TYPE_NAMES[msgType]) {
    return MESSAGE_TYPE_NAMES[msgType];
  }

  // Extract the last part of the type URL
  const parts = msgType.split('.');
  const name = parts[parts.length - 1];

  // Remove 'Msg' prefix if present
  return name.replace(/^Msg/, '');
}

/**
 * Format message type for display
 */
export function formatMessageType(msgType: string): string {
  const name = getMessageTypeName(msgType);
  // Convert camelCase/PascalCase to Title Case with spaces
  return name
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

/**
 * Get all known Twilight message types
 */
export function getAllMessageTypes(): string[] {
  return Object.values(MESSAGE_TYPES);
}

/**
 * Check if a message type is a Twilight custom type
 */
export function isTwilightMessage(msgType: string): boolean {
  return msgType.includes('twilightproject.nyks');
}

/**
 * Serialize BigInt values in decoded data for JSON storage
 */
export function serializeDecodedData(data: Record<string, unknown>): Record<string, unknown> {
  const serialized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'bigint') {
      serialized[key] = value.toString();
    } else if (Array.isArray(value)) {
      serialized[key] = value.map((v) => (typeof v === 'bigint' ? v.toString() : v));
    } else if (value !== null && typeof value === 'object') {
      serialized[key] = serializeDecodedData(value as Record<string, unknown>);
    } else {
      serialized[key] = value;
    }
  }

  return serialized;
}
