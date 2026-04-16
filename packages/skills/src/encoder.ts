import {
  encodeFunctionData,
  parseAbiItem,
  maxUint256,
  type Address,
  type Hex,
} from 'viem';
import type { SkillPlaybook, SkillAction, SkillRequest, UnsignedTransaction } from './types.js';
import { resolveTokenAddress, getChainId } from './resolvers/token.js';
import { toWei } from './resolvers/amount.js';

// ── ERC-20 approval ABI (minimal) ─────────────────────────────────────────

const APPROVE_ABI = [
  parseAbiItem('function approve(address spender, uint256 amount) returns (bool)'),
] as const;

// ── Main encoder ───────────────────────────────────────────────────────────

export function encodeAction(
  playbook: SkillPlaybook,
  actionName: string,
  req: SkillRequest
): UnsignedTransaction[] {
  const action = playbook.actions[actionName];
  if (!action) {
    throw new Error(`[encoder] Action "${actionName}" not found in playbook "${playbook.protocol}"`);
  }

  // Resolve contract address — supports dynamic token contracts (erc20_transfer)
  let contract: Address;
  if (playbook.contract_from_arg) {
    const sym = String(req.args[playbook.contract_from_arg] ?? '');
    if (!sym) throw new Error(`[encoder] Missing contract arg "${playbook.contract_from_arg}"`);
    contract = resolveTokenAddress(sym, req.network);
  } else {
    contract = req.network === 'testnet' && playbook.contract_testnet
      ? playbook.contract_testnet
      : playbook.contract;
  }

  const chain_id = getChainId(req.network);
  const txs: UnsignedTransaction[] = [];

  // ── 1. Build any required ERC-20 approvals first ──────────────────────
  if (action.approvals) {
    for (const approval of action.approvals) {
      const tokenSymbol = resolveArgValue(approval.token, action, req, playbook) as string;
      const tokenAddress = resolveTokenAddress(tokenSymbol, req.network);
      const spender: Address = approval.spender === 'contract'
        ? contract
        : approval.spender as Address;

      const approveData = encodeFunctionData({
        abi: APPROVE_ABI,
        functionName: 'approve',
        args: [spender, maxUint256],
      });

      txs.push({
        to:          tokenAddress,
        value:       0n,
        data:        approveData,
        chain_id,
        description: `Approve ${tokenSymbol} spending`,
      });
    }
  }

  // ── 2. Build the action transaction ───────────────────────────────────
  const resolvedArgs = resolveArgs(action, req, playbook);
  const fnAbi = [parseAbiItem(`function ${action.function}`)] as const;

  let callData: Hex;
  try {
    callData = encodeFunctionData({
      abi:          fnAbi,
      functionName: parseFunctionName(action.function),
      args:         resolvedArgs,
    });
  } catch (err) {
    throw new Error(
      `[encoder] Failed to encode "${actionName}" for "${playbook.protocol}": ${String(err)}`
    );
  }

  const ethValue = action.value
    ? toWei(action.value, 'ETH', req.network)
    : 0n;

  txs.push({
    to:          contract,
    value:       ethValue,
    data:        callData,
    chain_id,
    description: `${playbook.protocol} ${actionName}`,
  });

  return txs;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function parseFunctionName(signature: string): string {
  const idx = signature.indexOf('(');
  return idx === -1 ? signature : signature.slice(0, idx);
}

function resolveArgs(
  action: SkillAction,
  req: SkillRequest,
  playbook: SkillPlaybook
): unknown[] {
  return action.payload_args.map(arg => resolveArgValue(arg.name, action, req, playbook));
}

function resolveArgValue(
  argName: string,
  action: SkillAction,
  req: SkillRequest,
  playbook: SkillPlaybook
): unknown {
  const argDef = action.payload_args.find(a => a.name === argName);
  if (!argDef) return req.args[argName] ?? 0;

  if (argDef.source) {
    switch (argDef.source) {
      case 'token_address': {
        const symbol = String(req.args[argDef.name] ?? argDef.name);
        return resolveTokenAddress(symbol, req.network);
      }
      case 'amount_wei': {
        const raw = req.args[argDef.name] ?? req.args['amount'] ?? 0;
        const assetSymbol = String(req.args['asset'] ?? req.args['asset_from'] ?? 'USDC');
        if (typeof raw === 'bigint') return raw;
        return toWei(String(raw), assetSymbol, req.network);
      }
      case 'amount_wei_or_max': {
        const raw = req.args[argDef.name] ?? req.args['amount'];
        if (!raw || raw === 'max' || raw === '-1') return maxUint256;
        const assetSymbol = String(req.args['asset'] ?? 'USDC');
        if (typeof raw === 'bigint') return raw;
        return toWei(String(raw), assetSymbol, req.network);
      }
      case 'from_address':
        return req.from;
    }
  }

  // Hardcoded value from playbook
  if (argDef.value !== undefined) return argDef.value;

  // Runtime value from request args
  const val = req.args[argDef.name];
  if (val === undefined) {
    throw new Error(`[encoder] Missing required arg "${argDef.name}" in request`);
  }
  return val;
}
