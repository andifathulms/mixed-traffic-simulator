import type { LateralRuleId } from '../types';
import type { LateralRule } from './rule';
import { sublaneRule } from './sublane';
import { socialRule } from './social';
import { lanesRule } from './lanes';

export type { LateralRule, LateralContext, OffsetScore } from './rule';
export { sublaneRule, socialRule, lanesRule };

export const LATERAL_RULES: Record<LateralRuleId, LateralRule> = {
  lanes: lanesRule,
  sublane: sublaneRule,
  social: socialRule,
};

export function getLateralRule(id: LateralRuleId): LateralRule {
  return LATERAL_RULES[id];
}
