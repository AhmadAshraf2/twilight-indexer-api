import { MESSAGE_TYPES } from './types.js';

// ============================================
// Volt Module Message Interfaces
// ============================================

export interface MsgSignerApplication {
  '@type': typeof MESSAGE_TYPES.SIGNER_APPLICATION;
  fragmentId: string;
  applicationFee: string;
  feeBips: string;
  btcPubKey: string;
  signerAddress: string;
}

export interface MsgAcceptSigners {
  '@type': typeof MESSAGE_TYPES.ACCEPT_SIGNERS;
  fragmentId: string;
  signerApplicationIds: string[];
  judgeAddress: string;
}

// Union type for all volt messages
export type VoltMessage = MsgSignerApplication | MsgAcceptSigners;

// ============================================
// Volt Message Decoders
// ============================================

export function decodeSignerApplication(msg: MsgSignerApplication) {
  return {
    fragmentId: BigInt(msg.fragmentId || '0'),
    applicationFee: BigInt(msg.applicationFee || '0'),
    feeBips: parseInt(msg.feeBips || '0', 10),
    btcPubKey: msg.btcPubKey,
    signerAddress: msg.signerAddress,
  };
}

export function decodeAcceptSigners(msg: MsgAcceptSigners) {
  return {
    fragmentId: BigInt(msg.fragmentId || '0'),
    signerApplicationIds: (msg.signerApplicationIds || []).map((id) => BigInt(id)),
    judgeAddress: msg.judgeAddress,
  };
}

// Check if message is a volt message
export function isVoltMessage(msgType: string): boolean {
  return msgType.includes('.volt.');
}
