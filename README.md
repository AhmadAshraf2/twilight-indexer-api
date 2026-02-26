# Twilight Indexer & API

Backend services for the Twilight blockchain explorer. Indexes chain data into PostgreSQL and serves it via REST API and WebSocket.

## Architecture

```
Twilight Chain (LCD)
  |
  v
Indexer ──> PostgreSQL <── API Server ──> REST + WebSocket
  |                                          |
  +──> Redis Pub/Sub ────────────────────────+
  |
Enrichment Worker ──> zkOS Decode API
```

| Package | Description |
|---------|-------------|
| `packages/indexer` | Block sync, message decoding, enrichment worker |
| `packages/api` | Express REST API, WebSocket server, Swagger docs |
| `prisma/` | Database schema and migrations |

## Quick Start

```bash
# Install
npm install
npx prisma generate

# Configure
cp .env.example .env
# Edit .env with your database, Redis, and LCD URLs

# Apply schema
npx prisma db push

# Development
npm run dev

# Production
npm run build
pm2 start ecosystem.config.js
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Build all packages |
| `npm run dev` | Start all in dev mode |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:push` | Push schema to database |
| `npm run db:migrate` | Run migrations |
| `npm run db:studio` | Open Prisma Studio |

## Documentation

- [API Reference](docs/API.md) — all REST endpoints, WebSocket events, caching
- [Indexer Architecture](docs/INDEXER.md) — sync loop, decoders, enrichment worker, database schema

## Production

Uses PM2 for process management:

```bash
pm2 start ecosystem.config.js
pm2 logs
pm2 status
```

| Service | Port | Description |
|---------|------|-------------|
| API | 3001 | REST API + WebSocket |
| Indexer | - | Background sync process |

The indexer uses a PostgreSQL advisory lock to ensure only one instance indexes at a time. Running multiple instances is safe — extras will exit gracefully.

## Health Checks

```bash
curl http://localhost:3001/health/live    # Liveness
curl http://localhost:3001/health/ready   # Readiness (DB + Redis + indexer lag)
```
