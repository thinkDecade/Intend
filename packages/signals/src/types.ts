export interface FxSignal {
  region: string;
  local_currency: string;
  fx_rate: number;          // local currency per 1 USD
  fx_trend: 'weakening' | 'stable' | 'strengthening';
  fx_change_30d: number;    // percentage; negative = weakening
  fx_volatility_30d: number;
  inflation_rate: number;   // annual percentage
  fetched_at: number;       // unix ms
}

export interface ProtocolApy {
  protocol: string;         // 'aave_v3' | 'morpho' | 'moonwell'
  asset: string;            // 'USDC' | 'ETH' etc.
  chain: string;            // 'base'
  apy: number;              // annual percentage
  tvl: number;              // USD
  pool_id: string;          // DefiLlama pool identifier
}

export interface ApySignal {
  protocols: ProtocolApy[];
  fetched_at: number;
}

export interface PriceSignal {
  asset: string;
  usd_price: number;
  fetched_at: number;
}

export interface GasSignal {
  base_fee_gwei: number;
  priority_fee_gwei: number;
  max_fee_gwei: number;
  estimated_transfer_usd: number;   // simple ERC-20 transfer
  estimated_swap_usd: number;       // DEX swap
  estimated_yield_usd: number;      // Aave supply
  fetched_at: number;
}

export interface HedgeSignal {
  region: string;
  score: number;            // 0.0 to 1.0
  tier: 'none' | 'monitor' | 'suggest' | 'alert' | 'emergency';
  fetched_at: number;
}
