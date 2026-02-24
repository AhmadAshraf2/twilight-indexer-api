import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { withCache, CACHE_TTL, CACHE_KEYS } from '../cache.js';

const router = Router();
const prisma = new PrismaClient();

// GET /api/stats - Get overall chain statistics
router.get('/', async (req: Request, res: Response) => {
  try {
    const stats = await withCache(
      CACHE_KEYS.STATS,
      CACHE_TTL.STATS,
      async () => {
        const [
          latestBlock,
          totalBlocks,
          totalTxs,
          totalAccounts,
          recentTxCount,
          txByStatus,
        ] = await Promise.all([
          prisma.block.findFirst({ orderBy: { height: 'desc' } }),
          prisma.block.count(),
          prisma.transaction.count(),
          prisma.account.count(),
          // Transactions in last 24 hours
          prisma.transaction.count({
            where: {
              blockTime: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
            },
          }),
          prisma.transaction.groupBy({
            by: ['status'],
            _count: { status: true },
          }),
        ]);

        const statusStats = txByStatus.reduce(
          (acc, s) => {
            acc[s.status] = s._count.status;
            return acc;
          },
          {} as Record<string, number>
        );

        return {
          latestBlock: latestBlock
            ? {
                height: latestBlock.height,
                hash: latestBlock.hash,
                timestamp: latestBlock.timestamp,
              }
            : null,
          totalBlocks,
          totalTransactions: totalTxs,
          totalAccounts,
          transactionsLast24h: recentTxCount,
          transactionsByStatus: statusStats,
        };
      }
    );

    res.json(stats);
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/stats/charts/blocks - Get block production chart data
router.get('/charts/blocks', async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 7;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const blocks = await prisma.block.findMany({
      where: { timestamp: { gte: since } },
      orderBy: { timestamp: 'asc' },
      select: {
        height: true,
        timestamp: true,
        txCount: true,
        gasUsed: true,
      },
    });

    // Group by day
    const dailyStats = blocks.reduce(
      (acc, block) => {
        const day = block.timestamp.toISOString().split('T')[0];
        if (!acc[day]) {
          acc[day] = { blocks: 0, transactions: 0, gasUsed: BigInt(0) };
        }
        acc[day].blocks++;
        acc[day].transactions += block.txCount;
        acc[day].gasUsed += block.gasUsed;
        return acc;
      },
      {} as Record<string, { blocks: number; transactions: number; gasUsed: bigint }>
    );

    const chartData = Object.entries(dailyStats).map(([date, stats]) => ({
      date,
      blocks: stats.blocks,
      transactions: stats.transactions,
      gasUsed: stats.gasUsed.toString(),
    }));

    res.json(chartData);
  } catch (error) {
    console.error('Error fetching block chart data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/stats/charts/transactions - Get transaction chart data
router.get('/charts/transactions', async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 7;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const transactions = await prisma.transaction.findMany({
      where: { blockTime: { gte: since } },
      orderBy: { blockTime: 'asc' },
      select: {
        blockTime: true,
        type: true,
        status: true,
      },
    });

    // Group by day and type
    const dailyStats = transactions.reduce(
      (acc, tx) => {
        const day = tx.blockTime.toISOString().split('T')[0];
        if (!acc[day]) {
          acc[day] = { total: 0, success: 0, failed: 0, byModule: {} };
        }
        acc[day].total++;
        acc[day][tx.status as 'success' | 'failed']++;

        // Extract module from type
        const module = tx.type.includes('.bridge.')
          ? 'bridge'
          : tx.type.includes('.forks.')
            ? 'forks'
            : tx.type.includes('.volt.')
              ? 'volt'
              : tx.type.includes('.zkos.')
                ? 'zkos'
                : 'other';

        acc[day].byModule[module] = (acc[day].byModule[module] || 0) + 1;
        return acc;
      },
      {} as Record<
        string,
        { total: number; success: number; failed: number; byModule: Record<string, number> }
      >
    );

    const chartData = Object.entries(dailyStats).map(([date, stats]) => ({
      date,
      ...stats,
    }));

    res.json(chartData);
  } catch (error) {
    console.error('Error fetching transaction chart data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/stats/modules - Get module-level statistics
router.get('/modules', async (req: Request, res: Response) => {
  try {
    const moduleStats = await withCache(
      CACHE_KEYS.MODULE_STATS,
      CACHE_TTL.MODULE_STATS,
      async () => {
        const [deposits, withdrawals, zkosTransfers, zkosMintBurns, delegateKeys, fragments, activeFragments] =
          await Promise.all([
            prisma.btcDeposit.count(),
            prisma.btcWithdrawal.count(),
            prisma.zkosTransfer.count(),
            prisma.zkosMintBurn.count(),
            prisma.delegateKey.count(),
            prisma.fragment.count(),
            // Count distinct fragment IDs from signers (fragments with activity)
            prisma.fragmentSigner.groupBy({
              by: ['fragmentId'],
            }).then(groups => groups.length),
          ]);

        // Get volume stats
        const [depositVolume, withdrawalVolume, mintBurnVolume] = await Promise.all([
          prisma.btcDeposit.aggregate({ _sum: { depositAmount: true } }),
          prisma.btcWithdrawal.aggregate({ _sum: { withdrawAmount: true } }),
          prisma.zkosMintBurn.aggregate({ _sum: { btcValue: true } }),
        ]);

        return {
          bridge: {
            deposits,
            withdrawals,
            depositVolume: (depositVolume._sum.depositAmount || BigInt(0)).toString(),
            withdrawalVolume: (withdrawalVolume._sum.withdrawAmount || BigInt(0)).toString(),
          },
          forks: {
            delegateKeys,
          },
          volt: {
            fragments,
            activeFragments,
          },
          zkos: {
            transfers: zkosTransfers,
            mintBurns: zkosMintBurns,
            volume: (mintBurnVolume._sum.btcValue || BigInt(0)).toString(),
          },
        };
      }
    );

    res.json(moduleStats);
  } catch (error) {
    console.error('Error fetching module stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/stats/network-performance - Get network performance metrics
router.get('/network-performance', async (req: Request, res: Response) => {
  try {
    const networkPerf = await withCache(
      'network-performance',
      CACHE_TTL.STATS, // Use same cache TTL as stats
      async () => {
        // Get last 100 blocks for block time calculation
        const recentBlocks = await prisma.block.findMany({
          orderBy: { height: 'desc' },
          take: 100,
          select: {
            height: true,
            timestamp: true,
            txCount: true,
            gasUsed: true,
            gasWanted: true,
          },
        });

        // Calculate average block time
        let totalBlockTime = 0;
        let blockTimeCount = 0;
        for (let i = 1; i < recentBlocks.length; i++) {
          const timeDiff =
            (recentBlocks[i - 1].timestamp.getTime() - recentBlocks[i].timestamp.getTime()) / 1000;
          if (timeDiff > 0 && timeDiff < 3600) {
            // Sanity check: block time should be positive and less than 1 hour
            totalBlockTime += timeDiff;
            blockTimeCount++;
          }
        }
        const averageBlockTime = blockTimeCount > 0 ? totalBlockTime / blockTimeCount : 0;

        // Calculate TPS from last 24h
        const transactionsLast24h = await prisma.transaction.count({
          where: {
            blockTime: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          },
        });
        const tps = transactionsLast24h / (24 * 60 * 60);

        // Calculate block production rate (last hour)
        const blocksLastHour = await prisma.block.count({
          where: {
            timestamp: { gte: new Date(Date.now() - 60 * 60 * 1000) },
          },
        });

        // Calculate gas utilization
        let totalUtilization = 0;
        let utilizationCount = 0;
        for (const block of recentBlocks) {
          if (block.gasWanted > 0) {
            const utilization = Number(block.gasUsed) / Number(block.gasWanted);
            if (utilization >= 0 && utilization <= 1) {
              // Sanity check
              totalUtilization += utilization;
              utilizationCount++;
            }
          }
        }
        const gasUtilization = utilizationCount > 0 ? totalUtilization / utilizationCount : 0;

        // Top proposers
        const proposerStats = await prisma.block.groupBy({
          by: ['proposer'],
          where: { proposer: { not: null } },
          _count: { proposer: true },
          orderBy: { _count: { proposer: 'desc' } },
          take: 10,
        });

        const totalBlocks = await prisma.block.count();
        const proposerDistribution = proposerStats
          .filter((p) => p.proposer)
          .map((p) => ({
            address: p.proposer!,
            blocks: p._count.proposer,
            percentage: totalBlocks > 0 ? (p._count.proposer / totalBlocks) * 100 : 0,
          }));

        return {
          averageBlockTime: Math.round(averageBlockTime * 100) / 100,
          tps: Math.round(tps * 100) / 100,
          blockProductionRate: blocksLastHour,
          gasUtilization: Math.round(gasUtilization * 100),
          proposerDistribution,
        };
      }
    );

    res.json(networkPerf);
  } catch (error) {
    console.error('Error fetching network performance:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/stats/active-accounts - Get active account statistics
router.get('/active-accounts', async (req: Request, res: Response) => {
  try {
    const activeAccounts = await withCache(
      'active-accounts',
      CACHE_TTL.STATS,
      async () => {
        const now = new Date();
        const [active24h, active7d, active30d, newAccounts24h, totalAccounts] = await Promise.all([
          prisma.account.count({
            where: {
              lastSeen: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
            },
          }),
          prisma.account.count({
            where: {
              lastSeen: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
            },
          }),
          prisma.account.count({
            where: {
              lastSeen: { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) },
            },
          }),
          prisma.account.count({
            where: {
              firstSeen: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
            },
          }),
          prisma.account.count(),
        ]);

        // Calculate growth rate (new accounts in 24h / total accounts)
        const growthRate = totalAccounts > 0 ? (newAccounts24h / totalAccounts) * 100 : 0;

        return {
          active24h,
          active7d,
          active30d,
          newAccounts24h,
          growthRate: Math.round(growthRate * 100) / 100,
        };
      }
    );

    res.json(activeAccounts);
  } catch (error) {
    console.error('Error fetching active accounts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/stats/bridge-analytics - Get BTC bridge analytics
router.get('/bridge-analytics', async (req: Request, res: Response) => {
  try {
    const bridgeAnalytics = await withCache(
      'bridge-analytics',
      CACHE_TTL.STATS,
      async () => {
        const now = new Date();
        const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        // Get all-time volumes
        const [depositVolume, withdrawalVolume] = await Promise.all([
          prisma.btcDeposit.aggregate({ _sum: { depositAmount: true } }),
          prisma.btcWithdrawal.aggregate({ _sum: { withdrawAmount: true } }),
        ]);

        const totalDepositVolume = depositVolume._sum.depositAmount || BigInt(0);
        const totalWithdrawalVolume = withdrawalVolume._sum.withdrawAmount || BigInt(0);
        const totalVolume = totalDepositVolume + totalWithdrawalVolume;

        // Get 24h volumes
        const [depositVolume24h, withdrawalVolume24h] = await Promise.all([
          prisma.btcDeposit.aggregate({
            where: { createdAt: { gte: last24h } },
            _sum: { depositAmount: true },
          }),
          prisma.btcWithdrawal.aggregate({
            where: { createdAt: { gte: last24h } },
            _sum: { withdrawAmount: true },
          }),
        ]);

        // Get withdrawal status counts
        const [pendingWithdrawals, confirmedWithdrawals, totalWithdrawals] = await Promise.all([
          prisma.btcWithdrawal.count({
            where: { isConfirmed: false },
          }),
          prisma.btcWithdrawal.count({
            where: { isConfirmed: true },
          }),
          prisma.btcWithdrawal.count(),
        ]);

        // Get average sizes
        const [avgDeposit, avgWithdrawal] = await Promise.all([
          prisma.btcDeposit.aggregate({
            _avg: { depositAmount: true },
          }),
          prisma.btcWithdrawal.aggregate({
            _avg: { withdrawAmount: true },
          }),
        ]);

        const withdrawalSuccessRate =
          totalWithdrawals > 0 ? (confirmedWithdrawals / totalWithdrawals) * 100 : 0;

        return {
          totalVolume: totalVolume.toString(),
          depositVolume24h: (depositVolume24h._sum.depositAmount || BigInt(0)).toString(),
          withdrawalVolume24h: (withdrawalVolume24h._sum.withdrawAmount || BigInt(0)).toString(),
          pendingWithdrawals,
          confirmedWithdrawals,
          averageDepositSize: (avgDeposit._avg.depositAmount || BigInt(0)).toString(),
          averageWithdrawalSize: (avgWithdrawal._avg.withdrawAmount || BigInt(0)).toString(),
          withdrawalSuccessRate: Math.round(withdrawalSuccessRate * 100) / 100,
        };
      }
    );

    res.json(bridgeAnalytics);
  } catch (error) {
    console.error('Error fetching bridge analytics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/stats/fragment-health - Get fragment health metrics
router.get('/fragment-health', async (req: Request, res: Response) => {
  try {
    const fragmentHealth = await withCache(
      'fragment-health',
      CACHE_TTL.STATS,
      async () => {
        // Get fragment counts by status
        const [totalFragments, activeFragments, bootstrappingFragments, inactiveFragments] =
          await Promise.all([
            prisma.fragment.count(),
            prisma.fragment.count({ where: { status: 'active' } }),
            prisma.fragment.count({ where: { status: 'bootstrapping' } }),
            prisma.fragment.count({ where: { status: 'inactive' } }),
          ]);

        // Get signer statistics
        const [signerStats, fragmentSignerCounts] = await Promise.all([
          prisma.fragmentSigner.groupBy({
            by: ['fragmentId'],
            _count: { fragmentId: true },
          }),
          prisma.fragmentSigner.count(),
        ]);

        const averageSignersPerFragment =
          signerStats.length > 0 ? fragmentSignerCounts / signerStats.length : 0;

        const fragmentSuccessRate =
          totalFragments > 0 ? (activeFragments / totalFragments) * 100 : 0;

        // Get average fee pool
        const avgFeePool = await prisma.fragment.aggregate({
          _avg: { signerApplicationFee: true },
        });

        // Get top fragments by fee pool (if we had feePool field, using signerApplicationFee as proxy)
        const topFragments = await prisma.fragment.findMany({
          orderBy: { signerApplicationFee: 'desc' },
          take: 10,
          select: {
            id: true,
            judgeAddress: true,
            signerApplicationFee: true,
            numOfSigners: true,
            status: true,
          },
        });

        // Count signers per fragment for top fragments
        const topFragmentsWithSigners = await Promise.all(
          topFragments.map(async (fragment) => {
            const signerCount = await prisma.fragmentSigner.count({
              where: { fragmentId: fragment.id },
            });
            return {
              fragmentId: fragment.id.toString(),
              judgeAddress: fragment.judgeAddress,
              feePool: fragment.signerApplicationFee.toString(),
              signersCount: signerCount,
              status: fragment.status,
            };
          })
        );

        return {
          totalFragments,
          activeFragments,
          bootstrappingFragments,
          inactiveFragments,
          averageSignersPerFragment: Math.round(averageSignersPerFragment * 100) / 100,
          totalSigners: fragmentSignerCounts,
          fragmentSuccessRate: Math.round(fragmentSuccessRate * 100) / 100,
          averageFeePool: (avgFeePool._avg.signerApplicationFee || BigInt(0)).toString(),
          topFragments: topFragmentsWithSigners,
        };
      }
    );

    res.json(fragmentHealth);
  } catch (error) {
    console.error('Error fetching fragment health:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
