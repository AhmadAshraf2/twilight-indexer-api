# Twilight Indexer Architecture

The indexer syncs the Twilight blockchain into PostgreSQL by polling the LCD API, decoding custom module messages, and publishing real-time events via Redis.

---

## Components

```
LCD API (Cosmos REST)
  |
  v
Sync Loop (sync.ts)  ──────>  PostgreSQL
  |                              ^
  |                              |
  +-- Event Emitter  ──> Redis Pub/Sub ──> WebSocket Server
  |
Enrichment Worker (enrichment.ts)  ──> zkOS Decode API
```

| Component | File | Role |
|-----------|------|------|
| Sync loop | `src/sync.ts` | Main block processor |
| Enrichment worker | `src/enrichment.ts` | Async zkOS transaction decoder |
| LCD client | `src/lcd-client.ts` | Twilight chain API client |
| Message decoders | `src/decoders/` | Parse 23 custom message types |
| Entry point | `src/index.ts` | Startup, shutdown, Redis pub/sub |
| Config | `src/config.ts` | Environment-based configuration |
| Logger | `src/logger.ts` | Pino structured logging |

---

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://...` | PostgreSQL connection string |
| `REDIS_URL` | `redis://localhost:6379` | Redis for pub/sub |
| `TWILIGHT_LCD_URL` | `https://lcd.twilight.org` | Cosmos LCD endpoint |
| `ZKOS_DECODE_URL` | `https://indexer.twilight.org` | zkOS decode API |
| `INDEXER_START_HEIGHT` | `1` | Block height to start from |
| `INDEXER_POLL_INTERVAL` | `2000` | ms between polls when caught up |
| `INDEXER_BATCH_SIZE` | `10` | Blocks per batch |
| `CHAIN_ID` | `nyks` | Chain identifier |

---

## Sync Loop

### Startup

1. Connect to PostgreSQL
2. Connect to LCD API (verify by fetching latest block)
3. Initialize Redis (optional, non-blocking)
4. **Acquire advisory lock** (`pg_try_advisory_lock(123456789)`)
   - If another instance holds the lock, log warning and exit
   - Prevents concurrent indexers from causing duplicate writes
5. Start enrichment worker (background)
6. Enter main sync loop

### Block Processing

```
For each block height:
  1. Fetch block header from LCD
  2. Validate block linkage
     - Compare block.last_block_id.hash with previous block's hash in DB
     - On mismatch: log error, halt indexer (possible reorg)
     - Skip for height 1 (genesis)
  3. Fetch all transactions for the block
  4. For each transaction:
     - Decode messages using module decoders
     - Extract signers, fee, gas, memo, status
  5. Atomic database write:
     - Upsert Block
     - Create Transactions
     - Create Events
     - Update Account activity
     - Update IndexerState (lastIndexedHeight)
  6. Process custom messages (separate transaction):
     - Bridge: deposits, withdrawals, reserves, sweeps, signatures
     - Forks: delegate keys, chain tips
     - Volt: fragment signers
     - zkOS: transfers (raw, decoded later), mint/burns
  7. Emit events: block:new, tx:new, deposit:new, withdrawal:new
```

### Batch Processing

- Processes up to `batchSize` blocks per iteration
- When caught up to chain tip, sleeps for `pollInterval` ms
- On processing error, waits 5s before retrying

### Shutdown

1. Set `stopRequested = true`
2. Wait for current block to finish
3. Release advisory lock (`pg_advisory_unlock`)
4. Disconnect Prisma and Redis
5. Exit cleanly

---

## Enrichment Worker

The enrichment worker runs alongside the sync loop and asynchronously decodes zkOS transaction bytecode.

| Setting | Value |
|---------|-------|
| Batch size | 20 records |
| Poll interval | 10 seconds |
| Max attempts | 5 per record |

### Flow

1. Query `ZkosTransfer` records where `decodeStatus = 'pending'` and `decodeAttempts < 5`
2. For each record, call the external zkOS decode API with `txByteCode`
3. On success: store `decodedData`, `inputs`, `outputs`, `programType`, set `decodeStatus = 'ok'`
4. On failure: increment `decodeAttempts`, store error in `lastDecodeError`
5. After 5 failures: set `decodeStatus = 'failed'`

### Record States

| Status | Meaning |
|--------|---------|
| `pending` | Waiting to be decoded (initial) |
| `ok` | Successfully decoded |
| `failed` | Max attempts reached |

---

## Message Types

The indexer decodes **23 custom Cosmos SDK message types** across 4 modules.

### Bridge Module (17 types)

| Message | Description | DB Table |
|---------|-------------|----------|
| `MsgConfirmBtcDeposit` | Oracle confirms a BTC deposit | `BtcDeposit` |
| `MsgRegisterBtcDepositAddress` | Register BTC deposit address | `BtcDepositAddress` |
| `MsgRegisterReserveAddress` | Register reserve address | `Reserve` |
| `MsgBootstrapFragment` | Initialize multisig fragment | `Fragment` |
| `MsgWithdrawBtcRequest` | Request BTC withdrawal | `BtcWithdrawal` |
| `MsgConfirmBtcWithdraw` | Confirm withdrawal on BTC chain | - |
| `MsgWithdrawTxSigned` | Validator signs withdrawal | - |
| `MsgWithdrawTxFinal` | Judge submits final signed withdrawal | - |
| `MsgSweepProposal` | Propose reserve sweep | `SweepProposal` |
| `MsgSignSweep` | Sign sweep transaction | `SweepSignature` |
| `MsgSignRefund` | Sign refund transaction | `RefundSignature` |
| `MsgBroadcastTxSweep` | Broadcast signed sweep | - |
| `MsgBroadcastTxRefund` | Broadcast signed refund | - |
| `MsgProposeSweepAddress` | Propose sweep destination | - |
| `MsgProposeRefundHash` | Propose refund hash | - |
| `MsgUnsignedTxSweep` | Propose unsigned sweep tx | - |
| `MsgUnsignedTxRefund` | Propose unsigned refund tx | - |

