import { effectiveEndpoint } from '../../../domain/profiles/profile'
import type { ProxyEndpoint, RuleAction } from '../../../domain/types/entities'
import { err, ok, type Result } from '../../../domain/types/result'
import { profileById, type RoutingSnapshot } from '../../../domain/routing/snapshot'

export interface PacRouteIR {
  readonly direct: boolean
  readonly httpDirective: string
  readonly httpsDirective: string
}

export interface PacRuleIR extends PacRouteIR {
  readonly pattern: string
  readonly flags: string
}

export interface PacProgramIR {
  readonly rules: readonly PacRuleIR[]
  readonly overrides: readonly PacRuleIR[]
  readonly fallback: PacRouteIR
  readonly revision: number
  readonly snapshotHash: string
}

export interface PacIrError {
  readonly code:
    'DIRECT_MODE_DOES_NOT_USE_PAC' | 'PROFILE_REQUIRED' | 'PROFILE_NOT_FOUND' | 'INVALID_RULE'
  readonly entityId: string | null
}

const endpointDirective = (endpoint: ProxyEndpoint): string => {
  const keyword = endpoint.transport === 'HTTPS' ? 'HTTPS' : 'PROXY'
  return `${keyword} ${endpoint.host}:${endpoint.port}`
}

const routeForAction = (
  snapshot: RoutingSnapshot,
  action: RuleAction,
  entityId: string | null,
): Result<PacRouteIR, PacIrError> => {
  if (action.type === 'DIRECT') {
    return ok({ direct: true, httpDirective: 'DIRECT', httpsDirective: 'DIRECT' })
  }
  if (action.targetProxyProfileId === null) {
    return err({ code: 'PROFILE_REQUIRED', entityId })
  }
  const profile = profileById(snapshot, action.targetProxyProfileId)
  if (profile === null) {
    return err({ code: 'PROFILE_NOT_FOUND', entityId })
  }
  return ok({
    direct: false,
    httpDirective: endpointDirective(effectiveEndpoint(profile, 'HTTP')),
    httpsDirective: endpointDirective(effectiveEndpoint(profile, 'HTTPS')),
  })
}

export const buildPacProgramIR = (snapshot: RoutingSnapshot): Result<PacProgramIR, PacIrError> => {
  if (snapshot.mode === 'DIRECT') {
    return err({ code: 'DIRECT_MODE_DOES_NOT_USE_PAC', entityId: null })
  }

  const overrides: PacRuleIR[] = []
  for (const override of snapshot.overrides) {
    if (override.platformScope !== 'ORIGIN') {
      continue
    }
    const route = routeForAction(snapshot, override.action, override.id)
    if (!route.ok) {
      return route
    }
    overrides.push({
      ...route.value,
      flags: 'i',
      pattern: override.generatedPattern,
    })
  }

  const rules: PacRuleIR[] = []
  for (const rule of snapshot.rules) {
    if (!rule.enabled || rule.temporaryDisable !== null || rule.matcherType !== 'ORIGIN') {
      continue
    }
    if (rule.validity !== 'VALID') {
      return err({ code: 'INVALID_RULE', entityId: rule.id })
    }
    const route = routeForAction(snapshot, rule.action, rule.id)
    if (!route.ok) {
      return route
    }
    rules.push({
      ...route.value,
      flags: rule.flags,
      pattern: rule.pattern,
    })
  }

  const fallback =
    snapshot.mode === 'RULES'
      ? ok<PacRouteIR>({
          direct: true,
          httpDirective: 'DIRECT',
          httpsDirective: 'DIRECT',
        })
      : snapshot.activeProxyProfileId === null
        ? err<PacIrError>({ code: 'PROFILE_REQUIRED', entityId: null })
        : routeForAction(
            snapshot,
            {
              targetProxyProfileId: snapshot.activeProxyProfileId,
              type: 'PROXY',
            },
            null,
          )
  if (!fallback.ok) {
    return fallback
  }

  return ok({
    fallback: fallback.value,
    overrides,
    revision: snapshot.revision,
    rules,
    snapshotHash: snapshot.hash,
  })
}
