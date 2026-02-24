import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import pino from 'pino';
import { createServer } from 'http';
import { PrismaClient } from '@prisma/client';

import swaggerUi from 'swagger-ui-express';
import { config } from './config.js';
import { createWebSocketServer } from './websocket.js';
import { swaggerSpec } from './swagger.js';

// Import routes
import blocksRouter from './routes/blocks.js';
import transactionsRouter from './routes/transactions.js';
import accountsRouter from './routes/accounts.js';
import statsRouter from './routes/stats.js';
import twilightRouter from './routes/twilight.js';
import validatorsRouter from './routes/validators.js';
import bitcoinRouter from './routes/bitcoin.js';

const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
  },
});

const app = express();
const prisma = new PrismaClient();

// Trust proxy (behind Nginx)
app.set('trust proxy', 1);

// Middleware
app.use(helmet());
app.use(
  cors({
    origin: config.corsOrigin,
    credentials: true,
  })
);
app.use(express.json());
app.use(
  pinoHttp({
    logger,
    autoLogging: {
      ignore: (req) => (req.url || '').startsWith('/health'),
    },
  })
);

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', limiter);

// Health checks
app.get('/health/live', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/health/ready', async (req, res) => {
  const checks: Record<string, string> = {};
  let healthy = true;

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = 'ok';
  } catch {
    checks.database = 'failed';
    healthy = false;
  }

  try {
    const { getRedisClient } = await import('./cache.js');
    const redis = getRedisClient();
    if (redis) {
      await redis.ping();
      checks.redis = 'ok';
    } else {
      checks.redis = 'unavailable';
    }
  } catch {
    checks.redis = 'failed';
    healthy = false;
  }

  try {
    const state = await prisma.indexerState.findUnique({ where: { key: 'lastIndexedHeight' } });
    checks.lastIndexedHeight = state?.value || 'unknown';
  } catch {
    checks.lastIndexedHeight = 'unknown';
  }

  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ready' : 'not_ready',
    checks,
    timestamp: new Date().toISOString(),
  });
});

// Backward-compatible alias
app.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(503).json({ status: 'unhealthy', error: 'Database connection failed' });
  }
});

// Swagger API docs
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'Twilight Explorer API Docs',
  customCss: '.swagger-ui .topbar { display: none }',
}));
app.get('/api/docs.json', (req, res) => res.json(swaggerSpec));

// API Routes
app.use('/api/blocks', blocksRouter);
app.use('/api/txs', transactionsRouter);
app.use('/api/accounts', accountsRouter);
app.use('/api/stats', statsRouter);
app.use('/api/twilight', twilightRouter);
app.use('/api/validators', validatorsRouter);
app.use('/api/bitcoin', bitcoinRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error({ err }, 'Unhandled error');
  res.status(500).json({ error: 'Internal server error' });
});

// Create HTTP server
const server = createServer(app);

// Create WebSocket server
const wss = createWebSocketServer(server);

// Start server
async function main() {
  // Test database connection
  try {
    await prisma.$connect();
    logger.info('Database connected');
  } catch (error) {
    logger.error({ error }, 'Failed to connect to database');
    process.exit(1);
  }

  server.listen(config.port, config.host, () => {
    logger.info(
      { port: config.port, host: config.host },
      'Twilight Explorer API server started'
    );
    logger.info({ path: '/ws' }, 'WebSocket server available');
  });

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down...');
    wss.close();
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  logger.error({ error }, 'Fatal error');
  process.exit(1);
});
