/**
 * Backfill script to populate the programType column in ZkosTransfer table
 *
 * This script updates existing records based on the order_operation field
 * in the decoded_data JSON column.
 *
 * Usage: npx tsx packages/api/scripts/backfill-program-type.ts
 */

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const prisma = new PrismaClient();

async function main() {
  console.log('Starting programType backfill...\n');

  // First, let's see what we have
  const total = await prisma.zkosTransfer.count();
  const withProgramType = await prisma.zkosTransfer.count({
    where: { programType: { not: null } },
  });

  console.log(`Total records: ${total}`);
  console.log(`Already have programType: ${withProgramType}`);
  console.log(`Need to process: ${total - withProgramType}\n`);

  // Update using raw SQL for efficiency
  // Use program_type from summary for Script transactions, or tx_type for Transfer/Message
  const result = await prisma.$executeRaw`
    UPDATE "ZkosTransfer"
    SET "programType" = COALESCE(
      "decodedData"->'summary'->>'program_type',
      "decodedData"->>'tx_type'
    )
    WHERE "programType" IS NULL
  `;

  console.log(`Updated ${result} records\n`);

  // Verify the results
  const counts = await prisma.$queryRaw<Array<{ programType: string | null; count: bigint }>>`
    SELECT "programType", COUNT(*) as count
    FROM "ZkosTransfer"
    GROUP BY "programType"
    ORDER BY "programType" NULLS LAST
  `;

  console.log('Results by programType:');
  for (const row of counts) {
    console.log(`  ${row.programType || '(null/Transfer)'}: ${row.count}`);
  }

  await prisma.$disconnect();
  console.log('\nBackfill complete!');
}

main().catch((error) => {
  console.error('Backfill failed:', error);
  prisma.$disconnect();
  process.exit(1);
});
