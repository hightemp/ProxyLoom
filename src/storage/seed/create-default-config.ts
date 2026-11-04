import { DEFAULT_SPEED_TEST_ENDPOINT } from '../../config/defaults'
import type { AppConfig } from '../../domain/types/entities'

export const createDefaultConfig = (): AppConfig => ({
  appearance: { accent: 'INDIGO', theme: 'SYSTEM' },
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
    speedTestEndpoint: DEFAULT_SPEED_TEST_ENDPOINT,
  },
  profiles: [],
  revision: 0,
  rules: [],
  schemaVersion: 6,
})
