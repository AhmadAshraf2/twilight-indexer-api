# Twilight Explorer API Reference

Base URL: `/api`
Swagger UI: `/api/docs`
OpenAPI spec: `/api/docs.json`

Rate limit: **100 requests per 60-second window** on all `/api/*` routes.

---

## Health Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health/live` | Liveness probe (always 200 if running) |
| GET | `/health/ready` | Readiness probe (checks DB, Redis, indexer lag) |
| GET | `/health` | Backward-compatible alias for `/health/ready` |

### GET /health/ready
```json
{
  "status": "ready",
  "checks": {
    "database": "ok",
    "redis": "ok",
    "lastIndexedHeight": "123456"
  },
  "timestamp": "2024-02-26T10:00:00.000Z"
}
```
Returns `200` when healthy, `503` when not ready.

---

## Blocks

| Method | Path | Description | Cache |
|--------|------|-------------|-------|
| GET | `/api/blocks` | List blocks (paginated) | 10s |
| GET | `/api/blocks/latest` | Most recent block with last 10 txs | - |
| GET | `/api/blocks/:height` | Block by height with txs and events | - |
| GET | `/api/blocks/:height/transactions` | Paginated txs for a block | - |

### Query Parameters (list endpoints)
| Param | Type | Default | Max |
|-------|------|---------|-----|
| `page` | integer | 1 | - |
| `limit` | integer | 20 | 100 |

### Response
```json
{
  "data": [
    {
      "height": 123456,
      "hash": "A1B2C3...",
      "timestamp": "2024-02-26T10:00:00.000Z",
      "proposer": "base64address",
      "proposerMoniker": "twilight-validator-1",
      "proposerOperator": "twilightvaloper1...",
      "txCount": 5,
      "gasUsed": "125000",
      "gasWanted": "200000"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 1000, "totalPages": 50 }
}
```

---

## Transactions

| Method | Path | Description | Cache |
|--------|------|-------------|-------|
| GET | `/api/txs` | List transactions (filtered, paginated) | 10s |
| GET | `/api/txs/recent` | Most recent transactions | 10s |
| GET | `/api/txs/types/stats` | Transaction type counts (top 20) | 30s |
| GET | `/api/txs/script/:scriptAddress` | Txs by zkOS script address | 10s |
| GET | `/api/txs/:hash` | Transaction detail by hash | 5m |

### Query Parameters — GET /api/txs
| Param | Type | Values |
|-------|------|--------|
| `page` | integer | default: 1 |
| `limit` | integer | default: 20, max: 100 |
| `type` | string | message type filter |
| `status` | enum | `success`, `failed` |
| `module` | enum | `bridge`, `forks`, `volt`, `zkos` |
| `programType` | enum | `Transfer`, `Message`, `Mint`, `Burn`, `CreateTraderOrder`, `SettleTraderOrder`, `CreateLendOrder`, `SettleLendOrder`, `LiquidateOrder`, etc. |

### GET /api/txs/:hash Response
```json
{
  "hash": "A1B2C3...",
  "blockHeight": 123456,
  "blockTime": "2024-02-26T10:00:00.000Z",
  "type": "/twilight-project.nyks.bridge.MsgConfirmBtcDeposit",
  "messageTypes": ["/twilight-project.nyks.bridge.MsgConfirmBtcDeposit"],
  "messages": [
    {
      "type": "/twilight-project.nyks.bridge.MsgConfirmBtcDeposit",
      "typeName": "CONFIRM_BTC_DEPOSIT",
      "data": { }
    }
  ],
  "fee": { },
  "gasUsed": "125000",
  "gasWanted": "200000",
  "memo": "",
  "status": "success",
  "errorLog": null,
  "signers": ["pubkey1"],
  "events": [{ "type": "message", "attributes": { } }],
  "block": { "height": 123456, "timestamp": "..." },
  "zkosDecodedData": null
}
```

---

