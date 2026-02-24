import axios, { AxiosInstance } from 'axios';
import { config } from './config.js';
import { logger } from './logger.js';

// ============================================
// Type Definitions
// ============================================

export interface BlockHeader {
  version: {
    block: string;
    app: string;
  };
  chain_id: string;
  height: string;
  time: string;
  last_block_id: {
    hash: string;
    part_set_header: {
      total: number;
      hash: string;
    };
  };
  last_commit_hash: string;
  data_hash: string;
  validators_hash: string;
  next_validators_hash: string;
  consensus_hash: string;
  app_hash: string;
  last_results_hash: string;
  evidence_hash: string;
  proposer_address: string;
}

export interface Block {
  block_id: {
    hash: string;
    part_set_header: {
      total: number;
      hash: string;
    };
  };
  block: {
    header: BlockHeader;
    data: {
      txs: string[];
    };
    evidence: {
      evidence: unknown[];
    };
    last_commit: {
      height: string;
      round: number;
      block_id: {
        hash: string;
        part_set_header: {
          total: number;
          hash: string;
        };
      };
      signatures: Array<{
        block_id_flag: string;
        validator_address: string;
        timestamp: string;
        signature: string;
      }>;
    };
  };
}

export interface TxResponse {
  height: string;
  txhash: string;
  codespace: string;
  code: number;
  data: string;
  raw_log: string;
  logs: Array<{
    msg_index: number;
    log: string;
    events: Array<{
      type: string;
      attributes: Array<{
        key: string;
        value: string;
      }>;
    }>;
  }>;
  info: string;
  gas_wanted: string;
  gas_used: string;
  tx: {
    '@type': string;
    body: {
      messages: Array<{
        '@type': string;
        [key: string]: unknown;
      }>;
      memo: string;
      timeout_height: string;
      extension_options: unknown[];
      non_critical_extension_options: unknown[];
    };
    auth_info: {
      signer_infos: Array<{
        public_key: {
          '@type': string;
          key: string;
        };
        mode_info: unknown;
        sequence: string;
      }>;
      fee: {
        amount: Array<{
          denom: string;
          amount: string;
        }>;
        gas_limit: string;
        payer: string;
        granter: string;
      };
    };
    signatures: string[];
  };
  timestamp: string;
  events: Array<{
    type: string;
    attributes: Array<{
      key: string;
      value: string;
      index: boolean;
    }>;
  }>;
}

export interface BlockWithTxsResponse {
  txs?: TxResponse[];  // Some APIs use this
  tx_responses?: TxResponse[];  // Cosmos SDK uses this
  block_id: {
    hash: string;
    part_set_header: {
      total: number;
      hash: string;
    };
  };
  block: {
    header: BlockHeader;
    data: {
      txs: string[];
    };
    evidence: {
      evidence: unknown[];
    };
    last_commit: unknown;
  };
  pagination?: {
    next_key: string | null;
    total: string;
  };
}

export interface Pagination {
  next_key: string | null;
  total: string;
}

// Module-specific query responses
export interface BtcReserveResponse {
  btcReserves: Array<{
    ReserveId: string;
    ReserveAddress: string;
    JudgeAddress: string;
    BtcRelayCapacityValue: string;
    TotalValue: string;
    PrivatePoolValue: string;
    PublicValue: string;
    FeePool: string;
    UnlockHeight: string;
    RoundId: string;
  }>;
}

export interface DelegateKeysResponse {
  delegateKeys: Array<{
    validatorAddress: string;
    btcOracleAddress: string;
    btcPublicKey: string;
    zkOracleAddress: string;
  }>;
}

// ============================================
// LCD Client
// ============================================

export class TwilightLcdClient {
  private client: AxiosInstance;

  constructor(baseUrl: string = config.lcdUrl) {
    this.client = axios.create({
      baseURL: baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add response interceptor for logging
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        logger.error({
          url: error.config?.url,
          status: error.response?.status,
          message: error.message
        }, 'LCD API error');
        throw error;
      }
    );
  }

  // ============================================
  // Block Endpoints
  // ============================================

  async getLatestBlock(): Promise<Block> {
    const response = await this.client.get('/cosmos/base/tendermint/v1beta1/blocks/latest');
    return response.data;
  }

  async getBlockByHeight(height: number): Promise<Block> {
    const response = await this.client.get(`/cosmos/base/tendermint/v1beta1/blocks/${height}`);
    return response.data;
  }

  async getBlockWithTxs(height: number): Promise<BlockWithTxsResponse> {
    const response = await this.client.get(
      `/cosmos/tx/v1beta1/txs/block/${height}`
    );
    return response.data;
  }

