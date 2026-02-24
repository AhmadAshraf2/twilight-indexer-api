import { Router, Request, Response } from 'express';
import { withCache, CACHE_TTL } from '../cache.js';
import { config } from '../config.js';

const router = Router();

const BTC_RPC_URL = config.btcRpc.url;
const BTC_RPC_AUTH = Buffer.from(`${config.btcRpc.user}:${config.btcRpc.password}`).toString('base64');

async function btcRpc(method: string, params: unknown[] = []): Promise<unknown> {
  const response = await fetch(BTC_RPC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${BTC_RPC_AUTH}`,
    },
    body: JSON.stringify({ jsonrpc: '1.0', id: method, method, params }),
  });

  if (!response.ok) {
    throw new Error(`BTC RPC error: ${response.status}`);
  }

  const data = (await response.json()) as { result: unknown; error: unknown };
  if (data.error) {
    throw new Error(`BTC RPC error: ${JSON.stringify(data.error)}`);
  }

  return data.result;
}

// GET /api/bitcoin/info - Get latest block height and fee estimates
router.get('/info', async (req: Request, res: Response) => {
  try {
    const info = await withCache('cache:btc:info', 30, async () => {
      const [blockCount, feeEstimate] = await Promise.all([
        btcRpc('getblockcount') as Promise<number>,
        btcRpc('estimatesmartfee', [6]) as Promise<{ feerate?: number; errors?: string[]; blocks: number }>,
      ]);

      return {
        blockHeight: blockCount,
        feeEstimate: {
          satPerVbyte: feeEstimate.feerate
            ? Math.ceil((feeEstimate.feerate * 100_000_000) / 1000) // BTC/kB → sat/vB
            : null,
          btcPerKb: feeEstimate.feerate ?? null,
          targetBlocks: feeEstimate.blocks,
        },
      };
    });

    res.json(info);
  } catch (error) {
    console.error('Error fetching BTC info:', error);
    res.status(500).json({ error: 'Failed to fetch Bitcoin node data' });
  }
});

export default router;