## Accounts

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/accounts` | List accounts by tx count (paginated) |
| GET | `/api/accounts/:address` | Account detail with balances, deposits, withdrawals |
| GET | `/api/accounts/:address/transactions` | Transactions for an address (paginated) |

### GET /api/accounts/:address Response
```json
{
  "account": { "address": "twilight1...", "balance": "1000000", "txCount": 42 },
  "balances": [{ "denom": "utlx", "amount": "1000000" }],
  "deposits": [],
  "withdrawals": [],
  "clearingAccount": null,
  "zkosOperations": [],
  "fragmentSigners": []
}
```

---

## Validators

| Method | Path | Description | Cache |
|--------|------|-------------|-------|
| GET | `/api/validators` | List validators from LCD | 10m |
| GET | `/api/validators/count` | Validator count | 10m |
| GET | `/api/validators/:address` | Single validator detail | 10m |
| GET | `/api/validators/:address/blocks` | Block production stats | 30s |

### Query Parameters — GET /api/validators
| Param | Type | Default |
|-------|------|---------|
| `status` | enum | `BOND_STATUS_BONDED` |
| `limit` | integer | 200 (max: 500) |

### GET /api/validators/:address/blocks Response
```json
{
  "totalBlocks": 5432,
  "blocks24h": 123,
  "blocks7d": 847,
  "percentage": 5.43,
  "lastBlock": { "height": 123456, "hash": "...", "timestamp": "..." }
}
```

---

## Statistics

| Method | Path | Description | Cache |
|--------|------|-------------|-------|
| GET | `/api/stats` | Chain overview (blocks, txs, accounts) | 30s |
| GET | `/api/stats/charts/blocks` | Daily block/tx chart data | - |
| GET | `/api/stats/charts/transactions` | Daily tx data by status and module | - |
| GET | `/api/stats/modules` | Per-module statistics | 60s |
| GET | `/api/stats/network-performance` | Block time, TPS, gas utilization | 30s |
| GET | `/api/stats/active-accounts` | Active account counts (24h/7d/30d) | 30s |
| GET | `/api/stats/bridge-analytics` | Deposit/withdrawal volumes and rates | 30s |
| GET | `/api/stats/fragment-health` | Fragment status and signer stats | 30s |

### GET /api/stats Response
```json
{
  "latestBlock": { "height": 123456, "hash": "...", "timestamp": "..." },
  "totalBlocks": 123456,
  "totalTransactions": 654321,
  "totalAccounts": 5432,
  "transactionsLast24h": 1234,
  "transactionsByStatus": { "success": 1200, "failed": 34 }
}
```

### GET /api/stats/modules Response
```json
{
  "bridge": { "deposits": 1234, "withdrawals": 567, "depositVolume": "1234567890", "withdrawalVolume": "567890123" },
  "forks": { "delegateKeys": 42 },
  "volt": { "fragments": 123, "activeFragments": 98 },
  "zkos": { "transfers": 5432, "mintBurns": 234, "volume": "12345678900" }
}
```

---

## Twilight Bridge

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/twilight/deposits` | List BTC deposits (paginated, filterable) |
| GET | `/api/twilight/deposits/:id` | Deposit by ID |
| GET | `/api/twilight/withdrawals` | List BTC withdrawals (paginated, filterable) |
| GET | `/api/twilight/withdrawals/:id` | Withdrawal by ID |
| GET | `/api/twilight/sweep-addresses` | Proposed BTC sweep addresses (cached 10m) |
| GET | `/api/twilight/reserves` | All BTC reserves |
| GET | `/api/twilight/reserves/:id` | Reserve by ID |
| GET | `/api/twilight/delegates` | All delegate keys |
| GET | `/api/twilight/search` | Global search |

### Deposit Filters
| Param | Description |
|-------|-------------|
| `address` | Filter by Twilight deposit address |
| `reserveAddress` | Filter by reserve address |
| `search` | Search by address or reserve |

### Withdrawal Filters
| Param | Description |
|-------|-------------|
| `confirmed` | `true` or `false` |
| `address` | Filter by Twilight address |
| `withdrawAddress` | Filter by BTC withdraw address |
| `search` | Search term |

### Search — GET /api/twilight/search?q=...
Auto-detects query type (block height, tx hash, address) and returns matching results:
```json
{
  "block": { },
  "transaction": { },
  "account": { },
  "deposits": []
}
```

---

## Fragments

| Method | Path | Description | Cache |
|--------|------|-------------|-------|
| GET | `/api/twilight/fragments/live` | Live fragments from LCD | 10m |
| GET | `/api/twilight/fragments/live/:id` | Single live fragment | 10m |
| GET | `/api/twilight/fragments` | Fragments from DB (paginated) | - |
| GET | `/api/twilight/fragments/:id` | Fragment by ID with signers | - |
| GET | `/api/twilight/fragment-signers` | List signers (filterable by fragmentId) | - |

---

## zkOS

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/twilight/zkos/transfers` | List zkOS transfers (paginated) |
| GET | `/api/twilight/zkos/transfers/:txId` | Transfer by zkOS tx ID |
| GET | `/api/twilight/zkos/mint-burns` | List mint/burn ops (filterable by `type`: `mint`/`burn`) |

---

## Bitcoin

| Method | Path | Description | Cache |
|--------|------|-------------|-------|
| GET | `/api/bitcoin/info` | BTC node height and fee estimates | 30s |
| GET | `/api/bitcoin/address/:address/balance` | BTC address balance via mempool.space | 12h |

### GET /api/bitcoin/address/:address/balance Response
```json
{
  "address": "bc1q...",
  "balanceSats": 1234567,
  "txCount": 42
}
```

---

## WebSocket API

**URL:** `ws://<host>:<port>/ws`

### Channels
| Channel | Description |
|---------|-------------|
| `twilight:block:new` | New blocks |
| `twilight:tx:new` | New transactions |
| `twilight:deposit:new` | New BTC deposits |
| `twilight:withdrawal:new` | New BTC withdrawals |

### Client Messages
```json
{ "action": "subscribe", "channel": "twilight:block:new" }
{ "action": "unsubscribe", "channel": "twilight:block:new" }
{ "action": "subscribe_all" }
{ "action": "unsubscribe_all" }
{ "action": "ping" }
```

### Server Messages
```json
{ "type": "connected", "message": "Connected to Twilight Explorer WebSocket", "channels": ["blocks", "transactions", "deposits", "withdrawals"] }
{ "type": "subscribed", "channel": "twilight:block:new" }
{ "type": "block", "data": { }, "timestamp": "2024-02-26T10:00:00.000Z" }
{ "type": "pong", "timestamp": 1708942800000 }
```

Clients subscribe to all channels by default. Server pings every 30s; unresponsive clients are terminated.

---

## Notes

- All `BigInt` values (balances, gas, volumes) are returned as **strings**.
- Pagination follows `{ page, limit, total, totalPages }` format.
- Cache TTLs are noted per-endpoint. Uncached endpoints hit the database directly.
- The API falls back to LCD for transactions not yet indexed.
