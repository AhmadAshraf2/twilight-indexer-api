import { MESSAGE_TYPES } from './types.js';

// ============================================
// Forks Module Message Interfaces
// ============================================

export interface MsgSetDelegateAddresses {
  '@type': typeof MESSAGE_TYPES.SET_DELEGATE_ADDRESSES;
  validatorAddress: string;
  btcOracleAddress: string;
  btcPublicKey: string;
  zkOracleAddress?: string;
}

export interface MsgSeenBtcChainTip {
  '@type': typeof MESSAGE_TYPES.SEEN_BTC_CHAIN_TIP;
  height: string;
  hash: string;
  btcOracleAddress: string;
}

// Union type for all forks messages
export type ForksMessage = MsgSetDelegateAddresses | MsgSeenBtcChainTip;

// ============================================
// Forks Message Decoders
// ============================================

export function decodeSetDelegateAddresses(msg: MsgSetDelegateAddresses) {
  return {
    validatorAddress: msg.validatorAddress,
    btcOracleAddress: msg.btcOracleAddress,
    btcPublicKey: msg.btcPublicKey,
    zkOracleAddress: msg.zkOracleAddress || null,
  };
}

export function decodeSeenBtcChainTip(msg: MsgSeenBtcChainTip) {
  return {
    btcHeight: BigInt(msg.height || '0'),
    btcHash: msg.hash,
    btcOracleAddress: msg.btcOracleAddress,
  };
}

// Check if message is a forks message
export function isForksMessage(msgType: string): boolean {
  return msgType.includes('.forks.');
}
