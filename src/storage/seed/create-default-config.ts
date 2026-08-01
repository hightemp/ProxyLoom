import type { AppConfig } from '../../domain/types/entities'

export const createDefaultConfig = (): AppConfig => ({
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
  profiles: [],
  revision: 0,
  rules: [],
  schemaVersion: 2,
})
