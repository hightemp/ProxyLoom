import type {
  IsoTimestamp,
  ProxyProfileId,
  RuleGroupId,
  RuleId,
  TemporaryOverrideId,
} from './brand'

export type GlobalMode = 'DIRECT' | 'PROXY' | 'RULES'
export type ProxyTransport = 'HTTP' | 'HTTPS'
export type TargetScheme = 'http' | 'https' | 'ws' | 'wss'
export type MatcherType = 'ORIGIN' | 'FULL_URL'
export type RuleActionType = 'DIRECT' | 'PROXY'
export type BrowserPlatform = 'CHROMIUM' | 'FIREFOX'
export type AppearanceTheme = 'SYSTEM' | 'LIGHT' | 'DARK'
export type LoggingMode = 'NAVIGATIONS_AND_FAILURES' | 'ALL_SUPPORTED_REQUESTS'
export type LogLevel = 'ERROR' | 'INFO' | 'DEBUG'
export type ControlStatus =
  | 'CONTROLLED_BY_THIS_EXTENSION'
  | 'CONTROLLABLE'
  | 'CONTROLLED_BY_OTHER_EXTENSION'
  | 'CONTROLLED_BY_POLICY'
  | 'NOT_CONTROLLABLE'

export interface ProxyEndpoint {
  readonly transport: ProxyTransport
  readonly host: string
  readonly port: number
  readonly username: string
  readonly password: string
}

export interface ProxyCheckResult {
  readonly availability: boolean
  readonly totalDurationMs: number
  readonly connectDurationMs: number | null
  readonly externalIp: string | null
  readonly country: string | null
  readonly httpStatus: number | null
  readonly errorCode: string | null
  readonly checkedAt: IsoTimestamp
}

export interface ProxyProfile {
  readonly id: ProxyProfileId
  readonly name: string
  readonly shortName: string | null
  readonly generatedShortName: string
  readonly color: string
  readonly note: string
  readonly checkUrl: string
  readonly useSameProxy: boolean
  readonly httpEndpoint: ProxyEndpoint
  readonly httpsEndpoint: ProxyEndpoint
  readonly createdAt: IsoTimestamp
  readonly updatedAt: IsoTimestamp
  readonly lastCheck: ProxyCheckResult | null
}

export interface TemporaryDisable {
  readonly kind: 'UNTIL' | 'UNTIL_RESTART'
  readonly until: IsoTimestamp | null
}

export interface RuleAction {
  readonly type: RuleActionType
  readonly targetProxyProfileId: ProxyProfileId | null
}

export type RuleValidity = 'VALID' | 'INVALID_REFERENCE' | 'INVALID_PATTERN'

export interface Rule {
  readonly id: RuleId
  readonly name: string
  readonly description: string
  readonly enabled: boolean
  readonly groupId: RuleGroupId
  readonly position: number
  readonly matcherType: MatcherType
  readonly pattern: string
  readonly flags: string
  readonly action: RuleAction
  readonly temporaryDisable: TemporaryDisable | null
  readonly validity: RuleValidity
  readonly createdAt: IsoTimestamp
  readonly updatedAt: IsoTimestamp
}

export interface RuleGroup {
  readonly id: RuleGroupId
  readonly name: string
  readonly position: number
  readonly isPreset: boolean
}

export type OverrideScope = 'EXACT_HOSTNAME' | 'REGISTRABLE_DOMAIN'
export type OverridePlatformScope = 'TAB' | 'ORIGIN'

export interface TemporaryOverride {
  readonly id: TemporaryOverrideId
  readonly sourceTabId: number
  readonly incognito: boolean
  readonly scope: OverrideScope
  readonly originKey: string
  readonly generatedPattern: string
  readonly action: RuleAction
  readonly platformScope: OverridePlatformScope
  readonly createdAt: IsoTimestamp
  readonly expiresOnTabClose: true
}

export interface GeneralSettings {
  readonly mode: GlobalMode
  readonly activeProxyProfileId: ProxyProfileId | null
  readonly loggingEnabled: boolean
  readonly loggingPaused: boolean
  readonly loggingMode: LoggingMode
  readonly logLevel: LogLevel
  readonly proxyCheckTimeoutMs: number
  readonly ipGeoProviderEndpoint: string
  readonly geoIpEnabled: boolean
  readonly errorPageEnabled: boolean
  readonly confirmDangerousActions: boolean
}

export interface AppearanceSettings {
  readonly theme: AppearanceTheme
}

export interface AppConfig {
  readonly schemaVersion: number
  readonly revision: number
  readonly profiles: readonly ProxyProfile[]
  readonly groups: readonly RuleGroup[]
  readonly rules: readonly Rule[]
  readonly general: GeneralSettings
  readonly appearance: AppearanceSettings
}

export interface Clock {
  now(): Date
}
