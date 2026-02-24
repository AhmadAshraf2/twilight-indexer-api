// Message type constants for Twilight chain
export const MESSAGE_TYPES = {
  // Bridge Module (17 types)
  CONFIRM_BTC_DEPOSIT: '/twilightproject.nyks.bridge.MsgConfirmBtcDeposit',
  REGISTER_BTC_DEPOSIT_ADDRESS: '/twilightproject.nyks.bridge.MsgRegisterBtcDepositAddress',
  REGISTER_RESERVE_ADDRESS: '/twilightproject.nyks.bridge.MsgRegisterReserveAddress',
  BOOTSTRAP_FRAGMENT: '/twilightproject.nyks.bridge.MsgBootstrapFragment',
  WITHDRAW_BTC_REQUEST: '/twilightproject.nyks.bridge.MsgWithdrawBtcRequest',
  SWEEP_PROPOSAL: '/twilightproject.nyks.bridge.MsgSweepProposal',
  WITHDRAW_TX_SIGNED: '/twilightproject.nyks.bridge.MsgWithdrawTxSigned',
  WITHDRAW_TX_FINAL: '/twilightproject.nyks.bridge.MsgWithdrawTxFinal',
  CONFIRM_BTC_WITHDRAW: '/twilightproject.nyks.bridge.MsgConfirmBtcWithdraw',
  SIGN_REFUND: '/twilightproject.nyks.bridge.MsgSignRefund',
  BROADCAST_TX_SWEEP: '/twilightproject.nyks.bridge.MsgBroadcastTxSweep',
  SIGN_SWEEP: '/twilightproject.nyks.bridge.MsgSignSweep',
  PROPOSE_REFUND_HASH: '/twilightproject.nyks.bridge.MsgProposeRefundHash',
  UNSIGNED_TX_SWEEP: '/twilightproject.nyks.bridge.MsgUnsignedTxSweep',
  UNSIGNED_TX_REFUND: '/twilightproject.nyks.bridge.MsgUnsignedTxRefund',
  BROADCAST_TX_REFUND: '/twilightproject.nyks.bridge.MsgBroadcastTxRefund',
  PROPOSE_SWEEP_ADDRESS: '/twilightproject.nyks.bridge.MsgProposeSweepAddress',

  // Forks Module (2 types)
  SET_DELEGATE_ADDRESSES: '/twilightproject.nyks.forks.MsgSetDelegateAddresses',
  SEEN_BTC_CHAIN_TIP: '/twilightproject.nyks.forks.MsgSeenBtcChainTip',

  // Volt Module (2 types)
  SIGNER_APPLICATION: '/twilightproject.nyks.volt.MsgSignerApplication',
  ACCEPT_SIGNERS: '/twilightproject.nyks.volt.MsgAcceptSigners',

  // zkOS Module (2 types)
  TRANSFER_TX: '/twilightproject.nyks.zkos.MsgTransferTx',
  MINT_BURN_TRADING_BTC: '/twilightproject.nyks.zkos.MsgMintBurnTradingBtc',
} as const;

// Reverse mapping for easy lookup
export const MESSAGE_TYPE_NAMES: Record<string, string> = Object.entries(MESSAGE_TYPES).reduce(
  (acc, [key, value]) => {
    acc[value] = key;
    return acc;
  },
  {} as Record<string, string>
);

// Module categories
export const MODULE_TYPES = {
  BRIDGE: 'bridge',
  FORKS: 'forks',
  VOLT: 'volt',
  ZKOS: 'zkos',
} as const;

export function getModuleFromType(msgType: string): string | null {
  if (msgType.includes('.bridge.')) return MODULE_TYPES.BRIDGE;
  if (msgType.includes('.forks.')) return MODULE_TYPES.FORKS;
  if (msgType.includes('.volt.')) return MODULE_TYPES.VOLT;
  if (msgType.includes('.zkos.')) return MODULE_TYPES.ZKOS;
  return null;
}

// Base message interface
export interface BaseMessage {
  '@type': string;
  [key: string]: unknown;
}

// Decoded message result
export interface DecodedMessage {
  type: string;
  typeName: string;
  module: string | null;
  data: Record<string, unknown>;
  raw: BaseMessage;
}
