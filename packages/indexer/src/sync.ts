import { PrismaClient } from '@prisma/client';
import { lcdClient, TxResponse, BlockWithTxsResponse } from './lcd-client.js';
import {
  decodeMessage,
  serializeDecodedData,
  MESSAGE_TYPES,
} from './decoders/index.js';
import { config } from './config.js';
import { logger } from './logger.js';
import { EventEmitter } from 'events';

const prisma = new PrismaClient();

// Event emitter for real-time updates
export const indexerEvents = new EventEmitter();

// ============================================
// Indexer State Management
// ============================================

async function getLastIndexedHeight(): Promise<number> {
  const state = await prisma.indexerState.findUnique({
    where: { key: 'lastIndexedHeight' },
  });
  return state ? parseInt(state.value, 10) : config.startHeight - 1;
}

async function setLastIndexedHeight(height: number): Promise<void> {
  await prisma.indexerState.upsert({
    where: { key: 'lastIndexedHeight' },
    update: { value: height.toString() },
    create: { key: 'lastIndexedHeight', value: height.toString() },
  });
}

// ============================================
// Block Processing
// ============================================

interface ProcessedBlock {
  height: number;
  hash: string;
  timestamp: Date;
  proposer: string | null;
  txCount: number;
  gasUsed: bigint;
  gasWanted: bigint;
}

interface ProcessedTransaction {
  hash: string;
  blockHeight: number;
  blockTime: Date;
  type: string;
  messageTypes: string[];
  messages: any[];
  fee: any;
  gasUsed: bigint;
  gasWanted: bigint;
  memo: string | null;
  status: string;
  errorLog: string | null;
  signers: string[];
}

async function processBlock(height: number): Promise<void> {
  logger.info({ height }, 'Processing block');

  try {
    // Fetch block header first
    const blockInfo = await lcdClient.getBlockByHeight(height);

    // Linkage validation: verify this block's last_block_id matches the previous block's hash
    if (height > 1) {
      const expectedPrevHash = blockInfo.block.header.last_block_id?.hash;
      if (expectedPrevHash) {
        const prevBlock = await prisma.block.findUnique({
          where: { height: height - 1 },
          select: { hash: true },
        });
        if (prevBlock && prevBlock.hash !== expectedPrevHash) {
          logger.error(
            { height, expectedPrevHash, actualPrevHash: prevBlock.hash },
            'Block linkage mismatch — possible reorg. Halting indexer.'
          );
          stopRequested = true;
          return;
        }
      }
    }

    // Fetch transactions using the events query (returns proper tx_responses with txhash)
    let txResponses: any[] = [];
    try {
      const txData = await lcdClient.getTxsByHeight(height);
      txResponses = txData.tx_responses || [];
    } catch (err) {
      // No transactions in this block (404 or empty)
      txResponses = [];
    }

    // Process block header
    const block: ProcessedBlock = {
      height,
      hash: blockInfo.block_id.hash,
      timestamp: new Date(blockInfo.block.header.time),
      proposer: blockInfo.block.header.proposer_address || null,
      txCount: txResponses.length,
      gasUsed: BigInt(0),
      gasWanted: BigInt(0),
    };

    // Process transactions
    const transactions: ProcessedTransaction[] = [];
    const events: Array<{
      txHash: string | null;
      blockHeight: number;
      type: string;
      attributes: Record<string, string>;
    }> = [];

    if (txResponses.length > 0) {
      for (const tx of txResponses) {
        if (!tx.txhash) {
          logger.warn({ txKeys: Object.keys(tx) }, 'Transaction missing txhash, skipping');
          continue;
        }
        const processedTx = await processTransaction(tx, height, block.timestamp);
        transactions.push(processedTx);

        // Aggregate gas
        block.gasUsed += processedTx.gasUsed;
        block.gasWanted += processedTx.gasWanted;

        // Extract events
        if (tx.events) {
          for (const event of tx.events) {
            events.push({
              txHash: tx.txhash,
              blockHeight: height,
              type: event.type,
              attributes: event.attributes.reduce(
                (acc: Record<string, string>, attr: any) => {
                  acc[attr.key] = attr.value;
                  return acc;
                },
                {} as Record<string, string>
              ),
            });
          }
        }
      }
    }

    // Store in database using transaction
    await prisma.$transaction(async (tx) => {
      // Upsert block
      await tx.block.upsert({
        where: { height },
        update: {
          hash: block.hash,
          timestamp: block.timestamp,
          proposer: block.proposer,
          txCount: block.txCount,
          gasUsed: block.gasUsed,
          gasWanted: block.gasWanted,
        },
        create: {
          height: block.height,
          hash: block.hash,
          timestamp: block.timestamp,
          proposer: block.proposer,
          txCount: block.txCount,
          gasUsed: block.gasUsed,
          gasWanted: block.gasWanted,
        },
      });

      // Insert transactions
      for (const txData of transactions) {
        await tx.transaction.upsert({
          where: { hash: txData.hash },
          update: txData,
          create: txData,
        });
      }

      // Insert events
      for (const event of events) {
        await tx.event.create({
          data: event,
        });
      }
      // Update accounts
      await updateAccounts(tx, transactions, block.timestamp);

      // Update indexer state
      await tx.indexerState.upsert({
        where: { key: 'lastIndexedHeight' },
        update: { value: height.toString() },
        create: { key: 'lastIndexedHeight', value: height.toString() },
      });
    });

    // Process custom messages outside the main transaction to avoid FK constraint issues
    for (const txData of transactions) {
      try {
        await processCustomMessages(prisma, txData, height);
      } catch (err) {
        logger.warn({ txHash: txData.hash, error: (err as Error).message }, 'Custom message processing failed, continuing');
      }
    }

    // Emit events for real-time updates
    indexerEvents.emit('block:new', block);
    for (const tx of transactions) {
      indexerEvents.emit('tx:new', tx);
    }

    logger.info(
      { height, txCount: transactions.length },
      'Block processed successfully'
    );
  } catch (error) {
    if ((error as any)?.response?.status === 400) {
      // No transactions in this block, just store the block
      const blockInfo = await lcdClient.getBlockByHeight(height);

      await prisma.block.upsert({
        where: { height },
        update: {
          hash: blockInfo.block_id.hash,
          timestamp: new Date(blockInfo.block.header.time),
          proposer: blockInfo.block.header.proposer_address || null,
          txCount: 0,
        },
        create: {
          height,
          hash: blockInfo.block_id.hash,
          timestamp: new Date(blockInfo.block.header.time),
          proposer: blockInfo.block.header.proposer_address || null,
          txCount: 0,
        },
      });

      await setLastIndexedHeight(height);

      indexerEvents.emit('block:new', {
        height,
        hash: blockInfo.block_id.hash,
        timestamp: new Date(blockInfo.block.header.time),
        txCount: 0,
      });

      logger.info({ height }, 'Empty block processed');
    } else {
      throw error;
    }
  }
}

