import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

export const config = {
  port: parseInt(process.env.API_PORT || '3001', 10),
  host: process.env.API_HOST || '0.0.0.0',
  wsPort: parseInt(process.env.WS_PORT || '3002', 10),
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  lcdUrl: process.env.TWILIGHT_LCD_URL || 'https://lcd.twilight.org',
  zkosDecodeUrl: process.env.ZKOS_DECODE_URL || 'https://indexer.twilight.org',
  btcRpc: {
    url: process.env.BTC_RPC_URL || 'http://143.244.138.170:8332',
    user: process.env.BTC_RPC_USER || 'bitcoin',
    password: process.env.BTC_RPC_PASSWORD || '',
  },
  rateLimit: {
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute
  },
} as const;
