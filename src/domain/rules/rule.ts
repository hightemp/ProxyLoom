import type { BrowserPlatform, Rule } from '../types/entities'

export const isRuleCompatible = (rule: Rule, platform: BrowserPlatform): boolean =>
  rule.matcherType === 'ORIGIN' || platform === 'FIREFOX'

export const isRuleTemporarilyDisabled = (rule: Rule, now: Date): boolean => {
  const state = rule.temporaryDisable
  if (state === null) {
    return false
  }
  if (state.kind === 'UNTIL_RESTART') {
    return true
  }
  return state.until !== null && Date.parse(state.until) > now.getTime()
}
