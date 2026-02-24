import { PrismaClient } from '@prisma/client';
import { decodeZkosTransactionFromApi } from './decoders/index.js';
import { logger } from './logger.js';

const prisma = new PrismaClient();

const BATCH_SIZE = 20;
const POLL_INTERVAL_MS = 10_000; // 10 seconds
const MAX_ATTEMPTS = 5;

let running = false;
let stopRequested = false;

/**
 * Async enrichment worker for zkOS transaction decoding.
 * Picks up ZkosTransfer records with decodeStatus='pending',
 * calls the external decode API, and updates the record.
 * Failures are retried up to MAX_ATTEMPTS times.
 */
export async function startEnrichment(): Promise<void> {
  if (running) {
    logger.warn('Enrichment worker already running');
    return;
  }

  running = true;
  stopRequested = false;
  logger.info('Starting zkOS enrichment worker');

  while (!stopRequested) {
    try {
      const pending = await prisma.zkosTransfer.findMany({
        where: {
          decodeStatus: 'pending',
          decodeAttempts: { lt: MAX_ATTEMPTS },
        },
        orderBy: { id: 'asc' },
        take: BATCH_SIZE,
      });

      if (pending.length === 0) {
        await sleep(POLL_INTERVAL_MS);
        continue;
      }

      logger.info({ count: pending.length }, 'Enriching zkOS transfers');

      for (const record of pending) {
        if (stopRequested) break;

        try {
          const decoded = await decodeZkosTransactionFromApi(record.txByteCode);

          if (decoded) {
            const programType =
              (decoded as any)?.summary?.program_type ||
              (decoded as any)?.tx_type ||
              null;

            await prisma.zkosTransfer.update({
              where: { id: record.id },
              data: {
                decodedData: decoded as any,
                inputs: decoded.inputs as any,
                outputs: decoded.outputs as any,
                programType,
                decodeStatus: 'ok',
                decodeAttempts: record.decodeAttempts + 1,
                lastDecodeError: null,
              },
            });
          } else {
            // API returned null — count as a failed attempt
            const attempts = record.decodeAttempts + 1;
            await prisma.zkosTransfer.update({
              where: { id: record.id },
              data: {
                decodeAttempts: attempts,
                decodeStatus: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
                lastDecodeError: 'Decode API returned null',
              },
            });
          }
        } catch (err) {
          const attempts = record.decodeAttempts + 1;
          await prisma.zkosTransfer.update({
            where: { id: record.id },
            data: {
              decodeAttempts: attempts,
              decodeStatus: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
              lastDecodeError: (err as Error).message,
            },
          });
          logger.warn(
            { zkTxId: record.zkTxId, attempt: attempts, error: (err as Error).message },
            'zkOS decode attempt failed'
          );
        }
      }
    } catch (err) {
      logger.error({ err }, 'Enrichment worker error');
      await sleep(POLL_INTERVAL_MS);
    }
  }

  running = false;
  logger.info('Enrichment worker stopped');
}

export function stopEnrichment(): void {
  stopRequested = true;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
