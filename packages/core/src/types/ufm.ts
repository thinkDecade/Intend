export interface Balance {
  asset:     string;
  chain:     string;
  amount:    number;
  usd_value: number;
  protocol:  string | null;  // 'aave_v3', 'morpho', null for wallet
  apy:       number | null;
}

export interface PendingConfirmation {
  intent_id:  string;
  primitive:  string;
  summary:    string;
  created_at: string;
  expires_at: string;
}

export interface Goal {
  id:          string;
  name:        string;
  target_usd:  number;
  current_usd: number;
  apy:         number | null;
  created_at:  string;
}

export interface Position {
  id:           string;
  asset:        string;
  protocol:     string;
  amount:       number;
  usd_value:    number;
  apy_at_entry: number;
  opened_at:    string;
}

export interface UserFinancialModel {
  user_id: string;

  present: {
    balances:               Balance[];
    total_usd_value:        number;
    pending_confirmations:  PendingConfirmation[];
    active_goals:           Goal[];
    active_positions:       Position[];
  };

  environment: {
    region:          string;   // ISO country code e.g. 'TR', 'GB', 'BR'
    local_currency:  string;   // 'TRY', 'GBP', 'BRL'
    fx_rate:         number;   // local currency per USD
    fx_trend:        'weakening' | 'stable' | 'strengthening';
    fx_change_30d:   number;   // percentage, negative = weakening
    inflation_rate:  number;   // annual percentage
    hedge_score:     number;   // 0.0 to 1.0
    best_apy:        number;   // best available yield rate
    current_apy:     number | null;
  };

  identity: {
    user_id:                       string;
    /** autonomous = executes immediately; semi_autonomous = confirms before every execution */
    execution_mode:                'autonomous' | 'semi_autonomous';
    preferred_channel:             'telegram' | 'whatsapp' | 'web';
    kyc_tier:                      'tier_0' | 'tier_1' | 'tier_2' | 'tier_3';
    max_auto_tx_usd:               number;
    intend_handle:                 string | null;
    require_confirm_new_recipient: boolean;
  };
}
