import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import crypto from 'crypto';
import { withCache, CACHE_TTL, CACHE_KEYS } from '../cache.js';
import { config } from '../config.js';

const router = Router();
const prisma = new PrismaClient();
const LCD_URL = config.lcdUrl;

// Validation schemas
const validatorsQuerySchema = z.object({
  status: z.string().optional().default('BOND_STATUS_BONDED'),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

// LCD Validator interfaces
interface LcdStakingValidator {
  operator_address: string;
  jailed: boolean;
  status: string;
  tokens: string;
  description: {
    moniker: string;
    identity?: string;
    website?: string;
    details?: string;
  };
  commission?: {
    commission_rates?: {
      rate?: string;
      max_rate?: string;
      max_change_rate?: string;
    };
  };
}

interface LcdValidatorsResponse {
  validators: LcdStakingValidator[];
  pagination?: {
    next_key: string | null;
    total?: string;
  };
}

interface LcdStakingValidatorFull extends LcdStakingValidator {
  consensus_pubkey?: { '@type': string; key: string };
}

interface LcdStakingValidatorsFullResponse {
  validators: LcdStakingValidatorFull[];
  pagination?: { next_key: string | null; total?: string };
}

// Derive the base64 proposer address from an operator address
// 1. Fetch staking validators to get consensus_pubkey for the operator address
// 2. SHA256(base64_decode(pubkey)) → take first 20 bytes → base64 encode
async function getProposerAddress(operatorAddress: string): Promise<string | null> {
  const cacheKey = `cache:proposer-map:${operatorAddress}`;

  return withCache(cacheKey, CACHE_TTL.VALIDATORS, async () => {
    const url = new URL(`${LCD_URL}/cosmos/staking/v1beta1/validators`);
    url.searchParams.set('pagination.limit', '200');

    const response = await fetch(url.toString());
    if (!response.ok) return null;

    const data = (await response.json()) as LcdStakingValidatorsFullResponse;
    const validator = data.validators.find((v) => v.operator_address === operatorAddress);
    if (!validator?.consensus_pubkey?.key) return null;

    const pubkeyBytes = Buffer.from(validator.consensus_pubkey.key, 'base64');
    const sha256Hash = crypto.createHash('sha256').update(pubkeyBytes).digest();
    const first20 = sha256Hash.subarray(0, 20);
    return first20.toString('base64');
  });
}

// GET /api/validators - List validators (cached, queries LCD)
router.get('/', async (req: Request, res: Response) => {
  try {
    const { status, limit } = validatorsQuerySchema.parse(req.query);
    const cacheKey = CACHE_KEYS.VALIDATORS(status, limit);

    const data = await withCache(
      cacheKey,
      CACHE_TTL.VALIDATORS,
      async () => {
        const url = new URL(`${LCD_URL}/cosmos/staking/v1beta1/validators`);
        url.searchParams.set('status', status);
        url.searchParams.set('pagination.limit', String(limit));

        const response = await fetch(url.toString());
        if (!response.ok) {
          throw new Error(`LCD API error: ${response.status}`);
        }

        const lcdData = (await response.json()) as LcdValidatorsResponse;
        return lcdData;
      }
    );

    res.json(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid query parameters', details: error.errors });
    }
    console.error('Error fetching validators:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/validators/count - Get validator count (cached, queries LCD)
router.get('/count', async (req: Request, res: Response) => {
  try {
    const status = (req.query.status as string) || 'BOND_STATUS_BONDED';
    const cacheKey = CACHE_KEYS.VALIDATOR_COUNT(status);

    const count = await withCache(
      cacheKey,
      CACHE_TTL.VALIDATOR_COUNT,
      async () => {
        const url = new URL(`${LCD_URL}/cosmos/staking/v1beta1/validators`);
        url.searchParams.set('status', status);
        url.searchParams.set('pagination.limit', '1');
        url.searchParams.set('pagination.count_total', 'true');

        const response = await fetch(url.toString());
        if (!response.ok) {
          throw new Error(`LCD API error: ${response.status}`);
        }

        const data = (await response.json()) as LcdValidatorsResponse;
        const total = data.pagination?.total;
        return total ? parseInt(total, 10) : (data.validators?.length ?? 0);
      }
    );

    res.json({ count });
  } catch (error) {
    console.error('Error fetching validator count:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/validators/:address/blocks - Get block production stats for a validator (from DB, not LCD)
// This must come before /:address to avoid route conflicts
router.get('/:address/blocks', async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    if (!address) {
      return res.status(400).json({ error: 'Validator address required' });
    }

    const cacheKey = CACHE_KEYS.VALIDATOR_BLOCKS(address);

    const stats = await withCache(
      cacheKey,
      CACHE_TTL.VALIDATOR_BLOCKS,
      async () => {
        // Map operator address to the base64 consensus proposer address stored in blocks
        const proposerAddress = await getProposerAddress(address);
        if (!proposerAddress) {
          return {
            totalBlocks: 0,
            blocks24h: 0,
            blocks7d: 0,
            percentage: 0,
            lastBlock: null,
          };
        }

        // Get total blocks produced
        const totalBlocks = await prisma.block.count({
          where: { proposer: proposerAddress },
        });

        // Get blocks in last 24h
        const blocks24h = await prisma.block.count({
          where: {
            proposer: proposerAddress,
            timestamp: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          },
        });

        // Get blocks in last 7d
        const blocks7d = await prisma.block.count({
          where: {
            proposer: proposerAddress,
            timestamp: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
          },
        });

        // Get last block proposed
        const lastBlock = await prisma.block.findFirst({
          where: { proposer: proposerAddress },
          orderBy: { height: 'desc' },
          select: {
            height: true,
            hash: true,
            timestamp: true,
          },
        });

        // Get total blocks for percentage calculation
        const totalChainBlocks = await prisma.block.count();
        const percentage = totalChainBlocks > 0 ? (totalBlocks / totalChainBlocks) * 100 : 0;

        return {
          totalBlocks,
          blocks24h,
          blocks7d,
          percentage: Math.round(percentage * 100) / 100,
          lastBlock: lastBlock
            ? {
                height: lastBlock.height,
                hash: lastBlock.hash,
                timestamp: lastBlock.timestamp,
              }
            : null,
        };
      }
    );

    res.json(stats);
  } catch (error) {
    console.error('Error fetching validator block stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/validators/:address - Get single validator details (cached, queries LCD)
// This must come after /:address/blocks to avoid route conflicts
router.get('/:address', async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    if (!address) {
      return res.status(400).json({ error: 'Validator address required' });
    }

    const cacheKey = `cache:validator:${address}`;

    const validator = await withCache(
      cacheKey,
      CACHE_TTL.VALIDATORS,
      async () => {
        const url = new URL(`${LCD_URL}/cosmos/staking/v1beta1/validators/${address}`);

        const response = await fetch(url.toString());
        if (!response.ok) {
          if (response.status === 404) {
            return null;
          }
          throw new Error(`LCD API error: ${response.status}`);
        }

        const data = (await response.json()) as { validator: LcdStakingValidator };
        return data.validator;
      }
    );

    if (!validator) {
      return res.status(404).json({ error: 'Validator not found' });
    }

    res.json(validator);
  } catch (error) {
    console.error('Error fetching validator:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
