import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { config } from '../config.js';
import { withCache, getCache, CACHE_TTL, CACHE_KEYS } from '../cache.js';

const router = Router();
const prisma = new PrismaClient();

// LCD API base URL
const LCD_URL = config.lcdUrl;

// Validation schemas
const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ============================================
// BTC Deposits
// ============================================

// GET /api/twilight/deposits - List BTC deposits
router.get('/deposits', async (req: Request, res: Response) => {
  try {
    const { page, limit } = paginationSchema.parse(req.query);
    const address = req.query.address as string | undefined;
    const reserveAddress = req.query.reserveAddress as string | undefined;
    const search = req.query.search as string | undefined;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (search?.trim()) {
      const q = search.trim();
      where.OR = [
        { twilightDepositAddress: { contains: q, mode: 'insensitive' } },
        { reserveAddress: { contains: q, mode: 'insensitive' } },
      ];
    } else {
      if (address?.trim()) {
        where.twilightDepositAddress = { contains: address.trim(), mode: 'insensitive' };
      }
      if (reserveAddress?.trim()) {
        where.reserveAddress = { contains: reserveAddress.trim(), mode: 'insensitive' };
      }
    }

    const [deposits, total] = await Promise.all([
      prisma.btcDeposit.findMany({
        where,
        orderBy: { blockHeight: 'desc' },
        skip,
        take: limit,
      }),
      prisma.btcDeposit.count({ where }),
    ]);

    const serialized = deposits.map((d) => ({
      ...d,
      depositAmount: d.depositAmount.toString(),
      btcHeight: d.btcHeight.toString(),
    }));

    res.json({
      data: serialized,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching deposits:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/twilight/deposits/:id - Get deposit by ID
router.get('/deposits/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid deposit ID' });
    }

    const deposit = await prisma.btcDeposit.findUnique({ where: { id } });

    if (!deposit) {
      return res.status(404).json({ error: 'Deposit not found' });
    }

    res.json({
      ...deposit,
      depositAmount: deposit.depositAmount.toString(),
      btcHeight: deposit.btcHeight.toString(),
    });
  } catch (error) {
    console.error('Error fetching deposit:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================
// BTC Withdrawals
// ============================================

// GET /api/twilight/withdrawals - List BTC withdrawals
router.get('/withdrawals', async (req: Request, res: Response) => {
  try {
    const { page, limit } = paginationSchema.parse(req.query);
    const confirmed = req.query.confirmed as string | undefined;
    const address = req.query.address as string | undefined;
    const withdrawAddress = req.query.withdrawAddress as string | undefined;
    const search = req.query.search as string | undefined;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (confirmed === 'true') where.isConfirmed = true;
    if (confirmed === 'false') where.isConfirmed = false;
    if (search?.trim()) {
      const q = search.trim();
      where.OR = [
        { twilightAddress: { contains: q, mode: 'insensitive' } },
        { withdrawAddress: { contains: q, mode: 'insensitive' } },
      ];
    } else {
      if (address?.trim()) {
        where.twilightAddress = { contains: address.trim(), mode: 'insensitive' };
      }
      if (withdrawAddress?.trim()) {
        where.withdrawAddress = { contains: withdrawAddress.trim(), mode: 'insensitive' };
      }
    }

    const [withdrawals, total] = await Promise.all([
      prisma.btcWithdrawal.findMany({
        where,
        orderBy: { blockHeight: 'desc' },
        skip,
        take: limit,
      }),
      prisma.btcWithdrawal.count({ where }),
    ]);

    const serialized = withdrawals.map((w) => ({
      ...w,
      withdrawAmount: w.withdrawAmount.toString(),
    }));

    res.json({
      data: serialized,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching withdrawals:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/twilight/withdrawals/:id - Get withdrawal by ID
router.get('/withdrawals/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid withdrawal ID' });
    }

    const withdrawal = await prisma.btcWithdrawal.findUnique({ where: { id } });

    if (!withdrawal) {
      return res.status(404).json({ error: 'Withdrawal not found' });
    }

    res.json({
      ...withdrawal,
      withdrawAmount: withdrawal.withdrawAmount.toString(),
    });
  } catch (error) {
    console.error('Error fetching withdrawal:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================
// Reserves
// ============================================

// GET /api/twilight/reserves - List reserves
router.get('/reserves', async (req: Request, res: Response) => {
  try {
    const reserves = await prisma.reserve.findMany({
      orderBy: { id: 'asc' },
    });

    const serialized = reserves.map((r) => ({
      ...r,
      id: r.id.toString(),
      btcRelayCapacityValue: r.btcRelayCapacityValue.toString(),
      totalValue: r.totalValue.toString(),
      privatePoolValue: r.privatePoolValue.toString(),
      publicValue: r.publicValue.toString(),
      feePool: r.feePool.toString(),
      unlockHeight: r.unlockHeight.toString(),
      roundId: r.roundId.toString(),
    }));

    res.json(serialized);
  } catch (error) {
    console.error('Error fetching reserves:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/twilight/reserves/:id - Get reserve by ID
router.get('/reserves/:id', async (req: Request, res: Response) => {
  try {
    const id = BigInt(req.params.id);

    const reserve = await prisma.reserve.findUnique({ where: { id } });

    if (!reserve) {
      return res.status(404).json({ error: 'Reserve not found' });
    }

    res.json({
      ...reserve,
      id: reserve.id.toString(),
      btcRelayCapacityValue: reserve.btcRelayCapacityValue.toString(),
      totalValue: reserve.totalValue.toString(),
      privatePoolValue: reserve.privatePoolValue.toString(),
      publicValue: reserve.publicValue.toString(),
      feePool: reserve.feePool.toString(),
      unlockHeight: reserve.unlockHeight.toString(),
      roundId: reserve.roundId.toString(),
    });
  } catch (error) {
    console.error('Error fetching reserve:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================
// Sweep Addresses (Bridge - LCD)
// ============================================

// GET /api/twilight/sweep-addresses - Fetch propose sweep addresses from LCD (cached)
router.get('/sweep-addresses', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 200);
    const data = await withCache(
      CACHE_KEYS.SWEEP_ADDRESSES(limit),
      CACHE_TTL.SWEEP_ADDRESSES,
      async () => {
        const response = await fetch(
          `${LCD_URL}/twilight-project/nyks/bridge/propose_sweep_addresses_all/${limit}`
        );
        if (!response.ok) {
          throw new Error(`LCD API error: ${response.status}`);
        }
        return response.json();
      }
    );
    res.json(data);
  } catch (error) {
    console.error('Error fetching sweep addresses from LCD:', error);
    res.status(500).json({ error: 'Failed to fetch sweep addresses from LCD' });
  }
});

// ============================================
// Fragments
// ============================================

// GET /api/twilight/fragments/live - Fetch fragments from LCD (cached)
// NOTE: This route MUST be before /fragments/:id to avoid "live" being matched as an ID
router.get('/fragments/live', async (req: Request, res: Response) => {
  try {
    const data = await withCache(
      CACHE_KEYS.FRAGMENTS_LIVE,
      CACHE_TTL.FRAGMENTS,
      async () => {
        const response = await fetch(`${LCD_URL}/twilight-project/nyks/volt/get_all_fragments`);
        if (!response.ok) {
          throw new Error(`LCD API error: ${response.status}`);
        }
        const raw = await response.json() as any;

        const fragments = (raw.Fragments || []).map((f: any) => ({
          id: f.FragmentId,
          status: f.FragmentStatus,
          judgeAddress: f.JudgeAddress,
          judgeStatus: f.JudgeStatus,
          threshold: parseInt(f.Threshold || '0', 10),
          signerApplicationFee: f.SignerApplicationFee,
          feePool: f.FeePool,
          feeBips: parseInt(f.FragmentFeeBips || '0', 10),
          arbitraryData: f.arbitraryData || null,
          reserveIds: f.ReserveIds || [],
          signers: (f.Signers || []).map((s: any) => ({
            fragmentId: s.FragmentID,
            signerAddress: s.SignerAddress,
            status: s.SignerStatus,
            btcPubKey: s.SignerBtcPublicKey,
            applicationFee: s.SignerApplicationFee,
            feeBips: parseInt(s.SignerFeeBips || '0', 10),
          })),
          signersCount: (f.Signers || []).length,
        }));

        return { data: fragments, total: fragments.length };
      }
    );

    res.json(data);
  } catch (error) {
    console.error('Error fetching fragments from LCD:', error);
    res.status(500).json({ error: 'Failed to fetch fragments from LCD' });
  }
});

// Transform raw LCD fragment to API format
function transformFragment(f: any, id: string) {
  return {
    id: f.FragmentId ?? id,
    status: f.FragmentStatus,
    judgeAddress: f.JudgeAddress,
    judgeStatus: f.JudgeStatus,
    threshold: parseInt(f.Threshold || '0', 10),
    signerApplicationFee: f.SignerApplicationFee,
    feePool: f.FeePool,
    feeBips: parseInt(f.FragmentFeeBips || '0', 10),
    arbitraryData: f.arbitraryData || null,
    reserveIds: f.ReserveIds || [],
    signers: (f.Signers || []).map((s: any) => ({
      fragmentId: s.FragmentID,
      signerAddress: s.SignerAddress,
      status: s.SignerStatus,
      btcPubKey: s.SignerBtcPublicKey,
      applicationFee: s.SignerApplicationFee,
      feeBips: parseInt(s.SignerFeeBips || '0', 10),
    })),
    signersCount: (f.Signers || []).length,
  };
}

// GET /api/twilight/fragments/live/:id - Fetch single fragment from LCD (cached)
// NOTE: Must be after /fragments/live to match /fragments/live/:id
// Uses get_all_fragments and finds by id (reuses cached list when available)
router.get('/fragments/live/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id;

    // Try cached fragments list first (avoids extra LCD call when list was recently fetched)
    const cachedList = await getCache<{ data: any[]; total: number }>(CACHE_KEYS.FRAGMENTS_LIVE);
    if (cachedList?.data) {
      const found = cachedList.data.find((f: any) => String(f.id) === String(id));
      if (found) {
        return res.json(found);
      }
      // Fragment not in list - return 404 without extra LCD call
      return res.status(404).json({ error: 'Fragment not found' });
    }

    // Fetch via cache: get all fragments and find by id
    const data = await withCache(
      CACHE_KEYS.FRAGMENT_SINGLE(id),
      CACHE_TTL.FRAGMENT_SINGLE,
      async () => {
        const response = await fetch(`${LCD_URL}/twilight-project/nyks/volt/get_all_fragments`);
        if (!response.ok) {
          throw new Error(`LCD API error: ${response.status}`);
        }
        const raw = await response.json() as any;
        const fragments = raw.Fragments || raw.fragments || [];
        const fragment = fragments.find(
          (f: any) =>
            String(f.FragmentId ?? f.fragmentId ?? f.id ?? '') === String(id)
        );
        if (fragment) {
          return transformFragment(fragment, id);
        }
        return null;
      }
    );

    if (!data) {
      return res.status(404).json({ error: 'Fragment not found' });
    }

    res.json(data);
  } catch (error) {
    console.error('Error fetching fragment from LCD:', error);
    res.status(500).json({ error: 'Failed to fetch fragment from LCD' });
  }
});

// GET /api/twilight/fragments - List fragments from database
router.get('/fragments', async (req: Request, res: Response) => {
  try {
    const { page, limit } = paginationSchema.parse(req.query);
    const skip = (page - 1) * limit;

    const [fragments, total] = await Promise.all([
      prisma.fragment.findMany({
        orderBy: { id: 'asc' },
        skip,
        take: limit,
      }),
      prisma.fragment.count(),
    ]);

    const serialized = fragments.map((f) => ({
      ...f,
      id: f.id.toString(),
      signerApplicationFee: f.signerApplicationFee.toString(),
    }));

    res.json({
      data: serialized,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching fragments:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/twilight/fragments/:id - Get fragment by ID with signers
router.get('/fragments/:id', async (req: Request, res: Response) => {
  try {
    const id = BigInt(req.params.id);

    const fragment = await prisma.fragment.findUnique({
      where: { id },
    });

    if (!fragment) {
      return res.status(404).json({ error: 'Fragment not found' });
    }

    // Get signers for this fragment
    const signers = await prisma.fragmentSigner.findMany({
      where: { fragmentId: id },
      orderBy: { blockHeight: 'desc' },
    });

    const serializedSigners = signers.map((s) => ({
      ...s,
      fragmentId: s.fragmentId.toString(),
      applicationFee: s.applicationFee.toString(),
    }));

    res.json({
      ...fragment,
      id: fragment.id.toString(),
      signerApplicationFee: fragment.signerApplicationFee.toString(),
      signers: serializedSigners,
    });
  } catch (error) {
    console.error('Error fetching fragment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/twilight/fragment-signers - List all fragment signers
router.get('/fragment-signers', async (req: Request, res: Response) => {
  try {
    const { page, limit } = paginationSchema.parse(req.query);
    const fragmentId = req.query.fragmentId as string | undefined;
    const skip = (page - 1) * limit;

    const where = fragmentId ? { fragmentId: BigInt(fragmentId) } : {};

    const [signers, total] = await Promise.all([
      prisma.fragmentSigner.findMany({
        where,
        orderBy: { blockHeight: 'desc' },
        skip,
        take: limit,
      }),
      prisma.fragmentSigner.count({ where }),
    ]);

    const serialized = signers.map((s) => ({
      ...s,
      fragmentId: s.fragmentId.toString(),
      applicationFee: s.applicationFee.toString(),
    }));

    res.json({
      data: serialized,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching fragment signers:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================
// zkOS Operations
// ============================================

// GET /api/twilight/zkos/transfers - List zkOS transfers
router.get('/zkos/transfers', async (req: Request, res: Response) => {
  try {
    const { page, limit } = paginationSchema.parse(req.query);
    const skip = (page - 1) * limit;

    const [transfers, total] = await Promise.all([
      prisma.zkosTransfer.findMany({
        orderBy: { blockHeight: 'desc' },
        skip,
        take: limit,
      }),
      prisma.zkosTransfer.count(),
    ]);

    const serialized = transfers.map((t) => ({
      ...t,
      txFee: t.txFee.toString(),
    }));

    res.json({
      data: serialized,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching zkOS transfers:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/twilight/zkos/transfers/:txId - Get zkOS transfer by ID
router.get('/zkos/transfers/:txId', async (req: Request, res: Response) => {
  try {
    const { txId } = req.params;

    const transfer = await prisma.zkosTransfer.findUnique({
      where: { zkTxId: txId },
    });

    if (!transfer) {
      return res.status(404).json({ error: 'zkOS transfer not found' });
    }

    res.json({
      ...transfer,
      txFee: transfer.txFee.toString(),
    });
  } catch (error) {
    console.error('Error fetching zkOS transfer:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/twilight/zkos/mint-burns - List mint/burn operations
router.get('/zkos/mint-burns', async (req: Request, res: Response) => {
  try {
    const { page, limit } = paginationSchema.parse(req.query);
    const type = req.query.type as string | undefined;
    const skip = (page - 1) * limit;

    const where =
      type === 'mint' ? { mintOrBurn: true } : type === 'burn' ? { mintOrBurn: false } : {};

    const [operations, total] = await Promise.all([
      prisma.zkosMintBurn.findMany({
        where,
        orderBy: { blockHeight: 'desc' },
        skip,
        take: limit,
      }),
      prisma.zkosMintBurn.count({ where }),
    ]);

    const serialized = operations.map((op) => ({
      ...op,
      btcValue: op.btcValue.toString(),
    }));

    res.json({
      data: serialized,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching mint/burn operations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================
// Delegate Keys (Forks)
// ============================================

// GET /api/twilight/delegates - List delegate keys
router.get('/delegates', async (req: Request, res: Response) => {
  try {
    const delegates = await prisma.delegateKey.findMany({
      orderBy: { blockHeight: 'desc' },
    });

    res.json(delegates);
  } catch (error) {
    console.error('Error fetching delegate keys:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================
// Search
// ============================================

// GET /api/twilight/search - Search across all entities
router.get('/search', async (req: Request, res: Response) => {
  try {
    const query = req.query.q as string;

    if (!query || query.length < 3) {
      return res.status(400).json({ error: 'Search query must be at least 3 characters' });
    }

    // Determine what type of search based on query format
    const results: any = {};

    // Check if it's a block height
    if (/^\d+$/.test(query)) {
      const height = parseInt(query, 10);
      const block = await prisma.block.findUnique({
        where: { height },
        select: { height: true, hash: true, timestamp: true },
      });
      if (block) {
        results.block = block;
      }
    }

    // Check if it's a transaction hash (64 hex chars)
    if (/^[A-Fa-f0-9]{64}$/.test(query)) {
      const tx = await prisma.transaction.findUnique({
        where: { hash: query.toUpperCase() },
        select: { hash: true, blockHeight: true, type: true },
      });
      if (tx) {
        results.transaction = tx;
      }
    }

    // Check if it's a twilight address
    if (query.startsWith('twilight')) {
      const account = await prisma.account.findUnique({
        where: { address: query },
        select: { address: true, txCount: true },
      });
      if (account) {
        results.account = account;
      }
    }

    // Search in deposits
    const deposits = await prisma.btcDeposit.findMany({
      where: {
        OR: [
          { twilightDepositAddress: { contains: query } },
          { btcHash: { contains: query } },
        ],
      },
      take: 5,
    });
    if (deposits.length > 0) {
      results.deposits = deposits.map((d) => ({
        ...d,
        depositAmount: d.depositAmount.toString(),
        btcHeight: d.btcHeight.toString(),
      }));
    }

    res.json(results);
  } catch (error) {
    console.error('Error searching:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
