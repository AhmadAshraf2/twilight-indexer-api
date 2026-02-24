import { MESSAGE_TYPES } from './types.js';

// ============================================
// Bridge Module Message Interfaces
// ============================================

export interface MsgConfirmBtcDeposit {
  '@type': typeof MESSAGE_TYPES.CONFIRM_BTC_DEPOSIT;
  reserveAddress: string;
  depositAmount: string;
  height: string;
  hash: string;
  twilightDepositAddress: string;
  oracleAddress: string;
}

export interface MsgRegisterBtcDepositAddress {
  '@type': typeof MESSAGE_TYPES.REGISTER_BTC_DEPOSIT_ADDRESS;
  btcDepositAddress: string;
  btcSatoshiTestAmount: string;
  twilightStakingAmount: string;
  twilightAddress: string;
}

export interface MsgRegisterReserveAddress {
  '@type': typeof MESSAGE_TYPES.REGISTER_RESERVE_ADDRESS;
  fragmentId: string;
  reserveScript: string;
  reserveAddress: string;
  judgeAddress: string;
}

export interface MsgBootstrapFragment {
  '@type': typeof MESSAGE_TYPES.BOOTSTRAP_FRAGMENT;
  judgeAddress: string;
  numOfSigners: string;
  threshold: string;
  signerApplicationFee: string;
  fragmentFeeBips: string;
  arbitraryData: string;
  validatorAddress: string;
}

export interface MsgWithdrawBtcRequest {
  '@type': typeof MESSAGE_TYPES.WITHDRAW_BTC_REQUEST;
  withdrawAddress: string;
  reserveId: string;
  withdrawAmount: string;
  twilightAddress: string;
}

export interface MsgSweepProposal {
  '@type': typeof MESSAGE_TYPES.SWEEP_PROPOSAL;
  reserveId: string;
  newReserveAddress: string;
  judgeAddress: string;
  BtcBlockNumber: string;
  btcRelayCapacityValue: string;
  btcTxHash: string;
  UnlockHeight: string;
  roundId: string;
  oracleAddress: string;
}

export interface MsgWithdrawTxSigned {
  '@type': typeof MESSAGE_TYPES.WITHDRAW_TX_SIGNED;
  creator: string;
  validatorAddress: string;
  btcTxSigned: string;
}

export interface MsgWithdrawTxFinal {
  '@type': typeof MESSAGE_TYPES.WITHDRAW_TX_FINAL;
  creator: string;
  judgeAddress: string;
  btcTx: string;
}

export interface MsgConfirmBtcWithdraw {
  '@type': typeof MESSAGE_TYPES.CONFIRM_BTC_WITHDRAW;
  txHash: string;
  height: string;
  hash: string;
  judgeAddress: string;
}

export interface MsgSignRefund {
  '@type': typeof MESSAGE_TYPES.SIGN_REFUND;
  reserveId: string;
  roundId: string;
  signerPublicKey: string;
  refundSignature: string[];
  signerAddress: string;
}

export interface MsgBroadcastTxSweep {
  '@type': typeof MESSAGE_TYPES.BROADCAST_TX_SWEEP;
  reserveId: string;
  roundId: string;
  signedSweepTx: string;
  judgeAddress: string;
}

export interface MsgSignSweep {
  '@type': typeof MESSAGE_TYPES.SIGN_SWEEP;
  reserveId: string;
  roundId: string;
  signerPublicKey: string;
  sweepSignature: string[];
  signerAddress: string;
}

export interface MsgProposeRefundHash {
  '@type': typeof MESSAGE_TYPES.PROPOSE_REFUND_HASH;
  refundHash: string;
  judgeAddress: string;
}

export interface MsgUnsignedTxSweep {
  '@type': typeof MESSAGE_TYPES.UNSIGNED_TX_SWEEP;
  txId: string;
  btcUnsignedSweepTx: string;
  reserveId: string;
  roundId: string;
  judgeAddress: string;
}

