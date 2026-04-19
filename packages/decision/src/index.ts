// v0.5_updated public surface — only the active builders are re-exported.
// The legacy strategy files (protect/grow/save/earn/invest/move/spend) still
// exist on disk but are no longer reachable through the router; they will
// be removed wholesale once Convert (v0.6) and Allocate (v0.7) ship with
// their own freshly-written builders.
export { generatePlan, PrimitiveDisabledError,
         buildSendPlan } from './strategy/index.js';
export type { StrategyContext, MoveRecipientType, SpendResult } from './strategy/index.js';

export { resolveAssets, InsufficientBalanceError,
         SlippageExceededError, MAX_SLIPPAGE_PCT, MAX_COST_PCT } from './asset-resolver.js';
export type { AssetResolutionResult, ResolvedAsset, ConversionPath,
              ConversionRoute } from './asset-resolver.js';

export { checkPermission, checkRecipientPermission } from './permission-gate.js';
export type { PermissionCheck } from './permission-gate.js';
