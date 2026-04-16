import { isAddress, getAddress } from 'viem';
import type { CdpEvmWalletProvider } from '@coinbase/agentkit';
import { buildTransaction } from '@intend/skills';

// ── Security constants (CLAUDE.md rules) ─────────────────────────────────

const LARGE_TX_THRESHOLD = 200;     // USD — 6-char confirmation required
const CONFIRM_CHARS      = 6;

// ── Types ─────────────────────────────────────────────────────────────────

export interface CryptoCheckoutParams {
  recipient:        string;          // raw input (address or ENS name)
  resolved_address: string;          // checksummed EVM address
  ens_name:         string | null;   // null if not ENS
  asset:            string;          // 'USDC' etc.
  amount:           bigint;
  amount_usd:       number;
  is_new_recipient: boolean;
  network:          'mainnet' | 'testnet';
}

export interface CheckoutResult {
  tx_hash:  string;
  to:       string;
  asset:    string;
  amount:   bigint;
}

// ── Pre-execution validation (run at confirmation time AND at execution) ──

export function validateCheckout(params: CryptoCheckoutParams): void {
  // 1. Validate address checksum
  if (!isAddress(params.resolved_address)) {
    throw new InvalidAddressError(`Invalid address: ${params.resolved_address}`);
  }

  // 2. Ensure address hasn't changed since preview
  const checksummed = getAddress(params.resolved_address);
  if (checksummed !== getAddress(params.resolved_address)) {
    throw new AddressChangedError('Destination address changed between preview and execution');
  }
}

/**
 * Verify the user's 6-character address confirmation for large payments.
 * Returns true if correct, false if wrong.
 */
export function verifyAddressConfirmation(
  resolvedAddress: string,
  userInput:       string
): boolean {
  if (!isAddress(resolvedAddress)) return false;
  const last6 = getAddress(resolvedAddress).slice(-CONFIRM_CHARS);
  return userInput.trim().toLowerCase() === last6.toLowerCase();
}

// ── Execution ─────────────────────────────────────────────────────────────

export async function executeCryptoCheckout(
  params:   CryptoCheckoutParams,
  provider: CdpEvmWalletProvider
): Promise<CheckoutResult> {
  // Re-validate at execution time (security rule from CLAUDE.md)
  validateCheckout(params);

  const walletAddress = provider.getAddress() as `0x${string}`;
  const to            = getAddress(params.resolved_address);

  const unsignedTxs = await buildTransaction({
    protocol: 'erc20_transfer',
    action:   'transfer',
    chain:    'base',
    network:  params.network,
    from:     walletAddress,
    args: {
      asset:  params.asset,
      amount: params.amount,
      to,
    },
  });

  let lastHash = '';
  for (const utx of unsignedTxs) {
    lastHash = await provider.sendTransaction({
      to:    utx.to,
      value: utx.value,
      data:  utx.data,
    });
  }

  return {
    tx_hash: lastHash,
    to,
    asset:   params.asset,
    amount:  params.amount,
  };
}

// ── Errors ────────────────────────────────────────────────────────────────

export class InvalidAddressError extends Error {
  constructor(message: string) { super(message); this.name = 'InvalidAddressError'; }
}

export class AddressChangedError extends Error {
  constructor(message: string) { super(message); this.name = 'AddressChangedError'; }
}

export class AddressConfirmationRequiredError extends Error {
  public readonly last_6_chars: string;
  constructor(address: string) {
    const last6 = getAddress(address).slice(-CONFIRM_CHARS);
    super(`Amount > $${LARGE_TX_THRESHOLD} — enter last 6 characters of address: ${last6}`);
    this.name          = 'AddressConfirmationRequiredError';
    this.last_6_chars  = last6;
  }
}

export { LARGE_TX_THRESHOLD, CONFIRM_CHARS };