async function processTransaction(
  tx: TxResponse,
  blockHeight: number,
  blockTime: Date
): Promise<ProcessedTransaction> {
  // Handle different tx structures - the API may return tx directly or nested
  const txBody = tx.tx?.body || (tx as any).body;
  const txAuthInfo = tx.tx?.auth_info || (tx as any).auth_info;

  if (!txBody) {
    logger.warn({ txHash: tx.txhash, txKeys: Object.keys(tx) }, 'Transaction missing body');
  }

  const messages = txBody?.messages || [];
  const messageTypes = messages.map((m: any) => m['@type']);
  const primaryType = messageTypes[0] || 'unknown';

  // Extract signers from auth_info
  const signers: string[] = [];
  if (txAuthInfo?.signer_infos) {
    for (const signerInfo of txAuthInfo.signer_infos) {
      if (signerInfo.public_key?.key) {
        signers.push(signerInfo.public_key.key);
      }
    }
  }

  // Decode all messages
  const decodedMessages = messages.map((msg: any) => {
    const decoded = decodeMessage(msg);
    return {
      type: decoded.type,
      typeName: decoded.typeName,
      module: decoded.module,
      data: serializeDecodedData(decoded.data),
    };
  });

  return {
    hash: tx.txhash,
    blockHeight,
    blockTime,
    type: primaryType,
    messageTypes,
    messages: decodedMessages,
    fee: txAuthInfo?.fee || null,
    gasUsed: BigInt(tx.gas_used || '0'),
    gasWanted: BigInt(tx.gas_wanted || '0'),
    memo: txBody?.memo || null,
    status: tx.code === 0 ? 'success' : 'failed',
    errorLog: tx.code !== 0 ? tx.raw_log : null,
    signers,
  };
}

// ============================================
// Custom Message Processing
// ============================================

