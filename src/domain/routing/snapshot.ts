import type {
  AppConfig,
  BrowserPlatform,
  ProxyProfile,
  Rule,
  TemporaryOverride,
} from '../types/entities'
import type { ProxyProfileId } from '../types/brand'
import { err, ok, type Result } from '../types/result'
import { sortRules } from '../rules/order'

export interface RoutingSnapshot {
  readonly revision: number
  readonly hash: string
  readonly mode: AppConfig['general']['mode']
  readonly activeProxyProfileId: ProxyProfileId | null
  readonly profiles: readonly ProxyProfile[]
  readonly rules: readonly Rule[]
  readonly overrides: readonly TemporaryOverride[]
}

export interface SnapshotBuildError {
  readonly code: 'ACTIVE_PROFILE_REQUIRED' | 'ACTIVE_PROFILE_NOT_FOUND'
  readonly profileId: ProxyProfileId | null
}

const fnv1a = (value: string): string => {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

const stableSnapshotValue = (
  config: AppConfig,
  rules: readonly Rule[],
  overrides: readonly TemporaryOverride[],
): string =>
  JSON.stringify({
    activeProxyProfileId: config.general.activeProxyProfileId,
    mode: config.general.mode,
    overrides,
    profiles: config.profiles,
    revision: config.revision,
    rules,
  })

export const buildRoutingSnapshot = (
  config: AppConfig,
  overrides: readonly TemporaryOverride[],
  now: Date,
): Result<RoutingSnapshot, SnapshotBuildError> => {
  const activeProfileId = config.general.activeProxyProfileId
  if (config.general.mode === 'PROXY' && activeProfileId === null) {
    return err({ code: 'ACTIVE_PROFILE_REQUIRED', profileId: null })
  }
  if (
    config.general.mode === 'PROXY' &&
    !config.profiles.some((profile) => profile.id === activeProfileId)
  ) {
    return err({
      code: 'ACTIVE_PROFILE_NOT_FOUND',
      profileId: activeProfileId,
    })
  }

  const rules = sortRules(config.rules).map((rule) => {
    if (
      rule.temporaryDisable?.kind === 'UNTIL' &&
      rule.temporaryDisable.until !== null &&
      Date.parse(rule.temporaryDisable.until) <= now.getTime()
    ) {
      return { ...rule, temporaryDisable: null }
    }
    return rule
  })
  const hash = fnv1a(stableSnapshotValue(config, rules, overrides))
  return ok({
    activeProxyProfileId: activeProfileId,
    hash,
    mode: config.general.mode,
    overrides: [...overrides],
    profiles: [...config.profiles],
    revision: config.revision,
    rules,
  })
}

export const profileById = (
  snapshot: RoutingSnapshot,
  profileId: ProxyProfileId,
): ProxyProfile | null => snapshot.profiles.find((profile) => profile.id === profileId) ?? null

export const compatibleRuleCount = (snapshot: RoutingSnapshot, platform: BrowserPlatform): number =>
  snapshot.rules.filter((rule) => rule.matcherType === 'ORIGIN' || platform === 'FIREFOX').length
