import type { TemporaryDisable, TemporaryOverride } from '../../domain/types/entities'
import type { RuleId } from '../../domain/types/brand'

export interface RuleDisableRecord {
  readonly ruleId: RuleId
  readonly state: TemporaryDisable
}

export interface SessionStatePort {
  getOverrides(): Promise<readonly TemporaryOverride[]>
  setOverrides(overrides: readonly TemporaryOverride[]): Promise<void>
  getRuleDisables(): Promise<readonly RuleDisableRecord[]>
  setRuleDisables(disables: readonly RuleDisableRecord[]): Promise<void>
  removeOverridesForTab(tabId: number): Promise<readonly TemporaryOverride[]>
  reconcileRouting(
    checkedTabIds: ReadonlySet<number>,
    liveTabIds: ReadonlySet<number>,
    now: Date,
    browserRestart: boolean,
  ): Promise<{
    overrides: readonly TemporaryOverride[]
    disables: readonly RuleDisableRecord[]
  }>
  reconcileErrorContexts(
    liveTabIds: ReadonlySet<number>,
    now: Date,
    browserRestart: boolean,
  ): Promise<void>
}
