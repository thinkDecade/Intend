import { randomUUID } from 'crypto';
import type { ExecutionStep } from '@intend/core';

// ── Plan helpers ──────────────────────────────────────────────────────────

export function makePlanId(): string {
  return `plan_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

export interface StepConfig {
  name:        string;
  protocol:    string;
  action:      string;
  description: string;
  args:        Record<string, string | number | bigint>;
  network:     'mainnet' | 'testnet';
  rollback?:   () => Promise<void>;
}

export function makeStep(cfg: StepConfig): ExecutionStep {
  return {
    step_id:     randomUUID(),
    name:        cfg.name,
    description: cfg.description,
    protocol:    cfg.protocol,
    action:      cfg.action,
    args:        cfg.args,
    network:     cfg.network,
    status:      'pending',
  };
}

// ── Rate transparency (CONVERT / MOVE) ────────────────────────────────────
// CLAUDE.md: always show all 4 numbers

export function rateTransparency(params: {
  mid_market_rate:  number;
  spread_pct:       number;
  amount_from:      number;
  asset_from:       string;
  asset_to:         string;
}): string {
  const your_rate  = params.mid_market_rate * (1 - params.spread_pct / 100);
  const you_get    = params.amount_from * your_rate;
  const min_out    = you_get * 0.995; // 0.5% slippage protection

  return (
    `Mid-market: 1 ${params.asset_from} = ${params.mid_market_rate.toFixed(4)} ${params.asset_to}\n` +
    `Spread: ${params.spread_pct.toFixed(2)}%\n` +
    `Your rate: 1 ${params.asset_from} = ${your_rate.toFixed(4)} ${params.asset_to}\n` +
    `Minimum received: ${min_out.toFixed(4)} ${params.asset_to}`
  );
}

// ── Fee summary ───────────────────────────────────────────────────────────

export interface FeeSummary {
  gas_usd:          number;
  protocol_fee_usd: number;
  intend_fee_usd:   number;
  total_usd:        number;
}

export function feeSummary(amountUsd: number, stepCount: number): FeeSummary {
  const gas_usd          = stepCount * 0.05;    // sponsored; shown for transparency
  const protocol_fee_usd = amountUsd * 0.001;   // ~0.1% typical protocol fee
  const intend_fee_usd   = amountUsd * 0.004;   // 0.40% Intend spread
  return {
    gas_usd,
    protocol_fee_usd,
    intend_fee_usd,
    total_usd: gas_usd + protocol_fee_usd + intend_fee_usd,
  };
}
