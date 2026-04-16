import type { Hex, Address } from 'viem';

// ── Playbook schema ────────────────────────────────────────────────────────

export interface PayloadArg {
  name:    string;
  /** Where the value comes from at build-time */
  source?: 'token_address' | 'amount_wei' | 'amount_wei_or_max' | 'from_address';
  /** Hardcoded value (used when source is omitted) */
  value?:  string | number;
}

export interface SkillAction {
  /** Solidity function signature, e.g. "supply(address,uint256,address,uint16)" */
  function:     string;
  payload_args: PayloadArg[];
  /** ERC-20 approvals needed before the action tx (order matters) */
  approvals?:   Array<{ token: string; spender: 'contract' | string }>;
  /** Optional ETH value to send with the tx (defaults to 0) */
  value?:       string;
}

export interface SkillPlaybook {
  protocol: string;
  chain:    string;
  version:  string;
  /** Primary contract address (mainnet) */
  contract: Address;
  /** Testnet contract address override */
  contract_testnet?: Address;
  /**
   * If set, the contract address is resolved from this SkillRequest arg
   * at build-time (e.g. erc20_transfer resolves the token contract from "asset").
   */
  contract_from_arg?: string;
  actions:  Record<string, SkillAction>;
  /** Token addresses for this protocol (mainnet) */
  tokens?:  Record<string, Address>;
  /** Testnet token overrides */
  tokens_testnet?: Record<string, Address>;
}

// ── Resolver inputs ────────────────────────────────────────────────────────

export interface SkillRequest {
  protocol:  string;   // 'aave_v3'
  action:    string;   // 'supply'
  chain:     string;   // 'base'
  /** 'mainnet' | 'base-sepolia' */
  network:   'mainnet' | 'testnet';
  args:      Record<string, string | number | bigint>;
  /** Sender wallet address */
  from:      Address;
}

// ── Output ─────────────────────────────────────────────────────────────────

export interface UnsignedTransaction {
  to:          Address;
  value:       bigint;
  data:        Hex;
  chain_id:    number;
  /** Human description for logging / confirmation message */
  description: string;
}

export type BuildTransactionResult = UnsignedTransaction[];

// ── Token registry ─────────────────────────────────────────────────────────

export interface TokenInfo {
  symbol:   string;
  address:  Address;
  decimals: number;
  chain_id: number;
}
