import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import crypto from 'crypto';
import { getCache, setCache, withCache, CACHE_TTL, CACHE_KEYS } from '../cache.js';
import { config } from '../config.js';

const router = Router();
const prisma = new PrismaClient();

// Build a map of base64 proposer address → { moniker, operatorAddress }
async function getProposerMap(): Promise<Map<string, { moniker: string; operatorAddress: string }>> {
  const cacheKey = 'cache:proposer-map:all';
  const cached = await getCache<Array<[string, { moniker: string; operatorAddress: string }]>>(cacheKey);
  if (cached) return new Map(cached);

  try {
    const url = new URL(`${config.lcdUrl}/cosmos/staking/v1beta1/validators`);
    url.searchParams.set('pagination.limit', '200');

    const response = await fetch(url.toString());
    if (!response.ok) return new Map();

    const data = (await response.json()) as {
      validators: Array<{
        operator_address: string;
        description: { moniker: string };
        consensus_pubkey?: { key: string };
      }>;
    };

    const map = new Map<string, { moniker: string; operatorAddress: string }>();
    for (const v of data.validators) {
      if (!v.consensus_pubkey?.key) continue;
      const pubkeyBytes = Buffer.from(v.consensus_pubkey.key, 'base64');
      const sha256Hash = crypto.createHash('sha256').update(pubkeyBytes).digest();
      const proposerAddr = sha256Hash.subarray(0, 20).toString('base64');
      map.set(proposerAddr, {
        moniker: v.description.moniker,
        operatorAddress: v.operator_address,
      });
    }

    // Cache as array of entries for 10 minutes
    setCache(cacheKey, Array.from(map.entries()), CACHE_TTL.VALIDATORS).catch(() => {});
    return map;
  } catch {
    return new Map();
  }
}

// Validation schemas
const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const blockHeightSchema = z.object({
  height: z.coerce.number().int().positive(),
});

// GET /api/blocks - List blocks with pagination
router.get('/', async (req: Request, res: Response) => {
  try {
    const { page, limit } = paginationSchema.parse(req.query);
    const skip = (page - 1) * limit;
    const cacheKey = CACHE_KEYS.BLOCKS_LIST(page, limit);

    // Try cache first
    const cached = await getCache<any>(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const [blocks, total] = await Promise.all([
      prisma.block.findMany({
        orderBy: { height: 'desc' },
        skip,
        take: limit,
        select: {
          height: true,
          hash: true,
          timestamp: true,
          proposer: true,
          txCount: true,
          gasUsed: true,
          gasWanted: true,
        },
      }),
      prisma.block.count(),
    ]);

    // Enrich with proposer moniker
    const proposerMap = await getProposerMap();

    // Convert BigInt to string for JSON serialization
    const serializedBlocks = blocks.map((block) => {
      const proposerInfo = block.proposer ? proposerMap.get(block.proposer) : undefined;
      return {
        ...block,
        gasUsed: block.gasUsed.toString(),
        gasWanted: block.gasWanted.toString(),
        proposerMoniker: proposerInfo?.moniker ?? null,
        proposerOperator: proposerInfo?.operatorAddress ?? null,
      };
    });

    const response = {
      data: serializedBlocks,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };

    // Cache for 10 seconds
    setCache(cacheKey, response, CACHE_TTL.BLOCKS_LIST).catch(() => {});

    res.json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid query parameters', details: error.errors });
    }
    console.error('Error fetching blocks:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/blocks/latest - Get latest block
router.get('/latest', async (req: Request, res: Response) => {
  try {
    const block = await prisma.block.findFirst({
      orderBy: { height: 'desc' },
      include: {
        transactions: {
          take: 10,
          orderBy: { id: 'desc' },
          select: {
            hash: true,
            type: true,
            status: true,
            gasUsed: true,
          },
        },
      },
    });

    if (!block) {
      return res.status(404).json({ error: 'No blocks found' });
    }

    const pMap = await getProposerMap();
    const pInfo = block.proposer ? pMap.get(block.proposer) : undefined;

    res.json({
      ...block,
      gasUsed: block.gasUsed.toString(),
      gasWanted: block.gasWanted.toString(),
      proposerMoniker: pInfo?.moniker ?? null,
      proposerOperator: pInfo?.operatorAddress ?? null,
      transactions: block.transactions.map((tx) => ({
        ...tx,
        gasUsed: tx.gasUsed.toString(),
      })),
    });
  } catch (error) {
    console.error('Error fetching latest block:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/blocks/:height - Get block by height
router.get('/:height', async (req: Request, res: Response) => {
  try {
    const { height } = blockHeightSchema.parse(req.params);

    const block = await prisma.block.findUnique({
      where: { height },
      include: {
        transactions: {
          orderBy: { id: 'asc' },
          select: {
            hash: true,
            type: true,
            messageTypes: true,
            status: true,
            gasUsed: true,
            gasWanted: true,
            memo: true,
          },
        },
        events: {
          take: 100,
          select: {
            type: true,
            attributes: true,
            txHash: true,
          },
        },
      },
    });

    if (!block) {
      return res.status(404).json({ error: 'Block not found' });
    }

    const pMap2 = await getProposerMap();
    const pInfo2 = block.proposer ? pMap2.get(block.proposer) : undefined;

    res.json({
      ...block,
      gasUsed: block.gasUsed.toString(),
      gasWanted: block.gasWanted.toString(),
      proposerMoniker: pInfo2?.moniker ?? null,
      proposerOperator: pInfo2?.operatorAddress ?? null,
      transactions: block.transactions.map((tx) => ({
        ...tx,
        gasUsed: tx.gasUsed.toString(),
        gasWanted: tx.gasWanted.toString(),
      })),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid block height' });
    }
    console.error('Error fetching block:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/blocks/:height/transactions - Get transactions for a block
router.get('/:height/transactions', async (req: Request, res: Response) => {
  try {
    const { height } = blockHeightSchema.parse(req.params);
    const { page, limit } = paginationSchema.parse(req.query);
    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where: { blockHeight: height },
        orderBy: { id: 'asc' },
        skip,
        take: limit,
      }),
      prisma.transaction.count({ where: { blockHeight: height } }),
    ]);

    const serializedTxs = transactions.map((tx) => ({
      ...tx,
      gasUsed: tx.gasUsed.toString(),
      gasWanted: tx.gasWanted.toString(),
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
      return res.status(400).json({ error: 'Invalid parameters' });
    }
    console.error('Error fetching block transactions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
