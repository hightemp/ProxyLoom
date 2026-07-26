import { validateRegex } from '../regex/validate'
import type { ProxyProfileId, RuleGroupId } from '../types/brand'
import type { Rule, RuleGroup, RuleValidity, TemporaryOverride } from '../types/entities'
import { err, ok, type Result } from '../types/result'

export type RuleValidationCode =
  | 'RULE_NAME_REQUIRED'
  | 'GROUP_NOT_FOUND'
  | 'PROXY_PROFILE_REQUIRED'
  | 'DIRECT_PROFILE_FORBIDDEN'
  | 'PROXY_PROFILE_NOT_FOUND'
  | 'PATTERN_INVALID'
  | 'POSITION_INVALID'

export interface RuleValidationError {
  readonly code: RuleValidationCode
  readonly field: string
}

export interface RuleReferences {
  readonly groupIds: ReadonlySet<RuleGroupId>
  readonly profileIds: ReadonlySet<ProxyProfileId>
}

export const deriveRuleValidity = (rule: Rule, references: RuleReferences): RuleValidity => {
  const regex = validateRegex(rule.pattern, rule.flags)
  if (!regex.ok) {
    return 'INVALID_PATTERN'
  }
  if (
    !references.groupIds.has(rule.groupId) ||
    (rule.action.type === 'PROXY' &&
      (rule.action.targetProxyProfileId === null ||
        !references.profileIds.has(rule.action.targetProxyProfileId)))
  ) {
    return 'INVALID_REFERENCE'
  }
  return 'VALID'
}

export const validateRule = (
  rule: Rule,
  references: RuleReferences,
): Result<Rule, RuleValidationError> => {
  if (rule.name.trim().length === 0) {
    return err({ code: 'RULE_NAME_REQUIRED', field: 'name' })
  }
  if (!Number.isInteger(rule.position) || rule.position < 0) {
    return err({ code: 'POSITION_INVALID', field: 'position' })
  }
  if (!references.groupIds.has(rule.groupId)) {
    return err({ code: 'GROUP_NOT_FOUND', field: 'groupId' })
  }
  if (rule.action.type === 'PROXY' && rule.action.targetProxyProfileId === null) {
    return err({ code: 'PROXY_PROFILE_REQUIRED', field: 'action.targetProxyProfileId' })
  }
  if (rule.action.type === 'DIRECT' && rule.action.targetProxyProfileId !== null) {
    return err({ code: 'DIRECT_PROFILE_FORBIDDEN', field: 'action.targetProxyProfileId' })
  }
  if (
    rule.action.type === 'PROXY' &&
    rule.action.targetProxyProfileId !== null &&
    !references.profileIds.has(rule.action.targetProxyProfileId)
  ) {
    return err({ code: 'PROXY_PROFILE_NOT_FOUND', field: 'action.targetProxyProfileId' })
  }
  if (!validateRegex(rule.pattern, rule.flags).ok) {
    return err({ code: 'PATTERN_INVALID', field: 'pattern' })
  }
  return ok(rule)
}

export const validateGroup = (
  group: RuleGroup,
): Result<RuleGroup, { code: 'GROUP_NAME_REQUIRED' | 'POSITION_INVALID'; field: string }> => {
  if (group.name.trim().length === 0) {
    return err({ code: 'GROUP_NAME_REQUIRED', field: 'name' })
  }
  if (!Number.isInteger(group.position) || group.position < 0) {
    return err({ code: 'POSITION_INVALID', field: 'position' })
  }
  return ok(group)
}

export const validateOverride = (
  override: TemporaryOverride,
  profileIds: ReadonlySet<ProxyProfileId>,
): Result<
  TemporaryOverride,
  { code: 'INVALID_TAB' | 'INVALID_PATTERN' | 'PROXY_PROFILE_NOT_FOUND'; field: string }
> => {
  if (!Number.isInteger(override.sourceTabId) || override.sourceTabId < 0) {
    return err({ code: 'INVALID_TAB', field: 'sourceTabId' })
  }
  if (!validateRegex(override.generatedPattern, 'i').ok) {
    return err({ code: 'INVALID_PATTERN', field: 'generatedPattern' })
  }
  if (
    override.action.type === 'PROXY' &&
    (override.action.targetProxyProfileId === null ||
      !profileIds.has(override.action.targetProxyProfileId))
  ) {
    return err({ code: 'PROXY_PROFILE_NOT_FOUND', field: 'action.targetProxyProfileId' })
  }
  return ok(override)
}