export interface MsgUnsignedTxRefund {
  '@type': typeof MESSAGE_TYPES.UNSIGNED_TX_REFUND;
  reserveId: string;
  roundId: string;
  btcUnsignedRefundTx: string;
  judgeAddress: string;
}

export interface MsgBroadcastTxRefund {
  '@type': typeof MESSAGE_TYPES.BROADCAST_TX_REFUND;
  reserveId: string;
  roundId: string;
  signedRefundTx: string;
  judgeAddress: string;
}

export interface MsgProposeSweepAddress {
  '@type': typeof MESSAGE_TYPES.PROPOSE_SWEEP_ADDRESS;
  btcAddress: string;
  btcScript: string;
  reserveId: string;
  roundId: string;
  judgeAddress: string;
}

// Union type for all bridge messages
export type BridgeMessage =
  | MsgConfirmBtcDeposit
  | MsgRegisterBtcDepositAddress
  | MsgRegisterReserveAddress
  | MsgBootstrapFragment
  | MsgWithdrawBtcRequest
  | MsgSweepProposal
  | MsgWithdrawTxSigned
  | MsgWithdrawTxFinal
  | MsgConfirmBtcWithdraw
  | MsgSignRefund
  | MsgBroadcastTxSweep
  | MsgSignSweep
  | MsgProposeRefundHash
  | MsgUnsignedTxSweep
  | MsgUnsignedTxRefund
  | MsgBroadcastTxRefund
  | MsgProposeSweepAddress;

// ============================================
// Bridge Message Decoders
// ============================================

export function decodeConfirmBtcDeposit(msg: MsgConfirmBtcDeposit) {
  return {
    reserveAddress: msg.reserveAddress,
    depositAmount: BigInt(msg.depositAmount || '0'),
    btcHeight: BigInt(msg.height || '0'),
    btcHash: msg.hash,
    twilightDepositAddress: msg.twilightDepositAddress,
    oracleAddress: msg.oracleAddress,
  };
}

export function decodeRegisterBtcDepositAddress(msg: MsgRegisterBtcDepositAddress) {
  return {
    btcDepositAddress: msg.btcDepositAddress,
    btcSatoshiTestAmount: BigInt(msg.btcSatoshiTestAmount || '0'),
    twilightStakingAmount: BigInt(msg.twilightStakingAmount || '0'),
    twilightAddress: msg.twilightAddress,
  };
}

export function decodeRegisterReserveAddress(msg: MsgRegisterReserveAddress) {
  return {
    fragmentId: BigInt(msg.fragmentId || '0'),
    reserveScript: msg.reserveScript,
    reserveAddress: msg.reserveAddress,
    judgeAddress: msg.judgeAddress,
  };
}

export function decodeBootstrapFragment(msg: MsgBootstrapFragment) {
  return {
    judgeAddress: msg.judgeAddress,
    numOfSigners: parseInt(msg.numOfSigners || '0', 10),
    threshold: parseInt(msg.threshold || '0', 10),
    signerApplicationFee: BigInt(msg.signerApplicationFee || '0'),
    fragmentFeeBips: parseInt(msg.fragmentFeeBips || '0', 10),
    arbitraryData: msg.arbitraryData,
    validatorAddress: msg.validatorAddress,
  };
}

export function decodeWithdrawBtcRequest(msg: MsgWithdrawBtcRequest) {
  return {
    withdrawAddress: msg.withdrawAddress,
    reserveId: BigInt(msg.reserveId || '0'),
    withdrawAmount: BigInt(msg.withdrawAmount || '0'),
    twilightAddress: msg.twilightAddress,
  };
}

