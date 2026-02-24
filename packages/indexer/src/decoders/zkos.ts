import axios from 'axios';
import { MESSAGE_TYPES } from './types.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

// ============================================
// zkOS Module Message Interfaces
// ============================================

export interface MsgTransferTx {
  '@type': typeof MESSAGE_TYPES.TRANSFER_TX;
  txId: string;
  txByteCode: string;
  txFee: string;
  zkOracleAddress: string;
}

export interface MsgMintBurnTradingBtc {
  '@type': typeof MESSAGE_TYPES.MINT_BURN_TRADING_BTC;
  mintOrBurn: boolean;
  btcValue: string;
  qqAccount: string; // QuisQuis account (266 char hex)
  encryptScalar: string; // 64 char hex
  twilightAddress: string;
}

// Union type for all zkos messages
export type ZkosMessage = MsgTransferTx | MsgMintBurnTradingBtc;

// ============================================
// zkOS Decoded Transaction Types
// ============================================

export interface DecodedZkosInput {
  ioType: 'Coin' | 'Memo' | 'State';
  utxo: {
    txid: string;
    outputIndex: number;
  };
  data: Record<string, unknown>;
}

export interface DecodedZkosOutput {
  ioType: 'Coin' | 'Memo' | 'State';
  data: Record<string, unknown>;
}

export interface DecodedZkosTransaction {
  inputs: DecodedZkosInput[];
  outputs: DecodedZkosOutput[];
  witnesses: unknown[];
  fee: string;
}

// ============================================
// zkOS Message Decoders
// ============================================

export function decodeTransferTx(msg: MsgTransferTx) {
  return {
    zkTxId: msg.txId,
    txByteCode: msg.txByteCode,
    txFee: BigInt(msg.txFee || '0'),
    zkOracleAddress: msg.zkOracleAddress,
  };
}

export function decodeMintBurnTradingBtc(msg: MsgMintBurnTradingBtc) {
  return {
    mintOrBurn: msg.mintOrBurn,
    btcValue: BigInt(msg.btcValue || '0'),
    qqAccount: msg.qqAccount,
    encryptScalar: msg.encryptScalar,
    twilightAddress: msg.twilightAddress,
  };
}

// ============================================
// zkOS External API Decoder
// ============================================

/**
 * Decode a zkOS transaction bytecode using the external decode API
 * @param txByteCode The hex-encoded transaction bytecode
 * @returns Decoded transaction data or null if decoding fails
 */
export async function decodeZkosTransactionFromApi(
  txByteCode: string
): Promise<DecodedZkosTransaction | null> {
  try {
    const response = await axios.post(
      `${config.zkosDecodeUrl}/api/decode-zkos-transaction`,
      { tx_byte_code: txByteCode },
      {
        timeout: 10000,
        headers: { 'Content-Type': 'application/json' },
      }
    );

    if (response.data) {
      return response.data as DecodedZkosTransaction;
    }
    return null;
  } catch (error) {
    logger.warn({ txByteCode: txByteCode.substring(0, 50) + '...' }, 'Failed to decode zkOS transaction');
    return null;
  }
}

/**
 * Parse inputs from decoded zkOS transaction
 */
export function parseZkosInputs(decodedTx: DecodedZkosTransaction): DecodedZkosInput[] {
  return decodedTx.inputs || [];
}

/**
 * Parse outputs from decoded zkOS transaction
 */
export function parseZkosOutputs(decodedTx: DecodedZkosTransaction): DecodedZkosOutput[] {
  return decodedTx.outputs || [];
}

// Check if message is a zkos message
export function isZkosMessage(msgType: string): boolean {
  return msgType.includes('.zkos.');
}
