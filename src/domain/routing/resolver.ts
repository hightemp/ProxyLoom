import { effectiveEndpoint } from '../profiles/profile'
import { matchesRegex } from '../regex/validate'
import { isRuleCompatible, isRuleTemporarilyDisabled } from '../rules/rule'
import type { ProxyProfileId, RuleId } from '../types/brand'
import type {
  BrowserPlatform,
  ProxyEndpoint,
  Rule,
  RuleAction,
  TargetScheme,
  TemporaryOverride,
} from '../types/entities'
import { endpointTargetForScheme, normalizeUrl } from '../url/normalize'
import { profileById, type RoutingSnapshot } from './snapshot'

export type RoutingDecisionAction = 'DIRECT' | 'PROXY' | 'CONFIG_ERROR'
export type RoutingDecisionSource = 'MODE' | 'OVERRIDE' | 'RULE' | 'FALLBACK'

export type RuleTraceStatus =
  'MATCHED' | 'NO_MATCH' | 'DISABLED' | 'TEMPORARILY_DISABLED' | 'INCOMPATIBLE' | 'INVALID_PATTERN'

export interface RuleTraceEntry {
  readonly ruleId: RuleId
  readonly status: RuleTraceStatus
}

export interface RoutingRequestContext {
  readonly url: string
  readonly platform: BrowserPlatform
  readonly tabId: number | null
  readonly incognito: boolean
  readonly now: Date
}

export interface RoutingDecision {
  readonly action: RoutingDecisionAction
  readonly source: RoutingDecisionSource
  readonly matchedRuleId: RuleId | null
  readonly matchedOverrideId: TemporaryOverride['id'] | null
  readonly profileId: ProxyProfileId | null
  readonly endpoint: ProxyEndpoint | null
  readonly targetScheme: TargetScheme | null
  readonly normalizedTarget: string | null
  readonly errorCode: string | null
  readonly trace: readonly RuleTraceEntry[]
}

const directDecision = (
  source: RoutingDecisionSource,
  scheme: TargetScheme,
  normalizedTarget: string,
  trace: readonly RuleTraceEntry[],
  matchedRuleId: RuleId | null = null,
  matchedOverrideId: TemporaryOverride['id'] | null = null,
): RoutingDecision => ({
  action: 'DIRECT',
  endpoint: null,
  errorCode: null,
  matchedOverrideId,
  matchedRuleId,
  normalizedTarget,
  profileId: null,
  source,
  targetScheme: scheme,
  trace,
})

const errorDecision = (
  source: RoutingDecisionSource,
  errorCode: string,
  normalizedTarget: string | null,
  scheme: TargetScheme | null,
  trace: readonly RuleTraceEntry[],
  matchedRuleId: RuleId | null = null,
  matchedOverrideId: TemporaryOverride['id'] | null = null,
  profileId: ProxyProfileId | null = null,
): RoutingDecision => ({
  action: 'CONFIG_ERROR',
  endpoint: null,
  errorCode,
  matchedOverrideId,
  matchedRuleId,
  normalizedTarget,
  profileId,
  source,
  targetScheme: scheme,
  trace,
})

const actionDecision = (
  snapshot: RoutingSnapshot,
  action: RuleAction,
  source: RoutingDecisionSource,
  scheme: TargetScheme,
  normalizedTarget: string,
  trace: readonly RuleTraceEntry[],
  matchedRuleId: RuleId | null,
  matchedOverrideId: TemporaryOverride['id'] | null,
): RoutingDecision => {
  if (action.type === 'DIRECT') {
    return directDecision(source, scheme, normalizedTarget, trace, matchedRuleId, matchedOverrideId)
  }
  if (action.targetProxyProfileId === null) {
    return errorDecision(
      source,
      'PROXY_PROFILE_REQUIRED',
      normalizedTarget,
      scheme,
      trace,
      matchedRuleId,
      matchedOverrideId,
    )
  }
  const profile = profileById(snapshot, action.targetProxyProfileId)
  if (profile === null) {
    return errorDecision(
      source,
      'PROXY_PROFILE_NOT_FOUND',
      normalizedTarget,
      scheme,
      trace,
      matchedRuleId,
      matchedOverrideId,
      action.targetProxyProfileId,
    )
  }
  return {
    action: 'PROXY',
    endpoint: effectiveEndpoint(profile, endpointTargetForScheme(scheme)),
    errorCode: null,
    matchedOverrideId,
    matchedRuleId,
    normalizedTarget,
    profileId: profile.id,
    source,
    targetScheme: scheme,
    trace,
  }
}