async function processCustomMessages(
  db: any,  // PrismaClient or transaction client
  txData: ProcessedTransaction,
  blockHeight: number
): Promise<void> {
  const messages = txData.messages as Array<{
    type: string;
    data: Record<string, unknown>;
  }>;

  for (const msg of messages) {
    const msgType = msg.type;
    const data = msg.data;

    try {
      // Bridge Module
      if (msgType === MESSAGE_TYPES.CONFIRM_BTC_DEPOSIT) {
        await db.btcDeposit.upsert({
          where: {
            btcHash_twilightDepositAddress: {
              btcHash: data.btcHash as string,
              twilightDepositAddress: data.twilightDepositAddress as string,
            },
          },
          update: { votes: { increment: 1 } },
          create: {
            txHash: txData.hash,
            blockHeight,
            reserveAddress: data.reserveAddress as string,
            depositAmount: BigInt(data.depositAmount as string),
            btcHeight: BigInt(data.btcHeight as string),
            btcHash: data.btcHash as string,
            twilightDepositAddress: data.twilightDepositAddress as string,
            oracleAddress: data.oracleAddress as string,
            votes: 1,
          },
        });
        indexerEvents.emit('deposit:new', data);
      }

      if (msgType === MESSAGE_TYPES.REGISTER_BTC_DEPOSIT_ADDRESS) {
        await db.btcDepositAddress.upsert({
          where: { btcDepositAddress: data.btcDepositAddress as string },
          update: {
            btcSatoshiTestAmount: BigInt(data.btcSatoshiTestAmount as string),
            twilightStakingAmount: BigInt(data.twilightStakingAmount as string),
            twilightAddress: data.twilightAddress as string,
          },
          create: {
            txHash: txData.hash,
            blockHeight,
            btcDepositAddress: data.btcDepositAddress as string,
            btcSatoshiTestAmount: BigInt(data.btcSatoshiTestAmount as string),
            twilightStakingAmount: BigInt(data.twilightStakingAmount as string),
            twilightAddress: data.twilightAddress as string,
          },
        });
      }

      if (msgType === MESSAGE_TYPES.WITHDRAW_BTC_REQUEST) {
        await db.btcWithdrawal.upsert({
          where: { withdrawIdentifier: parseInt(data.withdrawIdentifier as string) },
          update: { isConfirmed: (data.isConfirmed as boolean) ?? false },
          create: {
            withdrawIdentifier: parseInt(data.withdrawIdentifier as string),
            withdrawAddress: data.withdrawAddress as string,
            withdrawReserveId: (data.withdrawReserveId as string) || '0',
            withdrawAmount: BigInt((data.withdrawAmount as string) || '0'),
            twilightAddress: data.twilightAddress as string,
            isConfirmed: (data.isConfirmed as boolean) ?? false,
            blockHeight,
          },
        });
        indexerEvents.emit('withdrawal:new', data);
      }

      if (msgType === MESSAGE_TYPES.SWEEP_PROPOSAL) {
        await db.sweepProposal.create({
          data: {
            txHash: txData.hash,
            blockHeight,
            reserveId: BigInt(data.reserveId as string),
            newReserveAddress: data.newReserveAddress as string,
            judgeAddress: data.judgeAddress as string,
            btcBlockNumber: BigInt(data.btcBlockNumber as string),
            btcRelayCapacityValue: BigInt(data.btcRelayCapacityValue as string),
            btcTxHash: data.btcTxHash as string,
            unlockHeight: BigInt(data.unlockHeight as string),
            roundId: BigInt(data.roundId as string),
            oracleAddress: data.oracleAddress as string,
          },
        });
      }

      if (msgType === MESSAGE_TYPES.SIGN_SWEEP) {
        await db.sweepSignature.upsert({
          where: {
            reserveId_roundId_signerAddress: {
              reserveId: BigInt(data.reserveId as string),
              roundId: BigInt(data.roundId as string),
              signerAddress: data.signerAddress as string,
            },
          },
          update: {
            sweepSignatures: data.sweepSignatures as string[],
          },
          create: {
            txHash: txData.hash,
            blockHeight,
            reserveId: BigInt(data.reserveId as string),
            roundId: BigInt(data.roundId as string),
            signerPublicKey: data.signerPublicKey as string,
            sweepSignatures: data.sweepSignatures as string[],
            signerAddress: data.signerAddress as string,
          },
        });
      }

      if (msgType === MESSAGE_TYPES.SIGN_REFUND) {
        await db.refundSignature.upsert({
          where: {
            reserveId_roundId_signerAddress: {
              reserveId: BigInt(data.reserveId as string),
              roundId: BigInt(data.roundId as string),
              signerAddress: data.signerAddress as string,
            },
          },
          update: {
            refundSignatures: data.refundSignatures as string[],
          },
          create: {
            txHash: txData.hash,
            blockHeight,
            reserveId: BigInt(data.reserveId as string),
            roundId: BigInt(data.roundId as string),
            signerPublicKey: data.signerPublicKey as string,
            refundSignatures: data.refundSignatures as string[],
            signerAddress: data.signerAddress as string,
          },
        });
      }

      // Forks Module
      if (msgType === MESSAGE_TYPES.SET_DELEGATE_ADDRESSES) {
        await db.delegateKey.upsert({
          where: { validatorAddress: data.validatorAddress as string },
          update: {
            btcOracleAddress: data.btcOracleAddress as string,
            btcPublicKey: data.btcPublicKey as string,
            zkOracleAddress: data.zkOracleAddress as string | null,
          },
          create: {
            txHash: txData.hash,
            blockHeight,
            validatorAddress: data.validatorAddress as string,
            btcOracleAddress: data.btcOracleAddress as string,
            btcPublicKey: data.btcPublicKey as string,
            zkOracleAddress: data.zkOracleAddress as string | null,
          },
        });
      }

      if (msgType === MESSAGE_TYPES.SEEN_BTC_CHAIN_TIP) {
        await db.btcChainTip.upsert({
          where: {
            btcHeight_btcOracleAddress: {
              btcHeight: BigInt(data.btcHeight as string),
              btcOracleAddress: data.btcOracleAddress as string,
            },
          },
          update: {},
          create: {
            txHash: txData.hash,
            blockHeight,
            btcHeight: BigInt(data.btcHeight as string),
            btcHash: data.btcHash as string,
            btcOracleAddress: data.btcOracleAddress as string,
          },
        });
      }

      // Volt Module
      if (msgType === MESSAGE_TYPES.BOOTSTRAP_FRAGMENT) {
        // This creates a new fragment - we'll need to generate an ID
        // In practice, the chain assigns the ID, so we might need to read from events
        logger.info({ data }, 'Fragment bootstrap detected');
      }

      if (msgType === MESSAGE_TYPES.SIGNER_APPLICATION) {
        await db.fragmentSigner.upsert({
          where: {
            fragmentId_signerAddress: {
              fragmentId: BigInt(data.fragmentId as string),
              signerAddress: data.signerAddress as string,
            },
          },
          update: {
            applicationFee: BigInt(data.applicationFee as string),
            feeBips: data.feeBips as number,
          },
          create: {
            fragmentId: BigInt(data.fragmentId as string),
            txHash: txData.hash,
            blockHeight,
            applicationFee: BigInt(data.applicationFee as string),
            feeBips: data.feeBips as number,
            btcPubKey: data.btcPubKey as string,
            signerAddress: data.signerAddress as string,
            status: 'pending',
          },
        });
      }

      // zkOS Module
      if (msgType === MESSAGE_TYPES.TRANSFER_TX) {
        // Store raw data immediately — decode happens async via enrichment worker
        await db.zkosTransfer.upsert({
          where: { zkTxId: data.zkTxId as string },
          update: {},
          create: {
            txHash: txData.hash,
            blockHeight,
            zkTxId: data.zkTxId as string,
            txByteCode: data.txByteCode as string,
            txFee: BigInt(data.txFee as string),
            zkOracleAddress: data.zkOracleAddress as string,
            decodedData: null,
            inputs: null,
            outputs: null,
            programType: null,
            decodeStatus: 'pending',
          },
        });
      }

      if (msgType === MESSAGE_TYPES.MINT_BURN_TRADING_BTC) {
        await db.zkosMintBurn.create({
          data: {
            txHash: txData.hash,
            blockHeight,
            mintOrBurn: data.mintOrBurn as boolean,
            btcValue: BigInt(data.btcValue as string),
            qqAccount: data.qqAccount as string,
            encryptScalar: data.encryptScalar as string,
            twilightAddress: data.twilightAddress as string,
          },
        });
      }
    } catch (error) {
      logger.error({ msgType, error }, 'Failed to process custom message');
    }
  }
}

