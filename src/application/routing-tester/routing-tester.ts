import { resolveRoute, type RoutingRequestContext } from '../../domain/routing/resolver'
import type { RoutingSnapshot } from '../../domain/routing/snapshot'
import type { ProxyProfileId, RuleId } from '../../domain/types/brand'

export interface RoutingTraceRow {
  readonly ruleId: RuleId
  readonly ruleName: string
  readonly status:
    | 'MATCHED'
    | 'NO_MATCH'
    | 'DISABLED'
    | 'TEMPORARILY_DISABLED'
    | 'INCOMPATIBLE'
    | 'INVALID_PATTERN'
}

export interface RoutingTestResult {
  readonly action: 'DIRECT' | 'PROXY' | 'CONFIG_ERROR'
  readonly source: 'MODE' | 'OVERRIDE' | 'RULE' | 'FALLBACK'
  readonly profileId: ProxyProfileId | null
  readonly profileName: string | null
  readonly matchedRuleId: RuleId | null
  readonly normalizedTarget: string | null
  readonly errorCode: string | null
  readonly trace: readonly RoutingTraceRow[]
}

export const testRouting = (
  snapshot: RoutingSnapshot,
  context: RoutingRequestContext,
): RoutingTestResult => {
  const decision = resolveRoute(snapshot, context)
  const ruleNames = new Map(snapshot.rules.map((rule) => [rule.id, rule.name]))
  const profile =
    decision.profileId === null
      ? null
      : (snapshot.profiles.find((candidate) => candidate.id === decision.profileId) ?? null)
  return {
    action: decision.action,
    errorCode: decision.errorCode,
    matchedRuleId: decision.matchedRuleId,
    normalizedTarget: decision.normalizedTarget,
    profileId: decision.profileId,
    profileName: profile?.name ?? null,
    source: decision.source,
    trace: decision.trace.map((entry) => ({
      ruleId: entry.ruleId,
      ruleName: ruleNames.get(entry.ruleId) ?? 'Deleted rule',
      status: entry.status,
    })),
  }
}