const overrideApplies = (
  override: TemporaryOverride,
  context: RoutingRequestContext,
  originTarget: string,
): boolean => {
  if (override.incognito !== context.incognito) {
    return false
  }
  if (
    override.platformScope === 'TAB' &&
    (context.platform !== 'FIREFOX' || context.tabId !== override.sourceTabId)
  ) {
    return false
  }
  const match = matchesRegex(originTarget, override.generatedPattern, 'i')
  return match.ok && match.value
}

const evaluateRule = (
  rule: Rule,
  context: RoutingRequestContext,
  originTarget: string,
  fullUrlTarget: string,
): RuleTraceStatus => {
  if (!rule.enabled) {
    return 'DISABLED'
  }
  if (isRuleTemporarilyDisabled(rule, context.now)) {
    return 'TEMPORARILY_DISABLED'
  }
  if (!isRuleCompatible(rule, context.platform)) {
    return 'INCOMPATIBLE'
  }
  if (rule.validity === 'INVALID_PATTERN') {
    return 'INVALID_PATTERN'
  }
  const target = rule.matcherType === 'ORIGIN' ? originTarget : fullUrlTarget
  const match = matchesRegex(target, rule.pattern, rule.flags)
  if (!match.ok) {
    return 'INVALID_PATTERN'
  }
  return match.value ? 'MATCHED' : 'NO_MATCH'
}

export const resolveRoute = (
  snapshot: RoutingSnapshot,
  context: RoutingRequestContext,
): RoutingDecision => {
  const normalized = normalizeUrl(context.url)
  if (!normalized.ok) {
    return errorDecision('MODE', normalized.error.code, null, null, [])
  }
  const { fullUrlTarget, originTarget, scheme } = normalized.value

  if (snapshot.mode === 'DIRECT') {
    return directDecision('MODE', scheme, originTarget, [])
  }

  const matchedOverride = snapshot.overrides.find((override) =>
    overrideApplies(override, context, originTarget),
  )
  if (matchedOverride !== undefined) {
    return actionDecision(
      snapshot,
      matchedOverride.action,
      'OVERRIDE',
      scheme,
      originTarget,
      [],
      null,
      matchedOverride.id,
    )
  }

  const trace: RuleTraceEntry[] = []
  for (const rule of snapshot.rules) {
    const status = evaluateRule(rule, context, originTarget, fullUrlTarget)
    trace.push({ ruleId: rule.id, status })
    if (status === 'MATCHED') {
      return actionDecision(
        snapshot,
        rule.action,
        'RULE',
        scheme,
        rule.matcherType === 'ORIGIN' ? originTarget : fullUrlTarget,
        trace,
        rule.id,
        null,
      )
    }
  }

  if (snapshot.mode === 'RULES') {
    return directDecision('FALLBACK', scheme, originTarget, trace)
  }
  if (snapshot.activeProxyProfileId === null) {
    return errorDecision('FALLBACK', 'ACTIVE_PROXY_PROFILE_REQUIRED', originTarget, scheme, trace)
  }
  return actionDecision(
    snapshot,
    {
      targetProxyProfileId: snapshot.activeProxyProfileId,
      type: 'PROXY',
    },
    'FALLBACK',
    scheme,
    originTarget,
    trace,
    null,
    null,
  )
}
