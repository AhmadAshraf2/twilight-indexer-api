import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import axios from 'axios';
import { config } from '../config.js';
import { getCache, setCache, CACHE_TTL, CACHE_KEYS } from '../cache.js';

const router = Router();
const prisma = new PrismaClient();

// Fetch fresh decoded data from decode API
async function fetchDecodedZkosData(txByteCode: string): Promise<any | null> {
  try {
    const response = await axios.post(
      `${config.zkosDecodeUrl}/api/decode-zkos-transaction`,
      { tx_byte_code: txByteCode },
      {
        timeout: 10000,
        headers: { 'Content-Type': 'application/json' },
      }
    );
    return response.data || null;
  } catch (error) {
    console.error('Failed to decode zkOS transaction:', error);
    return null;
  }
}

// Validation schemas
const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const txFilterSchema = z.object({
  type: z.string().optional(),
  status: z.enum(['success', 'failed']).optional(),
  module: z.enum(['bridge', 'forks', 'volt', 'zkos']).optional(),
  programType: z.enum(['Transfer', 'Message', 'Mint', 'Burn', 'RelayerInitializer', 'CreateTraderOrder', 'SettleTraderOrder', 'SettleTraderOrderNegativeMarginDifference', 'CreateLendOrder', 'SettleLendOrder', 'LiquidateOrder']).optional(),
});

