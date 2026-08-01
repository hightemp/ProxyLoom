import type { ProxyProfileId } from '../types/brand'
import type { BrowserPlatform, Rule, RuleActionType } from '../types/entities'
import { isRuleCompatible } from './rule'
import { sortRules } from './order'

export interface RuleFilters {
  readonly query: string
  readonly action: RuleActionType | null
  readonly profileId: ProxyProfileId | null
  readonly enabled: boolean | null
  readonly compatibility: BrowserPlatform | null
}

export const EMPTY_RULE_FILTERS: RuleFilters = {
  action: null,
  compatibility: null,
  enabled: null,
  profileId: null,
  query: '',
}

export const hasActiveRuleFilters = (filters: RuleFilters): boolean =>
  filters.query.trim().length > 0 ||
  filters.action !== null ||
  filters.profileId !== null ||
  filters.enabled !== null ||
  filters.compatibility !== null

export const filterRules = (rules: readonly Rule[], filters: RuleFilters): readonly Rule[] => {
  const query = filters.query.trim().toLocaleLowerCase('en')
  return sortRules(rules).filter((rule) => {
    if (
      query.length > 0 &&
      !`${rule.name}\n${rule.description}\n${rule.pattern}`.toLocaleLowerCase('en').includes(query)
    ) {
      return false
    }
    if (filters.action !== null && rule.action.type !== filters.action) {
      return false
    }
    if (filters.profileId !== null && rule.action.targetProxyProfileId !== filters.profileId) {
      return false
    }
    if (filters.enabled !== null && rule.enabled !== filters.enabled) {
      return false
    }
    return filters.compatibility === null || isRuleCompatible(rule, filters.compatibility)
  })
}
