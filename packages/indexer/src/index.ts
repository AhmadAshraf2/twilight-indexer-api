import { PrismaClient } from '@prisma/client';
import { startSync, stopSync, getSyncStatus, indexerEvents } from './sync.js';
import { startEnrichment, stopEnrichment } from './enrichment.js';
import { lcdClient } from './lcd-client.js';
import { config } from './config.js';
import { logger } from './logger.js';
import Redis from 'ioredis';

const prisma = new PrismaClient();

// Redis client for pub/sub
let redis: Redis | null = null;

async function initRedis(): Promise<void> {
  try {
    redis = new Redis(config.redisUrl);
    redis.on('error', (err) => {
      logger.error({ err }, 'Redis connection error');
    });
    redis.on('connect', () => {
      logger.info('Redis connected');
    });
  } catch (error) {
    logger.warn({ error }, 'Redis not available, real-time updates disabled');
    redis = null;
  }
}

// JSON serializer that handles BigInt
function serializeForJson(data: unknown): string {
  return JSON.stringify(data, (_, value) =>
    typeof value === 'bigint' ? value.toString() : value
  );
}

// Publish events to Redis for WebSocket server
function setupEventPublishing(): void {
  if (!redis) return;

  indexerEvents.on('block:new', (block) => {
    redis!.publish('twilight:block:new', serializeForJson(block));
  });

  indexerEvents.on('tx:new', (tx) => {
    redis!.publish('twilight:tx:new', serializeForJson(tx));
  });

  indexerEvents.on('deposit:new', (deposit) => {
    redis!.publish('twilight:deposit:new', serializeForJson(deposit));
  });

  indexerEvents.on('withdrawal:new', (withdrawal) => {
    redis!.publish('twilight:withdrawal:new', serializeForJson(withdrawal));
  });
}

async function main(): Promise<void> {
  logger.info({ config: { ...config, databaseUrl: '***' } }, 'Starting Twilight indexer');

  // Test database connection
  try {
    await prisma.$connect();
    logger.info('Database connected');
  } catch (error) {
    logger.error({ error }, 'Failed to connect to database');
    process.exit(1);
  }

  // Test LCD connection
  try {
    const latestBlock = await lcdClient.getLatestBlock();
    logger.info(
      { height: latestBlock.block.header.height, chainId: latestBlock.block.header.chain_id },
      'LCD connected'
    );
  } catch (error) {
    logger.error({ error }, 'Failed to connect to LCD');
    process.exit(1);
  }

  // Initialize Redis
  await initRedis();

  // Setup event publishing
  setupEventPublishing();

  // Handle shutdown gracefully
  process.on('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down...');
    stopEnrichment();
    await stopSync();
    await prisma.$disconnect();
    if (redis) await redis.quit();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down...');
    stopEnrichment();
    await stopSync();
    await prisma.$disconnect();
    if (redis) await redis.quit();
    process.exit(0);
  });

  // Start enrichment worker (non-blocking — runs in background)
  startEnrichment().catch((err) => {
    logger.error({ err }, 'Enrichment worker fatal error');
  });

  // Start syncing (blocking — main loop)
  await startSync();
}

// Export for external use
export { startSync, stopSync, getSyncStatus, indexerEvents };
export { lcdClient } from './lcd-client.js';
export { config } from './config.js';
export * from './decoders/index.js';

// Run if this is the main module
main().catch((error) => {
  logger.error({ error }, 'Fatal error');
  process.exit(1);
});