// ============================================
// Account Updates
// ============================================

async function updateAccounts(
  tx: any,
  transactions: ProcessedTransaction[],
  blockTime: Date
): Promise<void> {
  const addresses = new Set<string>();

  for (const txData of transactions) {
    // Extract addresses from messages
    const messages = txData.messages as Array<{ data: Record<string, unknown> }>;
    for (const msg of messages) {
      const data = msg.data;
      // Extract any field that looks like an address
      for (const [key, value] of Object.entries(data)) {
        if (
          typeof value === 'string' &&
          (key.toLowerCase().includes('address') ||
            value.startsWith('twilight'))
        ) {
          addresses.add(value);
        }
      }
    }
  }

  // Update or create accounts
  for (const address of addresses) {
    if (!address || address.length < 10) continue;

    try {
      await tx.account.upsert({
        where: { address },
        update: {
          txCount: { increment: 1 },
          lastSeen: blockTime,
        },
        create: {
          address,
          txCount: 1,
          firstSeen: blockTime,
          lastSeen: blockTime,
        },
      });
    } catch (error) {
      // Ignore errors for invalid addresses
    }
  }
}

// ============================================
// Main Sync Loop
// ============================================

let isRunning = false;
let stopRequested = false;
let lockAcquired = false;

const ADVISORY_LOCK_ID = 123456789;

