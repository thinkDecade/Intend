/**
 * Telegram message formatter
 *
 * Rules (apps/CLAUDE.md):
 * - Bold for amounts, asset names, key numbers
 * - Never markdown tables — render poorly on mobile
 * - Numbers: $1,200.00 not $1200
 * - Percentages: 5.8% not 5.823%
 * - Max confirmation: 400 chars | Max notification: 180 chars
 */

import type { Balance } from '@intend/core';

export function bold(text: string): string {
  return `*${text}*`;
}

export function formatUsd(amount: number): string {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatApy(apy: number): string {
  return `${apy.toFixed(1)}%`;
}

export function formatAmount(amount: number, asset: string): string {
  const decimals = ['ETH', 'BTC', 'WBTC', 'XAUT'].includes(asset) ? 6 : 2;
  return `${amount.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })} ${asset}`;
}

export function formatBalances(balances: Balance[]): string {
  if (balances.length === 0) return 'No assets in wallet yet.';

  const lines = balances.map((b) =>
    `${bold(b.asset)}: ${formatAmount(b.amount, b.asset)} (${formatUsd(b.usd_value)})${b.apy ? ` · ${formatApy(b.apy)} APY` : ''}`
  );

  const total = balances.reduce((s, b) => s + b.usd_value, 0);
  lines.push(`\n${bold('Total')}: ${formatUsd(total)}`);
  return lines.join('\n');
}

export function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + '…';
}