export function decodeSweepProposal(msg: MsgSweepProposal) {
  return {
    reserveId: BigInt(msg.reserveId || '0'),
    newReserveAddress: msg.newReserveAddress,
    judgeAddress: msg.judgeAddress,
    btcBlockNumber: BigInt(msg.BtcBlockNumber || '0'),
    btcRelayCapacityValue: BigInt(msg.btcRelayCapacityValue || '0'),
    btcTxHash: msg.btcTxHash,
    unlockHeight: BigInt(msg.UnlockHeight || '0'),
    roundId: BigInt(msg.roundId || '0'),
    oracleAddress: msg.oracleAddress,
  };
}

export function decodeWithdrawTxSigned(msg: MsgWithdrawTxSigned) {
  return {
    creator: msg.creator,
    validatorAddress: msg.validatorAddress,
    btcTxSigned: msg.btcTxSigned,
  };
}

export function decodeWithdrawTxFinal(msg: MsgWithdrawTxFinal) {
  return {
    creator: msg.creator,
    judgeAddress: msg.judgeAddress,
    btcTx: msg.btcTx,
  };
}

export function decodeConfirmBtcWithdraw(msg: MsgConfirmBtcWithdraw) {
  return {
    btcTxHash: msg.txHash,
    btcHeight: BigInt(msg.height || '0'),
    btcHash: msg.hash,
    judgeAddress: msg.judgeAddress,
  };
}

export function decodeSignRefund(msg: MsgSignRefund) {
  return {
    reserveId: BigInt(msg.reserveId || '0'),
    roundId: BigInt(msg.roundId || '0'),
    signerPublicKey: msg.signerPublicKey,
    refundSignatures: msg.refundSignature || [],
    signerAddress: msg.signerAddress,
  };
}

export function decodeBroadcastTxSweep(msg: MsgBroadcastTxSweep) {
  return {
    reserveId: BigInt(msg.reserveId || '0'),
    roundId: BigInt(msg.roundId || '0'),
    signedSweepTx: msg.signedSweepTx,
    judgeAddress: msg.judgeAddress,
  };
}

export function decodeSignSweep(msg: MsgSignSweep) {
  return {
    reserveId: BigInt(msg.reserveId || '0'),
    roundId: BigInt(msg.roundId || '0'),
    signerPublicKey: msg.signerPublicKey,
    sweepSignatures: msg.sweepSignature || [],
    signerAddress: msg.signerAddress,
  };
}

export function decodeProposeRefundHash(msg: MsgProposeRefundHash) {
  return {
    refundHash: msg.refundHash,
    judgeAddress: msg.judgeAddress,
  };
}

export function decodeUnsignedTxSweep(msg: MsgUnsignedTxSweep) {
  return {
    txId: msg.txId,
    btcUnsignedSweepTx: msg.btcUnsignedSweepTx,
    reserveId: BigInt(msg.reserveId || '0'),
    roundId: BigInt(msg.roundId || '0'),
    judgeAddress: msg.judgeAddress,
  };
}

export function decodeUnsignedTxRefund(msg: MsgUnsignedTxRefund) {
  return {
    reserveId: BigInt(msg.reserveId || '0'),
    roundId: BigInt(msg.roundId || '0'),
    btcUnsignedRefundTx: msg.btcUnsignedRefundTx,
    judgeAddress: msg.judgeAddress,
  };
}

export function decodeBroadcastTxRefund(msg: MsgBroadcastTxRefund) {
  return {
    reserveId: BigInt(msg.reserveId || '0'),
    roundId: BigInt(msg.roundId || '0'),
    signedRefundTx: msg.signedRefundTx,
    judgeAddress: msg.judgeAddress,
  };
}

export function decodeProposeSweepAddress(msg: MsgProposeSweepAddress) {
  return {
    btcAddress: msg.btcAddress,
    btcScript: msg.btcScript,
    reserveId: BigInt(msg.reserveId || '0'),
    roundId: BigInt(msg.roundId || '0'),
    judgeAddress: msg.judgeAddress,
  };
}

// Check if message is a bridge message
export function isBridgeMessage(msgType: string): boolean {
  return msgType.includes('.bridge.');
}
