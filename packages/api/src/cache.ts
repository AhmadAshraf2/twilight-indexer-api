import Redis from 'ioredis';
import { config } from './config.js';

// Redis client for caching
let redisClient: Redis | null = null;

// Cache TTL in seconds
export const CACHE_TTL = {
  STATS: 30,           // 30 seconds for stats (updates frequently)
  MODULE_STATS: 60,    // 1 minute for module stats
  BLOCKS_LIST: 10,     // 10 seconds for blocks list
  TXS_LIST: 10,        // 10 seconds for transactions list
  TX_DETAIL: 300,      // 5 minutes for transaction details (immutable)
  ZKOS_DECODED: 3600,  // 1 hour for zkOS decoded data (immutable)
  VALIDATORS: 600,      // 10 minutes for validators (changes rarely)
  VALIDATOR_COUNT: 600, // 10 minutes for validator count
  VALIDATOR_BLOCKS: 30, // 30 seconds for validator block stats (from DB)
  FRAGMENTS: 600,      // 10 minutes for fragments (LCD)
  FRAGMENT_SINGLE: 600, // 10 minutes for single fragment (LCD)
  SWEEP_ADDRESSES: 600, // 10 minutes for sweep addresses (LCD)
} as const;

// Initialize Redis client
export function getRedisClient(): Redis | null {
  if (!redisClient) {
    try {
      redisClient = new Redis(config.redisUrl, {
        maxRetriesPerRequest: 3,
        retryStrategy: (times) => {
          if (times > 3) {
            console.warn('Redis connection failed, caching disabled');
            return null;
          }
          return Math.min(times * 100, 3000);
        },
      });

      redisClient.on('error', (err) => {
        console.error('Redis cache error:', err.message);
      });

      redisClient.on('connect', () => {
        console.log('Redis cache connected');
      });
    } catch (error) {
      console.warn('Failed to initialize Redis cache:', error);
      return null;
    }
  }
  return redisClient;
}

// Get cached value
export async function getCache<T>(key: string): Promise<T | null> {
  const client = getRedisClient();
  if (!client) return null;

  try {
    const data = await client.get(key);
    if (data) {
      return JSON.parse(data) as T;
    }
    return null;
  } catch (error) {
    console.error('Cache get error:', error);
    return null;
  }
}

// Set cached value with TTL
export async function setCache(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const client = getRedisClient();
  if (!client) return;

  try {
    await client.setex(key, ttlSeconds, JSON.stringify(value));
  } catch (error) {
    console.error('Cache set error:', error);
  }
}

// Delete cached value
export async function deleteCache(key: string): Promise<void> {
  const client = getRedisClient();
  if (!client) return;

  try {
    await client.del(key);
  } catch (error) {
    console.error('Cache delete error:', error);
  }
}

// Delete cached values by pattern
export async function deleteCachePattern(pattern: string): Promise<void> {
  const client = getRedisClient();
  if (!client) return;

  try {
    const keys = await client.keys(pattern);
    if (keys.length > 0) {
      await client.del(...keys);
    }
  } catch (error) {
    console.error('Cache delete pattern error:', error);
  }
}

// Cache wrapper function for easy use
export async function withCache<T>(
  key: string,
  ttlSeconds: number,
  fetchFn: () => Promise<T>
): Promise<T> {
  // Try to get from cache first
  const cached = await getCache<T>(key);
  if (cached !== null) {
    return cached;
  }

  // Fetch fresh data
  const data = await fetchFn();

  // Only cache successful results (never cache null/undefined to avoid 404 caching)
  if (data !== null && data !== undefined) {
    setCache(key, data, ttlSeconds).catch(() => {});
  }

  return data;
}

// Cache keys
export const CACHE_KEYS = {
  STATS: 'cache:stats',
  MODULE_STATS: 'cache:module-stats',
  BLOCKS_LIST: (page: number, limit: number) => `cache:blocks:${page}:${limit}`,
  TXS_LIST: (page: number, limit: number, filters: string) => `cache:txs:${page}:${limit}:${filters}`,
  TX_DETAIL: (hash: string) => `cache:tx:${hash}`,
  ZKOS_DECODED: (txHash: string) => `cache:zkos:${txHash}`,
  VALIDATORS: (status: string, limit: number) => `cache:validators:${status}:${limit}`,
  VALIDATOR_COUNT: (status: string) => `cache:validator-count:${status}`,
  VALIDATOR_BLOCKS: (address: string) => `cache:validator-blocks:${address}`,
  FRAGMENTS_LIVE: 'cache:fragments:live',
  FRAGMENT_SINGLE: (id: string) => `cache:fragment:${id}`,
  SWEEP_ADDRESSES: (limit: number) => `cache:sweep-addresses:${limit}`,
} as const;
