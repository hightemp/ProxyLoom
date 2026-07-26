import { asIsoTimestamp, asRuleGroupId, asRuleId } from '../../domain/types/brand'
import type { AppConfig, Rule, RuleGroup } from '../../domain/types/entities'

const PRESET_GROUPS = [
  ['work', 'Work', 'work.example'],
  ['russian-sites', 'Russian Sites', 'russian.example'],
  ['international-sites', 'International Sites', 'international.example'],
  ['social-networks', 'Social Networks', 'social.example'],
  ['local-network', 'Local Network', 'local.example'],
] as const

const escapeHostname = (hostname: string): string => hostname.replaceAll('.', '\\.')

export const createDefaultConfig = (now: Date): AppConfig => {
  const timestamp = asIsoTimestamp(now.toISOString())
  const groups: RuleGroup[] = PRESET_GROUPS.map(([idValue, name], position) => ({
    id: asRuleGroupId(idValue),
    isPreset: true,
    name,
    position,
  }))
  const rules: Rule[] = PRESET_GROUPS.map(([idValue, name, hostname], position) => ({
    action: { targetProxyProfileId: null, type: 'DIRECT' },
    createdAt: timestamp,
    description: `Disabled example for the ${name} group. You can edit or delete it.`,
    enabled: false,
    flags: 'i',
    groupId: asRuleGroupId(idValue),
    id: asRuleId(`demo-${idValue}`),
    matcherType: 'ORIGIN',
    name: `${name} example`,
    pattern: `^https://${escapeHostname(hostname)}/$`,
    position,
    temporaryDisable: null,
    updatedAt: timestamp,
    validity: 'VALID',
  }))

  return {
    appearance: { theme: 'SYSTEM' },
    general: {
      activeProxyProfileId: null,
      confirmDangerousActions: true,
      errorPageEnabled: true,
      geoIpEnabled: true,
      ipGeoProviderEndpoint: 'https://api.country.is/',
      logLevel: 'INFO',
      loggingEnabled: true,
      loggingMode: 'NAVIGATIONS_AND_FAILURES',
      loggingPaused: false,
      mode: 'DIRECT',
      proxyCheckTimeoutMs: 10_000,
    },
    groups,
    profiles: [],
    revision: 0,
    rules,
    schemaVersion: 1,
  }
}