export async function startSync(): Promise<void> {
  if (isRunning) {
    logger.warn('Sync already running');
    return;
  }

  // Acquire Postgres advisory lock to prevent concurrent indexers
  const lockResult = await prisma.$queryRaw<[{ pg_try_advisory_lock: boolean }]>`SELECT pg_try_advisory_lock(${ADVISORY_LOCK_ID})`;
  if (!lockResult[0].pg_try_advisory_lock) {
    logger.warn('Another indexer instance is already running (advisory lock held). Exiting.');
    return;
  }
  lockAcquired = true;
  logger.info('Advisory lock acquired — this instance is the active indexer');

  isRunning = true;
  stopRequested = false;
  logger.info('Starting block sync');

  try {
    while (!stopRequested) {
      const lastIndexed = await getLastIndexedHeight();
      const latestHeight = await lcdClient.getLatestBlockHeight();

      if (lastIndexed >= latestHeight) {
        // Up to date, wait for new blocks
        logger.debug({ lastIndexed, latestHeight }, 'Waiting for new blocks');
        await sleep(config.pollInterval);
        continue;
      }

      // Process blocks in batches
      const startHeight = lastIndexed + 1;
      const endHeight = Math.min(startHeight + config.batchSize - 1, latestHeight);

      logger.info(
        { startHeight, endHeight, latestHeight },
        'Processing block batch'
      );

      for (let height = startHeight; height <= endHeight && !stopRequested; height++) {
        try {
          await processBlock(height);
        } catch (error) {
          const err = error as Error;
          logger.error({
            height,
            errorMessage: err.message,
            errorStack: err.stack,
            errorName: err.name,
          }, 'Failed to process block');
          // Wait before retrying
          await sleep(5000);
          break;
        }
      }
    }
  } finally {
    isRunning = false;
    if (lockAcquired) {
      try {
        await prisma.$queryRaw`SELECT pg_advisory_unlock(${ADVISORY_LOCK_ID})`;
        lockAcquired = false;
        logger.info('Advisory lock released');
      } catch (err) {
        logger.warn({ err }, 'Failed to release advisory lock');
      }
    }
    logger.info('Block sync stopped');
  }
}

export async function stopSync(): Promise<void> {
  logger.info('Stop requested');
  stopRequested = true;
  if (lockAcquired) {
    try {
      await prisma.$queryRaw`SELECT pg_advisory_unlock(${ADVISORY_LOCK_ID})`;
      lockAcquired = false;
      logger.info('Advisory lock released');
    } catch (err) {
      logger.warn({ err }, 'Failed to release advisory lock');
    }
  }
}

export function isSyncRunning(): boolean {
  return isRunning;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================
// Status
// ============================================

export async function getSyncStatus(): Promise<{
  isRunning: boolean;
  lastIndexedHeight: number;
  latestHeight: number;
  blocksRemaining: number;
}> {
  const lastIndexed = await getLastIndexedHeight();
  const latestHeight = await lcdClient.getLatestBlockHeight();

  return {
    isRunning,
    lastIndexedHeight: lastIndexed,
    latestHeight,
    blocksRemaining: latestHeight - lastIndexed,
  };
}
