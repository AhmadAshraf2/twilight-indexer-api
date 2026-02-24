/**
 * Backfill script to update zkosTransfer records with rich decoded data
 *
 * This script fetches all zkosTransfer records and re-decodes them using
 * the /api/decode-zkos-transaction endpoint which includes the summary
 * with order_operation field needed for filtering.
 *
 * Usage: npx tsx packages/api/scripts/backfill-zkos-decoded.ts
 */

import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const prisma = new PrismaClient();
const ZKOS_DECODE_URL = process.env.ZKOS_DECODE_URL || 'https://indexer.twilight.org';

async function fetchDecodedZkosData(txByteCode: string): Promise<any | null> {
  try {
    const response = await axios.post(
      `${ZKOS_DECODE_URL}/api/decode-zkos-transaction`,
      { tx_byte_code: txByteCode },
      {
        timeout: 30000,
        headers: { 'Content-Type': 'application/json' },
      }
    );
    return response.data || null;
  } catch (error) {
    console.error('Failed to decode:', error);
    return null;
  }
}

async function main() {
  console.log('Starting zkosTransfer backfill...');
  console.log(`Using decode URL: ${ZKOS_DECODE_URL}`);

  // Fetch all zkosTransfer records
  const records = await prisma.zkosTransfer.findMany({
    select: {
      id: true,
      txHash: true,
      txByteCode: true,
      decodedData: true,
    },
  });

  console.log(`Found ${records.length} zkosTransfer records to process`);

  let updated = 0;
  let failed = 0;
  let skipped = 0;

  for (const record of records) {
    // Check if already has order_operation in the decoded data
    const existing = record.decodedData as any;
    const hasOrderOp = existing?.data?.summary?.order_operation || existing?.summary?.order_operation;

    if (hasOrderOp) {
      console.log(`[${record.id}] Already has order_operation, skipping`);
      skipped++;
      continue;
    }

    if (!record.txByteCode) {
      console.log(`[${record.id}] No txByteCode, skipping`);
      skipped++;
      continue;
    }

    console.log(`[${record.id}] Decoding ${record.txHash.substring(0, 16)}...`);

    const decoded = await fetchDecodedZkosData(record.txByteCode);

    if (decoded) {
      await prisma.zkosTransfer.update({
        where: { id: record.id },
        data: { decodedData: decoded },
      });

      const orderOp = decoded?.data?.summary?.order_operation || decoded?.summary?.order_operation;
      console.log(`[${record.id}] Updated - order_operation: ${orderOp || 'none'}`);
      updated++;
    } else {
      console.log(`[${record.id}] Failed to decode`);
      failed++;
    }

    // Small delay to avoid overwhelming the API
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log('\n--- Backfill Complete ---');
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed: ${failed}`);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('Backfill failed:', error);
  prisma.$disconnect();
  process.exit(1);
});
