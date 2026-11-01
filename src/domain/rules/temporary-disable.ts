import type { RuleId } from '../types/brand'
import type { AppConfig, TemporaryDisable } from '../types/entities'

export interface RuleDisableEntry {
  readonly ruleId: RuleId
  readonly state: TemporaryDisable
}

/**
 * Temporary disables are session state (FR-059). The routing snapshot sees a rule as temporarily
 * disabled only through a session record; a value persisted in the config is ignored, so
 * `Until browser restart` can never outlive the session or travel in an export.
 */
export const applyRuleDisables = (
  config: AppConfig,
  disables: readonly RuleDisableEntry[],
): AppConfig => {
  const byRule = new Map(disables.map((record) => [record.ruleId, record.state]))
  return {
    ...config,
    rules: config.rules.map((rule) => ({ ...rule, temporaryDisable: byRule.get(rule.id) ?? null })),
  }
}
