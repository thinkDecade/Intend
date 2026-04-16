import type { IntentionObject } from './intention.js';

export type ExecutionStatus =
  | 'pending'
  | 'confirmed'
  | 'executing'
  | 'complete'
  | 'failed'
  | 'cancelled'
  | 'parked';

export interface ExecutionStep {
  step_id:     string;
  name:        string;
  description: string;
  protocol:    string;    // internal only — never shown to user
  action:      string;    // internal only — e.g. 'supply', 'swap'
  /** Args passed to the Skill Registry at execution time */
  args:        Record<string, string | number | bigint>;
  network:     'mainnet' | 'testnet';
  status:      'pending' | 'executing' | 'complete' | 'failed';
}

export interface ExecutionPlan {
  plan_id:    string;
  intention:  IntentionObject;
  user_id:    string;

  steps: ExecutionStep[];

  /** User-facing confirmation text. Outcome language — no protocol/chain names. */
  confirmation_preview: string;

  fees: {
    gas_usd:          number;
    protocol_fee_usd: number;
    intend_fee_usd:   number;
    total_usd:        number;
  };

  timing_estimate_seconds: number;
  slippage_tolerance:      number;
  minimum_received?:       string;  // human-readable minimum output for DEX ops

  status:        ExecutionStatus;
  tx_hash?:      string;
  created_at?:   string;
  confirmed_at?: string;
  executed_at?:  string;
}
