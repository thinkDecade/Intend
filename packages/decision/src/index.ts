export { generatePlan, PrimitiveDisabledError,
         buildProtectPlan, buildGrowPlan, buildConvertPlan,
         buildMovePlan, buildSavePlan, buildEarnPlan, buildInvestPlan,
         buildSpendPlan } from './strategy/index.js';
export type { StrategyContext, MoveRecipientType, SpendResult } from './strategy/index.js';

export { resolveAssets, InsufficientBalanceError,
         SlippageExceededError, MAX_SLIPPAGE_PCT, MAX_COST_PCT } from './asset-resolver.js';
export type { AssetResolutionResult, ResolvedAsset, ConversionPath,
              ConversionRoute } from './asset-resolver.js';

export { checkPermission, checkRecipientPermission } from './permission-gate.js';
export type { PermissionCheck } from './permission-gate.js';
