import {
  asIsoTimestamp,
  asProxyProfileId,
  asRuleId,
  asTemporaryOverrideId,
} from '../../../src/domain/types/brand'
import type {
  AppConfig,
  ProxyEndpoint,
  ProxyProfile,
  Rule,
  TemporaryOverride,
} from '../../../src/domain/types/entities'

export const timestamp = asIsoTimestamp('2026-01-01T00:00:00.000Z')

export const endpoint = (
  host = '127.0.0.1',
  port = 8080,
  transport: ProxyEndpoint['transport'] = 'HTTP',
): ProxyEndpoint => ({
  host,
  password: '',
  port,
  transport,
  username: '',
})

export const profile = (idValue: string, options: Partial<ProxyProfile> = {}): ProxyProfile => ({
  checkUrl: 'https://api.country.is/',
  color: '#405CF5',
  createdAt: timestamp,
  generatedShortName: idValue.slice(0, 3).toUpperCase(),
  httpEndpoint: endpoint('127.0.0.1', 8080),
  httpsEndpoint: endpoint('127.0.0.1', 8443, 'HTTPS'),
  id: asProxyProfileId(idValue),
  lastCheck: null,
  name: idValue,
  note: '',
  shortName: null,
  updatedAt: timestamp,
  useSameProxy: false,
  ...options,
})

export const rule = (idValue: string, position: number, options: Partial<Rule> = {}): Rule => ({
  action: { targetProxyProfileId: null, type: 'DIRECT' },
  createdAt: timestamp,
  description: '',
  enabled: true,
  flags: 'i',
  id: asRuleId(idValue),
  matcherType: 'ORIGIN',
  name: idValue,
  pattern: '^https://example\\.com/$',
  position,
  temporaryDisable: null,
  updatedAt: timestamp,
  validity: 'VALID',
  ...options,
})

export const override = (options: Partial<TemporaryOverride> = {}): TemporaryOverride => ({
  action: { targetProxyProfileId: null, type: 'DIRECT' },
  createdAt: timestamp,
  expiresOnTabClose: true,
  generatedPattern: '^https://example\\.com/$',
  id: asTemporaryOverrideId('override-1'),
  incognito: false,
  originKey: 'https://example.com/',
  platformScope: 'ORIGIN',
  scope: 'EXACT_HOSTNAME',
  sourceTabId: 7,
  ...options,
})

export const config = (options: Partial<AppConfig> = {}): AppConfig => ({
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
    mode: 'RULES',
    proxyCheckTimeoutMs: 10_000,
  },
  profiles: [],
  revision: 1,
  rules: [],
  schemaVersion: 2,
  ...options,
})
