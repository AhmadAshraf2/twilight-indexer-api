import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Twilight Explorer API',
      version: '0.1.0',
      description: 'REST API for the Twilight blockchain explorer. Provides access to blocks, transactions, accounts, validators, BTC bridge operations, zkOS data, and network statistics.',
    },
    servers: [
      { url: '/', description: 'Current server' },
    ],
    components: {
      schemas: {
        Pagination: {
          type: 'object',
          properties: {
            page: { type: 'integer', example: 1 },
            limit: { type: 'integer', example: 20 },
            total: { type: 'integer', example: 1000 },
            totalPages: { type: 'integer', example: 50 },
          },
        },
        Block: {
          type: 'object',
          properties: {
            height: { type: 'integer', example: 123456 },
            hash: { type: 'string', example: 'A1B2C3D4E5F6...' },
            timestamp: { type: 'string', format: 'date-time' },
            proposer: { type: 'string', nullable: true, description: 'Base64 consensus address' },
            proposerMoniker: { type: 'string', nullable: true, example: 'twilight-validator-1' },
            proposerOperator: { type: 'string', nullable: true, example: 'twilightvaloper1...' },
            txCount: { type: 'integer', example: 5 },
            gasUsed: { type: 'string', example: '125000' },
            gasWanted: { type: 'string', example: '200000' },
          },
        },
        Transaction: {
          type: 'object',
          properties: {
            hash: { type: 'string', example: 'A1B2C3...' },
            blockHeight: { type: 'integer', example: 123456 },
            blockTime: { type: 'string', format: 'date-time' },
            type: { type: 'string', example: '/twilight-project.nyks.bridge.MsgConfirmBtcDeposit' },
            messageTypes: { type: 'array', items: { type: 'string' } },
            status: { type: 'string', enum: ['success', 'failed'] },
            gasUsed: { type: 'string', example: '125000' },
            gasWanted: { type: 'string', example: '200000' },
            memo: { type: 'string', nullable: true },
            programType: { type: 'string', nullable: true },
          },
        },
        Account: {
          type: 'object',
          properties: {
            address: { type: 'string', example: 'twilight1...' },
            balance: { type: 'string', example: '1000000' },
            txCount: { type: 'integer' },
          },
        },
        Deposit: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            txHash: { type: 'string' },
            blockHeight: { type: 'integer' },
            reserveAddress: { type: 'string' },
            depositAmount: { type: 'string', description: 'Amount in satoshis' },
            btcHeight: { type: 'string' },
            btcHash: { type: 'string' },
            twilightDepositAddress: { type: 'string' },
            oracleAddress: { type: 'string' },
            votes: { type: 'integer', description: 'Number of oracle attestation votes' },
            confirmed: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Withdrawal: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            withdrawIdentifier: { type: 'string' },
            twilightAddress: { type: 'string' },
            withdrawAddress: { type: 'string' },
            withdrawReserveId: { type: 'string' },
            blockHeight: { type: 'integer' },
            withdrawAmount: { type: 'string', description: 'Amount in satoshis' },
            isConfirmed: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Reserve: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            btcRelayCapacityValue: { type: 'string' },
            totalValue: { type: 'string' },
            privatePoolValue: { type: 'string' },
            publicValue: { type: 'string' },
            feePool: { type: 'string' },
            unlockHeight: { type: 'string' },
            roundId: { type: 'string' },
          },
        },
        Validator: {
          type: 'object',
          properties: {
            operator_address: { type: 'string', example: 'twilightvaloper1...' },
            jailed: { type: 'boolean' },
            status: { type: 'string', example: 'BOND_STATUS_BONDED' },
            tokens: { type: 'string' },
            description: {
              type: 'object',
              properties: {
                moniker: { type: 'string' },
                identity: { type: 'string' },
                website: { type: 'string' },
                details: { type: 'string' },
              },
            },
            commission: {
              type: 'object',
              properties: {
                commission_rates: {
                  type: 'object',
                  properties: {
                    rate: { type: 'string' },
                    max_rate: { type: 'string' },
                    max_change_rate: { type: 'string' },
                  },
                },
              },
            },
          },
        },
        Fragment: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            status: { type: 'string' },
            judgeAddress: { type: 'string' },
            threshold: { type: 'string' },
            signerApplicationFee: { type: 'string' },
            feePool: { type: 'string' },
            feeBips: { type: 'string' },
            signersCount: { type: 'integer' },
          },
        },
        DelegateKey: {
          type: 'object',
          properties: {
            validatorAddress: { type: 'string' },
            btcOracleAddress: { type: 'string' },
            btcPublicKey: { type: 'string' },
            zkOracleAddress: { type: 'string' },
          },
        },
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
    tags: [
      { name: 'Blocks', description: 'Block data and block-level transactions' },
      { name: 'Transactions', description: 'Transaction queries and details' },
      { name: 'Accounts', description: 'Account balances and activity' },
      { name: 'Validators', description: 'Validator set and block production stats' },
      { name: 'Stats', description: 'Network statistics, charts, and analytics' },
      { name: 'Bridge', description: 'BTC deposits and withdrawals' },
      { name: 'Reserves', description: 'BTC reserves' },
      { name: 'Fragments', description: 'Twilight fragments and signers' },
      { name: 'zkOS', description: 'zkOS transfers and mint/burn operations' },
      { name: 'Search', description: 'Global search across entities' },
      { name: 'Bitcoin', description: 'Bitcoin node data (block height, fee estimates)' },
      { name: 'Health', description: 'Server health checks' },
    ],
    paths: {
      // ===================== Health =====================
      '/health': {
        get: {
          tags: ['Health'],
          summary: 'Health check',
          description: 'Checks database connectivity and returns server health status.',
          responses: {
            200: {
              description: 'Healthy',
              content: { 'application/json': { schema: { type: 'object', properties: { status: { type: 'string', example: 'healthy' }, timestamp: { type: 'string', format: 'date-time' } } } } },
            },
            503: { description: 'Unhealthy — database connection failed' },
          },
        },
      },

      // ===================== Blocks =====================
      '/api/blocks': {
        get: {
          tags: ['Blocks'],
          summary: 'List blocks',
          description: 'Returns a paginated list of blocks ordered by height descending. Includes proposer moniker resolved from the validator set.',
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
          ],
          responses: {
            200: {
              description: 'Paginated block list',
              content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: { $ref: '#/components/schemas/Block' } }, pagination: { $ref: '#/components/schemas/Pagination' } } } } },
            },
          },
        },
      },
      '/api/blocks/latest': {
        get: {
          tags: ['Blocks'],
          summary: 'Get latest block',
          description: 'Returns the most recent block with its last 10 transactions.',
          responses: {
            200: { description: 'Latest block with transactions', content: { 'application/json': { schema: { $ref: '#/components/schemas/Block' } } } },
            404: { description: 'No blocks found' },
          },
        },
      },
      '/api/blocks/{height}': {
        get: {
          tags: ['Blocks'],
          summary: 'Get block by height',
          description: 'Returns a single block with all its transactions and events.',
          parameters: [
            { name: 'height', in: 'path', required: true, schema: { type: 'integer' } },
          ],
          responses: {
            200: { description: 'Block details', content: { 'application/json': { schema: { $ref: '#/components/schemas/Block' } } } },
            404: { description: 'Block not found' },
          },
        },
      },
      '/api/blocks/{height}/transactions': {
        get: {
          tags: ['Blocks'],
          summary: 'Get transactions in a block',
          description: 'Returns paginated transactions for a specific block height.',
          parameters: [
            { name: 'height', in: 'path', required: true, schema: { type: 'integer' } },
            { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
          ],
          responses: {
            200: { description: 'Paginated transactions', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: { $ref: '#/components/schemas/Transaction' } }, pagination: { $ref: '#/components/schemas/Pagination' } } } } } },
          },
        },
      },

      // ===================== Transactions =====================
      '/api/txs': {
        get: {
          tags: ['Transactions'],
          summary: 'List transactions',
          description: 'Returns a paginated, filterable list of transactions.',
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
            { name: 'type', in: 'query', schema: { type: 'string' }, description: 'Filter by message type' },
            { name: 'status', in: 'query', schema: { type: 'string', enum: ['success', 'failed'] } },
            { name: 'module', in: 'query', schema: { type: 'string', enum: ['bridge', 'forks', 'volt', 'zkos'] } },
            { name: 'programType', in: 'query', schema: { type: 'string', enum: ['Transfer', 'Message', 'Mint', 'Burn', 'RelayerInitializer', 'CreateTraderOrder', 'SettleTraderOrder', 'SettleTraderOrderNegativeMarginDifference', 'CreateLendOrder', 'SettleLendOrder', 'LiquidateOrder'] } },
          ],
          responses: {
            200: { description: 'Paginated transactions', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: { $ref: '#/components/schemas/Transaction' } }, pagination: { $ref: '#/components/schemas/Pagination' } } } } } },
          },
        },
      },
      '/api/txs/recent': {
        get: {
          tags: ['Transactions'],
          summary: 'Get recent transactions',
          description: 'Returns the most recent transactions (no pagination).',
          parameters: [
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 10, maximum: 50 } },
          ],
          responses: {
            200: { description: 'Array of recent transactions', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Transaction' } } } } },
          },
        },
      },
      '/api/txs/types/stats': {
        get: {
          tags: ['Transactions'],
          summary: 'Transaction type statistics',
          description: 'Returns the top 20 transaction types with their counts.',
          responses: {
            200: { description: 'Array of type counts', content: { 'application/json': { schema: { type: 'array', items: { type: 'object', properties: { type: { type: 'string' }, count: { type: 'integer' } } } } } } },
          },
        },
      },
      '/api/txs/script/{scriptAddress}': {
        get: {
          tags: ['Transactions'],
          summary: 'Transactions by script address',
          description: 'Returns transactions associated with a zkOS script address.',
          parameters: [
            { name: 'scriptAddress', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
          ],
          responses: {
            200: { description: 'Paginated transactions for the script', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: { $ref: '#/components/schemas/Transaction' } }, scriptAddress: { type: 'string' }, pagination: { $ref: '#/components/schemas/Pagination' } } } } } },
          },
        },
      },
      '/api/txs/{hash}': {
        get: {
          tags: ['Transactions'],
          summary: 'Get transaction by hash',
          description: 'Returns full transaction details including block info, events, and optional zkOS decoded data.',
          parameters: [
            { name: 'hash', in: 'path', required: true, schema: { type: 'string', minLength: 64 } },
          ],
          responses: {
            200: { description: 'Transaction details', content: { 'application/json': { schema: { $ref: '#/components/schemas/Transaction' } } } },
            400: { description: 'Invalid hash format' },
            404: { description: 'Transaction not found' },
          },
        },
      },

      // ===================== Accounts =====================
      '/api/accounts': {
        get: {
          tags: ['Accounts'],
          summary: 'List accounts',
          description: 'Returns paginated accounts ordered by transaction count.',
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
          ],
          responses: {
            200: { description: 'Paginated accounts', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: { $ref: '#/components/schemas/Account' } }, pagination: { $ref: '#/components/schemas/Pagination' } } } } } },
          },
        },
      },
      '/api/accounts/{address}': {
        get: {
          tags: ['Accounts'],
          summary: 'Get account details',
          description: 'Returns account info, LCD balances, recent deposits, withdrawals, clearing account, zkOS operations, and fragment signers.',
          parameters: [
            { name: 'address', in: 'path', required: true, schema: { type: 'string' }, description: 'Twilight address (twilight1... or twilightvaloper1...)' },
          ],
          responses: {
            200: {
              description: 'Account details with related data',
              content: { 'application/json': { schema: { type: 'object', properties: { account: { $ref: '#/components/schemas/Account' }, balances: { type: 'array', items: { type: 'object', properties: { denom: { type: 'string' }, amount: { type: 'string' } } } }, deposits: { type: 'array', items: { $ref: '#/components/schemas/Deposit' } }, withdrawals: { type: 'array', items: { $ref: '#/components/schemas/Withdrawal' } }, clearingAccount: { type: 'object', nullable: true }, zkosOperations: { type: 'array', items: { type: 'object' } }, fragmentSigners: { type: 'array', items: { type: 'object' } } } } } },
            },
            400: { description: 'Invalid address format' },
          },
        },
      },
      '/api/accounts/{address}/transactions': {
        get: {
          tags: ['Accounts'],
          summary: 'Get account transactions',
          description: 'Returns paginated transactions involving this address (as signer or in message data).',
          parameters: [
            { name: 'address', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
          ],
          responses: {
            200: { description: 'Paginated transactions', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: { $ref: '#/components/schemas/Transaction' } }, pagination: { $ref: '#/components/schemas/Pagination' } } } } } },
            400: { description: 'Invalid address format' },
          },
        },
      },

      // ===================== Validators =====================
      '/api/validators': {
        get: {
          tags: ['Validators'],
          summary: 'List validators',
          description: 'Returns validators from the LCD staking module. Cached for 10 minutes.',
          parameters: [
            { name: 'status', in: 'query', schema: { type: 'string', default: 'BOND_STATUS_BONDED', enum: ['BOND_STATUS_BONDED', 'BOND_STATUS_UNBONDED', 'BOND_STATUS_UNBONDING'] } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 200, maximum: 500 } },
          ],
          responses: {
            200: { description: 'Validator list', content: { 'application/json': { schema: { type: 'object', properties: { validators: { type: 'array', items: { $ref: '#/components/schemas/Validator' } }, pagination: { type: 'object' } } } } } },
          },
        },
      },
      '/api/validators/count': {
        get: {
          tags: ['Validators'],
          summary: 'Get validator count',
          description: 'Returns the number of validators for a given status.',
          parameters: [
            { name: 'status', in: 'query', schema: { type: 'string', default: 'BOND_STATUS_BONDED' } },
          ],
          responses: {
            200: { description: 'Validator count', content: { 'application/json': { schema: { type: 'object', properties: { count: { type: 'integer' } } } } } },
          },
        },
      },
      '/api/validators/{address}/blocks': {
        get: {
          tags: ['Validators'],
          summary: 'Get validator block production stats',
          description: 'Returns block production statistics for a validator. Maps the operator address to its consensus proposer address to query the blocks database.',
          parameters: [
            { name: 'address', in: 'path', required: true, schema: { type: 'string' }, description: 'Validator operator address (twilightvaloper1...)' },
          ],
          responses: {
            200: {
              description: 'Block production stats',
              content: { 'application/json': { schema: { type: 'object', properties: { totalBlocks: { type: 'integer' }, blocks24h: { type: 'integer' }, blocks7d: { type: 'integer' }, percentage: { type: 'number', description: 'Percentage of total chain blocks' }, lastBlock: { type: 'object', nullable: true, properties: { height: { type: 'integer' }, hash: { type: 'string' }, timestamp: { type: 'string', format: 'date-time' } } } } } } },
            },
          },
        },
      },
      '/api/validators/{address}': {
        get: {
          tags: ['Validators'],
          summary: 'Get single validator',
          description: 'Returns validator details from the LCD staking module.',
          parameters: [
            { name: 'address', in: 'path', required: true, schema: { type: 'string' }, description: 'Validator operator address (twilightvaloper1...)' },
          ],
          responses: {
            200: { description: 'Validator details', content: { 'application/json': { schema: { $ref: '#/components/schemas/Validator' } } } },
            404: { description: 'Validator not found' },
          },
        },
      },

      // ===================== Stats =====================
      '/api/stats': {
        get: {
          tags: ['Stats'],
          summary: 'Overall chain stats',
          description: 'Returns high-level chain statistics. Cached for 30 seconds.',
          responses: {
            200: {
              description: 'Chain stats',
              content: { 'application/json': { schema: { type: 'object', properties: { latestBlock: { type: 'integer' }, totalBlocks: { type: 'integer' }, totalTransactions: { type: 'integer' }, totalAccounts: { type: 'integer' }, transactionsLast24h: { type: 'integer' }, transactionsByStatus: { type: 'object', properties: { success: { type: 'integer' }, failed: { type: 'integer' } } } } } } },
            },
          },
        },
      },
      '/api/stats/charts/blocks': {
        get: {
          tags: ['Stats'],
          summary: 'Block chart data',
          description: 'Returns daily aggregated block data for charting.',
          parameters: [
            { name: 'days', in: 'query', schema: { type: 'integer', default: 7 } },
          ],
          responses: {
            200: { description: 'Daily block stats', content: { 'application/json': { schema: { type: 'array', items: { type: 'object', properties: { date: { type: 'string' }, blocks: { type: 'integer' }, transactions: { type: 'integer' }, gasUsed: { type: 'string' } } } } } } },
          },
        },
      },
      '/api/stats/charts/transactions': {
        get: {
          tags: ['Stats'],
          summary: 'Transaction chart data',
          description: 'Returns daily aggregated transaction data by status and module.',
          parameters: [
            { name: 'days', in: 'query', schema: { type: 'integer', default: 7 } },
          ],
          responses: {
            200: { description: 'Daily transaction stats', content: { 'application/json': { schema: { type: 'array', items: { type: 'object', properties: { date: { type: 'string' }, total: { type: 'integer' }, success: { type: 'integer' }, failed: { type: 'integer' }, byModule: { type: 'object' } } } } } } },
          },
        },
      },
      '/api/stats/modules': {
        get: {
          tags: ['Stats'],
          summary: 'Module statistics',
          description: 'Returns per-module statistics (bridge, forks, volt, zkos). Cached for 60 seconds.',
          responses: {
            200: {
              description: 'Module stats',
              content: { 'application/json': { schema: { type: 'object', properties: { bridge: { type: 'object', properties: { deposits: { type: 'integer' }, withdrawals: { type: 'integer' }, depositVolume: { type: 'string' }, withdrawalVolume: { type: 'string' } } }, forks: { type: 'object' }, volt: { type: 'object' }, zkos: { type: 'object' } } } } },
            },
          },
        },
      },
      '/api/stats/network-performance': {
        get: {
          tags: ['Stats'],
          summary: 'Network performance metrics',
          description: 'Returns average block time, TPS, gas utilization, and proposer distribution.',
          responses: {
            200: {
              description: 'Network performance',
              content: { 'application/json': { schema: { type: 'object', properties: { averageBlockTime: { type: 'number' }, tps: { type: 'number' }, blockProductionRate: { type: 'number' }, gasUtilization: { type: 'number' }, proposerDistribution: { type: 'array', items: { type: 'object' } } } } } },
            },
          },
        },
      },
      '/api/stats/active-accounts': {
        get: {
          tags: ['Stats'],
          summary: 'Active account metrics',
          description: 'Returns active account counts over various time windows.',
          responses: {
            200: {
              description: 'Active account stats',
              content: { 'application/json': { schema: { type: 'object', properties: { active24h: { type: 'integer' }, active7d: { type: 'integer' }, active30d: { type: 'integer' }, newAccounts24h: { type: 'integer' }, growthRate: { type: 'number' } } } } },
            },
          },
        },
      },
      '/api/stats/bridge-analytics': {
        get: {
          tags: ['Stats'],
          summary: 'BTC bridge analytics',
          description: 'Returns deposit/withdrawal volumes, averages, and success rates.',
          responses: {
            200: {
              description: 'Bridge analytics',
              content: { 'application/json': { schema: { type: 'object', properties: { totalVolume: { type: 'string' }, depositVolume24h: { type: 'string' }, withdrawalVolume24h: { type: 'string' }, pendingWithdrawals: { type: 'integer' }, confirmedWithdrawals: { type: 'integer' }, averageDepositSize: { type: 'string' }, averageWithdrawalSize: { type: 'string' }, withdrawalSuccessRate: { type: 'number' } } } } },
            },
          },
        },
      },
      '/api/stats/fragment-health': {
        get: {
          tags: ['Stats'],
          summary: 'Fragment health metrics',
          description: 'Returns fragment activity stats, signer counts, and top fragments.',
          responses: {
            200: {
              description: 'Fragment health',
              content: { 'application/json': { schema: { type: 'object', properties: { totalFragments: { type: 'integer' }, activeFragments: { type: 'integer' }, bootstrappingFragments: { type: 'integer' }, inactiveFragments: { type: 'integer' }, averageSignersPerFragment: { type: 'number' }, totalSigners: { type: 'integer' }, fragmentSuccessRate: { type: 'number' }, averageFeePool: { type: 'string' }, topFragments: { type: 'array', items: { type: 'object' } } } } } },
            },
          },
        },
      },

      // ===================== Bridge (Deposits & Withdrawals) =====================
      '/api/twilight/deposits': {
        get: {
          tags: ['Bridge'],
          summary: 'List BTC deposits',
          description: 'Returns paginated BTC deposits with optional filtering.',
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
            { name: 'address', in: 'query', schema: { type: 'string' }, description: 'Filter by Twilight deposit address' },
            { name: 'reserveAddress', in: 'query', schema: { type: 'string' }, description: 'Filter by reserve address' },
            { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Search by address, reserve, or BTC hash' },
          ],
          responses: {
            200: { description: 'Paginated deposits', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: { $ref: '#/components/schemas/Deposit' } }, pagination: { $ref: '#/components/schemas/Pagination' } } } } } },
          },
        },
      },
      '/api/twilight/deposits/{id}': {
        get: {
          tags: ['Bridge'],
          summary: 'Get deposit by ID',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
          ],
          responses: {
            200: { description: 'Deposit details', content: { 'application/json': { schema: { $ref: '#/components/schemas/Deposit' } } } },
            404: { description: 'Deposit not found' },
          },
        },
      },
      '/api/twilight/withdrawals': {
        get: {
          tags: ['Bridge'],
          summary: 'List BTC withdrawals',
          description: 'Returns paginated BTC withdrawals with optional filtering.',
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
            { name: 'confirmed', in: 'query', schema: { type: 'string', enum: ['true', 'false'] }, description: 'Filter by confirmation status' },
            { name: 'address', in: 'query', schema: { type: 'string' }, description: 'Filter by Twilight address' },
            { name: 'withdrawAddress', in: 'query', schema: { type: 'string' }, description: 'Filter by BTC withdraw address' },
            { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Search by address' },
          ],
          responses: {
            200: { description: 'Paginated withdrawals', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: { $ref: '#/components/schemas/Withdrawal' } }, pagination: { $ref: '#/components/schemas/Pagination' } } } } } },
          },
        },
      },
      '/api/twilight/withdrawals/{id}': {
        get: {
          tags: ['Bridge'],
          summary: 'Get withdrawal by ID',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
          ],
          responses: {
            200: { description: 'Withdrawal details', content: { 'application/json': { schema: { $ref: '#/components/schemas/Withdrawal' } } } },
            404: { description: 'Withdrawal not found' },
          },
        },
      },

      // ===================== Reserves =====================
      '/api/twilight/reserves': {
        get: {
          tags: ['Reserves'],
          summary: 'List all reserves',
          description: 'Returns all BTC reserves from the database.',
          responses: {
            200: { description: 'Array of reserves', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Reserve' } } } } },
          },
        },
      },
      '/api/twilight/reserves/{id}': {
        get: {
          tags: ['Reserves'],
          summary: 'Get reserve by ID',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            200: { description: 'Reserve details', content: { 'application/json': { schema: { $ref: '#/components/schemas/Reserve' } } } },
            404: { description: 'Reserve not found' },
          },
        },
      },

      // ===================== Fragments =====================
      '/api/twilight/fragments/live': {
        get: {
          tags: ['Fragments'],
          summary: 'List live fragments',
          description: 'Returns fragments fetched live from the LCD. Cached for 10 minutes.',
          responses: {
            200: { description: 'Live fragments', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: { $ref: '#/components/schemas/Fragment' } }, total: { type: 'integer' } } } } } },
          },
        },
      },
      '/api/twilight/fragments/live/{id}': {
        get: {
          tags: ['Fragments'],
          summary: 'Get live fragment by ID',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            200: { description: 'Fragment details from LCD', content: { 'application/json': { schema: { $ref: '#/components/schemas/Fragment' } } } },
            404: { description: 'Fragment not found' },
          },
        },
      },
      '/api/twilight/fragments': {
        get: {
          tags: ['Fragments'],
          summary: 'List fragments from database',
          description: 'Returns paginated fragments from the indexed database.',
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
          ],
          responses: {
            200: { description: 'Paginated fragments', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: { $ref: '#/components/schemas/Fragment' } }, pagination: { $ref: '#/components/schemas/Pagination' } } } } } },
          },
        },
      },
      '/api/twilight/fragments/{id}': {
        get: {
          tags: ['Fragments'],
          summary: 'Get fragment by ID from database',
          description: 'Returns a fragment with its signers from the indexed database.',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            200: { description: 'Fragment with signers', content: { 'application/json': { schema: { $ref: '#/components/schemas/Fragment' } } } },
            404: { description: 'Fragment not found' },
          },
        },
      },
      '/api/twilight/fragment-signers': {
        get: {
          tags: ['Fragments'],
          summary: 'List fragment signers',
          description: 'Returns paginated fragment signers, optionally filtered by fragment ID.',
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
            { name: 'fragmentId', in: 'query', schema: { type: 'string' }, description: 'Filter by fragment ID' },
          ],
          responses: {
            200: { description: 'Paginated signers', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: { type: 'object' } }, pagination: { $ref: '#/components/schemas/Pagination' } } } } } },
          },
        },
      },

      // ===================== Sweep Addresses =====================
      '/api/twilight/sweep-addresses': {
        get: {
          tags: ['Bridge'],
          summary: 'List proposed sweep addresses',
          description: 'Returns proposed BTC sweep addresses from the LCD. Cached for 10 minutes.',
          parameters: [
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 100, maximum: 200 } },
          ],
          responses: {
            200: { description: 'Sweep addresses from LCD' },
          },
        },
      },

      // ===================== zkOS =====================
      '/api/twilight/zkos/transfers': {
        get: {
          tags: ['zkOS'],
          summary: 'List zkOS transfers',
          description: 'Returns paginated zkOS transfer transactions.',
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
          ],
          responses: {
            200: { description: 'Paginated zkOS transfers', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: { type: 'object' } }, pagination: { $ref: '#/components/schemas/Pagination' } } } } } },
          },
        },
      },
      '/api/twilight/zkos/transfers/{txId}': {
        get: {
          tags: ['zkOS'],
          summary: 'Get zkOS transfer by transaction ID',
          parameters: [
            { name: 'txId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            200: { description: 'zkOS transfer details' },
            404: { description: 'Transfer not found' },
          },
        },
      },
      '/api/twilight/zkos/mint-burns': {
        get: {
          tags: ['zkOS'],
          summary: 'List zkOS mint/burn operations',
          description: 'Returns paginated mint and burn operations, optionally filtered by type.',
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
            { name: 'type', in: 'query', schema: { type: 'string', enum: ['mint', 'burn'] } },
          ],
          responses: {
            200: { description: 'Paginated mint/burn operations', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: { type: 'object' } }, pagination: { $ref: '#/components/schemas/Pagination' } } } } } },
          },
        },
      },

      // ===================== Delegates =====================
      '/api/twilight/delegates': {
        get: {
          tags: ['Validators'],
          summary: 'List delegate keys',
          description: 'Returns all registered delegate keys (validator → BTC oracle, zkOS oracle mappings).',
          responses: {
            200: { description: 'Array of delegate keys', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/DelegateKey' } } } } },
          },
        },
      },

      // ===================== Search =====================
      '/api/twilight/search': {
        get: {
          tags: ['Search'],
          summary: 'Global search',
          description: 'Searches across blocks, transactions, accounts, and deposits. Detects the query type automatically (block height, tx hash, or address).',
          parameters: [
            { name: 'q', in: 'query', required: true, schema: { type: 'string', minLength: 3 }, description: 'Search query (block height, tx hash, or twilight address)' },
          ],
          responses: {
            200: {
              description: 'Search results',
              content: { 'application/json': { schema: { type: 'object', properties: { block: { $ref: '#/components/schemas/Block' }, transaction: { $ref: '#/components/schemas/Transaction' }, account: { $ref: '#/components/schemas/Account' }, deposits: { type: 'array', items: { $ref: '#/components/schemas/Deposit' } } } } } },
            },
            400: { description: 'Query too short (min 3 characters)' },
          },
        },
      },

      // ===================== Bitcoin =====================
      '/api/bitcoin/info': {
        get: {
          tags: ['Bitcoin'],
          summary: 'Get Bitcoin node info',
          description: 'Returns the latest Bitcoin block height and current fee estimate from the connected BTC node. Cached for 30 seconds.',
          responses: {
            200: {
              description: 'Bitcoin node info',
              content: { 'application/json': { schema: { type: 'object', properties: { blockHeight: { type: 'integer', example: 878000 }, feeEstimate: { type: 'object', properties: { satPerVbyte: { type: 'integer', nullable: true, example: 12, description: 'Fee rate in sat/vB' }, btcPerKb: { type: 'number', nullable: true, example: 0.00012, description: 'Fee rate in BTC/kB (raw from node)' }, targetBlocks: { type: 'integer', example: 6, description: 'Confirmation target in blocks' } } } } } } },
            },
            500: { description: 'Failed to reach Bitcoin node' },
          },
        },
      },
    },
  },
  apis: [], // We define paths inline above, no JSDoc scanning needed
};

export const swaggerSpec = swaggerJsdoc(options);
