import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import axios from 'axios';
import { config } from '../config.js';

const router = Router();
const prisma = new PrismaClient();

// Fetch balances from LCD API
interface CoinBalance {
  denom: string;
  amount: string;
}

async function fetchLcdBalances(address: string): Promise<CoinBalance[]> {
  // Validator operator addresses (twilightvaloper) are not supported by the bank API
  if (address.startsWith('twilightvaloper')) {
    return [];
  }
  try {
    const response = await axios.get(
      `${config.lcdUrl}/cosmos/bank/v1beta1/balances/${address}`,
      { timeout: 5000 }
    );
    return response.data?.balances || [];
  } catch (error) {
    console.error('Failed to fetch LCD balances:', error);
    return [];
  }
}

// Validation schemas
const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// GET /api/accounts/:address - Get account details
router.get('/:address', async (req: Request, res: Response) => {
  try {
    const { address } = req.params;

    if (!address || !address.startsWith('twilight')) {
      return res.status(400).json({ error: 'Invalid address format' });
    }

    const account = await prisma.account.findUnique({
      where: { address },
    });

    // Get related data even if account doesn't exist in our DB
    const [deposits, withdrawals, clearingAccount, zkosOperations, fragmentSigners, lcdBalances] = await Promise.all([
      prisma.btcDeposit.findMany({
        where: { twilightDepositAddress: address },
        orderBy: { blockHeight: 'desc' },
        take: 10,
      }),
      prisma.btcWithdrawal.findMany({
        where: { twilightAddress: address },
        orderBy: { blockHeight: 'desc' },
        take: 10,
      }),
      prisma.clearingAccount.findUnique({
        where: { twilightAddress: address },
      }),
      prisma.zkosMintBurn.findMany({
        where: { twilightAddress: address },
        orderBy: { blockHeight: 'desc' },
        take: 10,
      }),
      prisma.fragmentSigner.findMany({
        where: { signerAddress: address },
        orderBy: { blockHeight: 'desc' },
        take: 10,
      }),
      fetchLcdBalances(address),
    ]);

    // Serialize BigInt values
    const serializedDeposits = deposits.map((d) => ({
      ...d,
      depositAmount: d.depositAmount.toString(),
      btcHeight: d.btcHeight.toString(),
    }));

    const serializedWithdrawals = withdrawals.map((w) => ({
      ...w,
      withdrawAmount: w.withdrawAmount.toString(),
    }));

    const serializedZkos = zkosOperations.map((z) => ({
      ...z,
      btcValue: z.btcValue.toString(),
    }));

    const serializedFragmentSigners = fragmentSigners.map((f) => ({
      ...f,
      fragmentId: f.fragmentId.toString(),
      applicationFee: f.applicationFee.toString(),
    }));

    res.json({
      account: account
        ? {
            ...account,
            balance: account.balance.toString(),
          }
        : null,
      balances: lcdBalances,
      deposits: serializedDeposits,
      withdrawals: serializedWithdrawals,
      clearingAccount,
      zkosOperations: serializedZkos,
      fragmentSigners: serializedFragmentSigners,
    });
  } catch (error) {
    console.error('Error fetching account:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/accounts/:address/transactions - Get account transactions
router.get('/:address/transactions', async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const { page, limit } = paginationSchema.parse(req.query);
    const skip = (page - 1) * limit;

    if (!address || !address.startsWith('twilight')) {
      return res.status(400).json({ error: 'Invalid address format' });
    }

    // Search for transactions involving this address using raw SQL for proper JSON search
    // This searches both the signers array and the messages JSON field
    const searchPattern = `%${address}%`;

    const transactions = await prisma.$queryRaw<Array<{
      hash: string;
      blockHeight: number;
      blockTime: Date;
      type: string;
      status: string;
      gasUsed: bigint;
    }>>`
      SELECT hash, "blockHeight", "blockTime", type, status, "gasUsed"
      FROM "Transaction"
      WHERE ${address} = ANY(signers)
         OR messages::text ILIKE ${searchPattern}
      ORDER BY "blockHeight" DESC
      LIMIT ${limit} OFFSET ${skip}
    `;

    const countResult = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM "Transaction"
      WHERE ${address} = ANY(signers)
         OR messages::text ILIKE ${searchPattern}
    `;

    const total = Number(countResult[0]?.count || 0);

    const serializedTxs = transactions.map((tx) => ({
      ...tx,
      gasUsed: tx.gasUsed.toString(),
    }));

    res.json({
      data: serializedTxs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid query parameters' });
    }
    console.error('Error fetching account transactions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/accounts - List accounts with pagination
router.get('/', async (req: Request, res: Response) => {
  try {
    const { page, limit } = paginationSchema.parse(req.query);
    const skip = (page - 1) * limit;

    const [accounts, total] = await Promise.all([
      prisma.account.findMany({
        orderBy: { txCount: 'desc' },
        skip,
        take: limit,
      }),
      prisma.account.count(),
    ]);

    const serializedAccounts = accounts.map((a) => ({
      ...a,
      balance: a.balance.toString(),
    }));

    res.json({
      data: serializedAccounts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid query parameters' });
    }
    console.error('Error fetching accounts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