### Forks Module (2 types)

| Message | Description | DB Table |
|---------|-------------|----------|
| `MsgSetDelegateAddresses` | Validator sets oracle delegates | `DelegateKey` |
| `MsgSeenBtcChainTip` | Oracle reports BTC chain tip | `BtcChainTip` |

### Volt Module (2 types)

| Message | Description | DB Table |
|---------|-------------|----------|
| `MsgSignerApplication` | Apply to join a fragment | `FragmentSigner` |
| `MsgAcceptSigners` | Judge accepts signer applications | `FragmentSigner` (update) |

### zkOS Module (2 types)

| Message | Description | DB Table |
|---------|-------------|----------|
| `MsgTransferTx` | Zero-knowledge transfer | `ZkosTransfer` |
| `MsgMintBurnTradingBtc` | Mint or burn trading BTC | `ZkosMintBurn` |

---

## Database Schema

### Core Tables

| Table | Primary Key | Description |
|-------|-------------|-------------|
| `Block` | `height` | Block headers |
| `Transaction` | `id` (auto) | Transactions with decoded messages |
| `Event` | `id` (auto) | Block/tx events |
| `Account` | `address` | Account activity tracking |
| `IndexerState` | `key` | Sync state (e.g., `lastIndexedHeight`) |

### Bridge Tables

| Table | Primary Key | Unique Constraint |
|-------|-------------|-------------------|
| `BtcDeposit` | `id` (auto) | `(btcHash, twilightDepositAddress)` |
| `BtcDepositAddress` | `id` (auto) | `btcDepositAddress` |
| `BtcWithdrawal` | `id` (auto) | `withdrawIdentifier` |
| `Reserve` | `id` (BigInt) | - |
| `SweepProposal` | `id` (auto) | - |
| `SweepSignature` | `id` (auto) | `(reserveId, roundId, signerAddress)` |
| `RefundSignature` | `id` (auto) | `(reserveId, roundId, signerAddress)` |

### Forks Tables

| Table | Primary Key | Unique Constraint |
|-------|-------------|-------------------|
| `DelegateKey` | `id` (auto) | `validatorAddress` |
| `BtcChainTip` | `id` (auto) | `(btcHeight, btcOracleAddress)` |

### Volt Tables

| Table | Primary Key | Unique Constraint |
|-------|-------------|-------------------|
| `Fragment` | `id` (BigInt) | - |
| `FragmentSigner` | `id` (auto) | `(fragmentId, signerAddress)` |
| `ClearingAccount` | `twilightAddress` | - |

### zkOS Tables

| Table | Primary Key | Unique Constraint |
|-------|-------------|-------------------|
| `ZkosTransfer` | `id` (auto) | `zkTxId` |
| `ZkosMintBurn` | `id` (auto) | - |

---

## Redis Pub/Sub Channels

Events are published after each block is processed. The API's WebSocket server subscribes to these channels for real-time client updates.

| Channel | Payload |
|---------|---------|
| `twilight:block:new` | Block data |
| `twilight:tx:new` | Transaction data |
| `twilight:deposit:new` | BTC deposit data |
| `twilight:withdrawal:new` | BTC withdrawal data |

All payloads are JSON-serialized with BigInt values converted to strings.

---

## LCD API Endpoints Used

### Block & Transaction
- `GET /cosmos/base/tendermint/v1beta1/blocks/latest`
- `GET /cosmos/base/tendermint/v1beta1/blocks/{height}`
- `GET /cosmos/tx/v1beta1/txs/block/{height}`
- `GET /cosmos/tx/v1beta1/txs/{hash}`
- `GET /cosmos/tx/v1beta1/txs?events=tx.height={height}`

### Module Queries
- `GET /twilightproject/nyks/bridge/registered_btc_deposit_addresses`
- `GET /twilightproject/nyks/bridge/registered_reserve_addresses`
- `GET /twilightproject/nyks/bridge/withdraw_btc_request_all`
- `GET /twilightproject/nyks/forks/delegate_keys_all`
- `GET /twilightproject/nyks/volt/btc_reserve`
- `GET /twilightproject/nyks/volt/fragments`
- `GET /twilightproject/nyks/volt/fragment/{id}`
- `GET /twilightproject/nyks/volt/clearing_account/{address}`
- `GET /twilightproject/nyks/zkos/transfer_tx/{txId}`
- `GET /twilightproject/nyks/zkos/mint_or_burn_trading_btc/{address}`

### Account & Node
- `GET /cosmos/auth/v1beta1/accounts/{address}`
- `GET /cosmos/bank/v1beta1/balances/{address}`
- `GET /cosmos/base/tendermint/v1beta1/node_info`
- `GET /cosmos/base/tendermint/v1beta1/syncing`

---

## Safety Features

| Feature | Description |
|---------|-------------|
| **Advisory lock** | PostgreSQL `pg_try_advisory_lock(123456789)` prevents concurrent indexers |
| **Block linkage** | Validates `last_block_id.hash` against previous block in DB |
| **Atomic writes** | Core block data written in a single Prisma transaction |
| **Async enrichment** | zkOS decoding doesn't block the sync loop |
| **Retry logic** | Failed decodes retried up to 5 times |
| **Graceful shutdown** | SIGINT/SIGTERM release lock, disconnect cleanly |
| **Upsert operations** | Duplicate message processing handled via composite unique keys |