  async getLatestBlockHeight(): Promise<number> {
    const block = await this.getLatestBlock();
    return parseInt(block.block.header.height, 10);
  }

  // ============================================
  // Transaction Endpoints
  // ============================================

  async getTx(hash: string): Promise<{ tx_response: TxResponse }> {
    const response = await this.client.get(`/cosmos/tx/v1beta1/txs/${hash}`);
    return response.data;
  }

  async getTxsByHeight(height: number): Promise<{ tx_responses: TxResponse[]; pagination: Pagination }> {
    const response = await this.client.get('/cosmos/tx/v1beta1/txs', {
      params: {
        events: `tx.height=${height}`,
        'pagination.limit': 100,
      },
    });
    return response.data;
  }

  // ============================================
  // Volt Module Queries
  // ============================================

  async getBtcReserves(): Promise<BtcReserveResponse> {
    const response = await this.client.get('/twilightproject/nyks/volt/btc_reserve');
    return response.data;
  }

  async getClearingAccount(twilightAddress: string): Promise<unknown> {
    const response = await this.client.get(
      `/twilightproject/nyks/volt/clearing_account/${twilightAddress}`
    );
    return response.data;
  }

  async getFragments(): Promise<unknown> {
    const response = await this.client.get('/twilightproject/nyks/volt/fragments');
    return response.data;
  }

  async getFragmentById(fragmentId: number): Promise<unknown> {
    const response = await this.client.get(`/twilightproject/nyks/volt/fragment/${fragmentId}`);
    return response.data;
  }

  // ============================================
  // Bridge Module Queries
  // ============================================

  async getRegisteredDepositAddresses(): Promise<unknown> {
    const response = await this.client.get('/twilightproject/nyks/bridge/registered_btc_deposit_addresses');
    return response.data;
  }

  async getRegisteredReserveAddresses(): Promise<unknown> {
    const response = await this.client.get('/twilightproject/nyks/bridge/registered_reserve_addresses');
    return response.data;
  }

  async getWithdrawRequests(): Promise<unknown> {
    const response = await this.client.get('/twilightproject/nyks/bridge/withdraw_btc_request_all');
    return response.data;
  }

  // ============================================
  // Forks Module Queries
  // ============================================

  async getDelegateKeys(): Promise<DelegateKeysResponse> {
    const response = await this.client.get('/twilightproject/nyks/forks/delegate_keys_all');
    return response.data;
  }

  async getAttestations(attestationType?: string, limit?: number): Promise<unknown> {
    const params: Record<string, string | number> = {};
    if (attestationType) params['attestation_type'] = attestationType;
    if (limit) params['limit'] = limit;

    const response = await this.client.get('/twilightproject/nyks/forks/attestations', { params });
    return response.data;
  }

  // ============================================
  // zkOS Module Queries
  // ============================================

  async getZkosTransferTx(txId: string): Promise<unknown> {
    const response = await this.client.get(`/twilightproject/nyks/zkos/transfer_tx/${txId}`);
    return response.data;
  }

  async getMintBurnTradingBtc(twilightAddress: string): Promise<unknown> {
    const response = await this.client.get(
      `/twilightproject/nyks/zkos/mint_or_burn_trading_btc/${twilightAddress}`
    );
    return response.data;
  }

  // ============================================
  // Module Params
  // ============================================

  async getBridgeParams(): Promise<unknown> {
    const response = await this.client.get('/twilightproject/nyks/bridge/params');
    return response.data;
  }

  async getForksParams(): Promise<unknown> {
    const response = await this.client.get('/twilightproject/nyks/forks/params');
    return response.data;
  }

  async getVoltParams(): Promise<unknown> {
    const response = await this.client.get('/twilightproject/nyks/volt/params');
    return response.data;
  }

  async getZkosParams(): Promise<unknown> {
    const response = await this.client.get('/twilightproject/nyks/zkos/params');
    return response.data;
  }

  // ============================================
  // Account Queries
  // ============================================

  async getAccount(address: string): Promise<unknown> {
    const response = await this.client.get(`/cosmos/auth/v1beta1/accounts/${address}`);
    return response.data;
  }

  async getBalance(address: string): Promise<unknown> {
    const response = await this.client.get(`/cosmos/bank/v1beta1/balances/${address}`);
    return response.data;
  }

  // ============================================
  // Node Info
  // ============================================

  async getNodeInfo(): Promise<unknown> {
    const response = await this.client.get('/cosmos/base/tendermint/v1beta1/node_info');
    return response.data;
  }

  async getSyncingStatus(): Promise<{ syncing: boolean }> {
    const response = await this.client.get('/cosmos/base/tendermint/v1beta1/syncing');
    return response.data;
  }
}

// Export singleton instance
export const lcdClient = new TwilightLcdClient();