// GET /api/txs - List transactions with pagination and filters
router.get('/', async (req: Request, res: Response) => {
  try {
    const { page, limit } = paginationSchema.parse(req.query);
    const filters = txFilterSchema.parse(req.query);
    const skip = (page - 1) * limit;

    // Build cache key from all parameters
    const filterKey = JSON.stringify(filters);
    const cacheKey = CACHE_KEYS.TXS_LIST(page, limit, filterKey);

    // Try cache first
    const cached = await getCache<any>(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const where: any = {};

    if (filters.type) {
      where.type = { contains: filters.type };
    }

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.module) {
      where.type = { contains: `.${filters.module}.` };
    }

    // Handle programType filter for zkOS transactions
    if (filters.programType && filters.module === 'zkos') {
      let matchingHashes: string[] = [];

      // Handle Mint/Burn filters from ZkosMintBurn table
      if (filters.programType === 'Mint' || filters.programType === 'Burn') {
        const mintBurns = await prisma.zkosMintBurn.findMany({
          where: { mintOrBurn: filters.programType === 'Mint' },
          select: { txHash: true },
        });
        matchingHashes = mintBurns.map((mb) => mb.txHash);
      } else {
        // Query zkosTransfer table using the programType column
        // Merge SettleTraderOrderNegativeMarginDifference into SettleTraderOrder
        const programTypes = filters.programType === 'SettleTraderOrder'
          ? ['SettleTraderOrder', 'SettleTraderOrderNegativeMarginDifference']
          : [filters.programType];
        const zkosTransfers = await prisma.zkosTransfer.findMany({
          where: { programType: { in: programTypes } },
          select: { txHash: true },
        });
        matchingHashes = zkosTransfers.map((zt) => zt.txHash);
      }

      if (matchingHashes.length === 0) {
        // No matches, return empty result
        return res.json({
          data: [],
          pagination: { page, limit, total: 0, totalPages: 0 },
        });
      }

      where.hash = { in: matchingHashes };
    }

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        orderBy: { blockHeight: 'desc' },
        skip,
        take: limit,
        select: {
          hash: true,
          blockHeight: true,
          blockTime: true,
          type: true,
          messageTypes: true,
          status: true,
          gasUsed: true,
          memo: true,
        },
      }),
      prisma.transaction.count({ where }),
    ]);

    // Get programType for zkOS transactions
    const txHashes = transactions.map((tx) => tx.hash);

    // Query both ZkosTransfer and ZkosMintBurn tables
    const [zkosTransfers, zkosMintBurns] = await Promise.all([
      prisma.zkosTransfer.findMany({
        where: { txHash: { in: txHashes } },
        select: { txHash: true, programType: true, decodedData: true },
      }),
      prisma.zkosMintBurn.findMany({
        where: { txHash: { in: txHashes } },
        select: { txHash: true, mintOrBurn: true },
      }),
    ]);

    const programTypeMap = new Map<string, string | null>();

    // Add ZkosTransfer programTypes (merge SettleTraderOrderNegativeMarginDifference → SettleTraderOrder)
    for (const zt of zkosTransfers) {
      let programType = zt.programType
        || (zt.decodedData as any)?.summary?.program_type
        || (zt.decodedData as any)?.tx_type
        || null;
      if (programType === 'SettleTraderOrderNegativeMarginDifference') {
        programType = 'SettleTraderOrder';
      }
      programTypeMap.set(zt.txHash, programType);
    }

    // Add ZkosMintBurn types (Mint/Burn)
    for (const mb of zkosMintBurns) {
      programTypeMap.set(mb.txHash, mb.mintOrBurn ? 'Mint' : 'Burn');
    }

    const serializedTxs = transactions.map((tx) => ({
      ...tx,
      gasUsed: tx.gasUsed.toString(),
      programType: programTypeMap.get(tx.hash) || null,
    }));

    const result = {
      data: serializedTxs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };

    // Cache the result
    setCache(cacheKey, result, CACHE_TTL.TXS_LIST).catch(() => {});

    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid query parameters', details: error.errors });
    }
    console.error('Error fetching transactions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/txs/recent - Get recent transactions
router.get('/recent', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
    const cacheKey = `cache:txs:recent:${limit}`;

    // Try cache first
    const cached = await getCache<any>(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const transactions = await prisma.transaction.findMany({
      orderBy: { blockHeight: 'desc' },
      take: limit,
      select: {
        hash: true,
        blockHeight: true,
        blockTime: true,
        type: true,
        status: true,
        gasUsed: true,
      },
    });

    const serializedTxs = transactions.map((tx) => ({
      ...tx,
      gasUsed: tx.gasUsed.toString(),
    }));

    // Cache for 10 seconds
    setCache(cacheKey, serializedTxs, CACHE_TTL.TXS_LIST).catch(() => {});

    res.json(serializedTxs);
  } catch (error) {
    console.error('Error fetching recent transactions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Fetch transaction from LCD API
async function fetchTransactionFromLcd(hash: string): Promise<any | null> {
  try {
    const response = await axios.get(
      `${config.lcdUrl}/cosmos/tx/v1beta1/txs/${hash}`,
      { timeout: 10000 }
    );
    return response.data?.tx_response || null;
  } catch (error) {
    console.error('Failed to fetch transaction from LCD:', error);
    return null;
  }
}

// GET /api/txs/types/stats - Get transaction type statistics
// NOTE: This route MUST be before /:hash to avoid "types" being matched as a hash
router.get('/types/stats', async (req: Request, res: Response) => {
  try {
    const cacheKey = 'cache:txs:types:stats';

    // Try cache first
    const cached = await getCache<any>(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const stats = await prisma.transaction.groupBy({
      by: ['type'],
      _count: { type: true },
      orderBy: { _count: { type: 'desc' } },
      take: 20,
    });

    const result = stats.map((s) => ({
      type: s.type,
      count: s._count.type,
    }));

    // Cache for 30 seconds
    setCache(cacheKey, result, CACHE_TTL.STATS).catch(() => {});

    res.json(result);
  } catch (error) {
    console.error('Error fetching transaction stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/txs/script/:scriptAddress - Get transactions by script address
// NOTE: This route MUST be before /:hash to avoid "script" being matched as a hash
router.get('/script/:scriptAddress', async (req: Request, res: Response) => {
  try {
    const { scriptAddress } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = (page - 1) * limit;

    if (!scriptAddress || scriptAddress.length < 10) {
      return res.status(400).json({ error: 'Invalid script address' });
    }

    // Try cache first
    const cacheKey = `cache:script:${scriptAddress}:${page}:${limit}`;
    const cached = await getCache<any>(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    // Search for script_address in decodedData JSON (handle both with and without space after colon)
    const zkosTransfers = await prisma.$queryRaw<Array<{ txHash: string; blockHeight: number; programType: string | null }>>`
      SELECT "txHash", "blockHeight", "programType"
      FROM "ZkosTransfer"
      WHERE "decodedData"::text LIKE '%"script_address": "' || ${scriptAddress} || '"%'
         OR "decodedData"::text LIKE '%"script_address":"' || ${scriptAddress} || '"%'
      ORDER BY "blockHeight" DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    // Get total count
    const countResult = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count FROM "ZkosTransfer"
      WHERE "decodedData"::text LIKE '%"script_address": "' || ${scriptAddress} || '"%'
         OR "decodedData"::text LIKE '%"script_address":"' || ${scriptAddress} || '"%'
    `;
    const total = Number(countResult[0]?.count || 0);

    // Get full transaction data for the matching hashes
    const txHashes = zkosTransfers.map((zt) => zt.txHash);
    const transactions = txHashes.length > 0
      ? await prisma.transaction.findMany({
          where: { hash: { in: txHashes } },
          select: {
            hash: true,
            blockHeight: true,
            blockTime: true,
            type: true,
            status: true,
            gasUsed: true,
          },
          orderBy: { blockHeight: 'desc' },
        })
      : [];

    // Build programType map
    const programTypeMap = new Map(
      zkosTransfers.map((zt) => [zt.txHash, zt.programType])
    );

    const serializedTxs = transactions.map((tx) => ({
      ...tx,
      gasUsed: tx.gasUsed.toString(),
      programType: programTypeMap.get(tx.hash) || null,
    }));

    const result = {
      data: serializedTxs,
      scriptAddress,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };

    // Cache the result
    setCache(cacheKey, result, CACHE_TTL.TXS_LIST).catch(() => {});

    res.json(result);
  } catch (error) {
    console.error('Error searching transactions by script:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/txs/:hash - Get transaction by hash
router.get('/:hash', async (req: Request, res: Response) => {
  try {
    const { hash } = req.params;

    if (!hash || hash.length < 10) {
      return res.status(400).json({ error: 'Invalid transaction hash' });
    }

    // Single query - try both uppercase and lowercase at once
    const upperHash = hash.toUpperCase();
    const lowerHash = hash.toLowerCase();

    const transaction = await prisma.transaction.findFirst({
      where: {
        OR: [
          { hash: upperHash },
          { hash: lowerHash },
        ],
      },
      include: {
        block: {
          select: {
            height: true,
            hash: true,
            timestamp: true,
          },
        },
        events: {
          select: {
            type: true,
            attributes: true,
          },
        },
      },
    });

    // If not in database, fetch from LCD API
    if (!transaction) {
      const lcdTx = await fetchTransactionFromLcd(upperHash);
      if (!lcdTx) {
        return res.status(404).json({ error: 'Transaction not found' });
      }

      // Format LCD response to match our API format
      const txBody = lcdTx.tx?.body || {};
      const txAuthInfo = lcdTx.tx?.auth_info || {};
      const messages = txBody.messages || [];
      const messageTypes = messages.map((m: any) => m['@type']);
      const primaryType = messageTypes[0] || 'unknown';

      // Extract signers
      const signers: string[] = [];
      if (txAuthInfo?.signer_infos) {
        for (const signerInfo of txAuthInfo.signer_infos) {
          if (signerInfo.public_key?.key) {
            signers.push(signerInfo.public_key.key);
          }
        }
      }

      return res.json({
        hash: lcdTx.txhash,
        blockHeight: parseInt(lcdTx.height, 10),
        blockTime: lcdTx.timestamp,
        type: primaryType,
        messageTypes,
        messages: messages.map((msg: any) => ({
          type: msg['@type'],
          typeName: msg['@type'].split('.').pop(),
          data: msg,
        })),
        fee: txAuthInfo.fee || null,
        gasUsed: lcdTx.gas_used || '0',
        gasWanted: lcdTx.gas_wanted || '0',
        memo: txBody.memo || null,
        status: lcdTx.code === 0 ? 'success' : 'failed',
        errorLog: lcdTx.code !== 0 ? lcdTx.raw_log : null,
        signers,
        events: lcdTx.events || [],
        block: null,
        _source: 'lcd', // Indicates this came from LCD, not indexed
      });
    }

    // Check if this transaction has zkOS transfer data
    const txHash = transaction.hash;
    let zkosDecodedData = null;
    if (transaction.type.includes('MsgTransferTx')) {
      // Try to get from cache first
      const cacheKey = CACHE_KEYS.ZKOS_DECODED(txHash);
      const cachedZkosData = await getCache<any>(cacheKey);

      if (cachedZkosData) {
        zkosDecodedData = cachedZkosData;
      } else {
        const zkosTransfer = await prisma.zkosTransfer.findFirst({
          where: { txHash },
          select: { decodedData: true, txByteCode: true },
        });
        if (zkosTransfer) {
          // Check if stored data has summary, if not fetch fresh
          const storedData = zkosTransfer.decodedData as any;

          if (storedData && storedData.summary) {
            zkosDecodedData = storedData;
          } else if (zkosTransfer.txByteCode) {
            // Fetch fresh decoded data from API
            const freshData = await fetchDecodedZkosData(zkosTransfer.txByteCode);
            if (freshData) {
              zkosDecodedData = freshData;
              // Update the stored data for future requests
              prisma.zkosTransfer.updateMany({
                where: { txHash },
                data: { decodedData: freshData as any },
              }).catch((err) => { console.error('Failed to update stored data:', err); });
            } else {
              zkosDecodedData = storedData;
            }
          } else {
            zkosDecodedData = storedData;
          }

          // Cache the decoded data if we have it
          if (zkosDecodedData) {
            setCache(cacheKey, zkosDecodedData, CACHE_TTL.ZKOS_DECODED).catch(() => {});
          }
        }
      }
    }

    res.json({
      ...transaction,
      gasUsed: transaction.gasUsed.toString(),
      gasWanted: transaction.gasWanted.toString(),
      zkosDecodedData,
    });
  } catch (error) {
    console.error('Error fetching transaction:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
