import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from root .env file
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

export const config = {
  // Database
  databaseUrl: process.env.DATABASE_URL || 'postgresql://twilight:twilight_secret@localhost:5432/twilight_explorer',

  // Redis
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',

  // Twilight LCD API
  lcdUrl: process.env.TWILIGHT_LCD_URL || 'https://lcd.twilight.org',

  // zkOS Decode API
  zkosDecodeUrl: process.env.ZKOS_DECODE_URL || 'https://indexer.twilight.org',

  // Indexer settings
  startHeight: parseInt(process.env.INDEXER_START_HEIGHT || '1', 10),
  pollInterval: parseInt(process.env.INDEXER_POLL_INTERVAL || '2000', 10),
  batchSize: parseInt(process.env.INDEXER_BATCH_SIZE || '10', 10),

  // Chain info
  chainId: process.env.CHAIN_ID || 'nyks',
} as const;
