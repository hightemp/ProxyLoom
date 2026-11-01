import type { SupportedRequestType, ActualProxyInfo } from '../application/logging/log-types'
import type { ProxyImportStatus } from '../application/profiles/proxy-line-import'
import type { IpGeoProviderErrorCode } from '../application/proxy-check/ip-geo-provider'
import type { RuntimeCommandError } from '../application/runtime/contracts'
import type {
  RoutingDecisionAction,
  RoutingDecisionSource,
  RuleTraceStatus,
} from '../domain/routing/resolver'
import type { ProxyStringErrorCode } from '../domain/profiles/proxy-string'
import type {
  BrowserPlatform,
  ControlStatus,
  GlobalMode,
  RuleValidity,
} from '../domain/types/entities'
import { t, type MessageKey } from '../i18n/messages'

// Exhaustive Record maps make a new enum value a compile error until it gets a localized label.
const labeler =
  <T extends string>(keys: Record<T, MessageKey>) =>
  (value: T): string =>
    t(keys[value])

export const modeLabel = labeler<GlobalMode>({
  DIRECT: 'direct',
  PROXY: 'proxy',
  RULES: 'rules',
})

export const decisionActionLabel = labeler<RoutingDecisionAction>({
  CONFIG_ERROR: 'decisionConfigError',
  DIRECT: 'decisionDirect',
  PROXY: 'decisionProxy',
})

export const decisionSourceLabel = labeler<RoutingDecisionSource>({
  FALLBACK: 'sourceFallback',
  MODE: 'sourceMode',
  OVERRIDE: 'sourceOverride',
  RULE: 'sourceRule',
})

export const inspectionReasonLabel = labeler<'NO_ACTIVE_TAB' | 'UNSUPPORTED_URL'>({
  NO_ACTIVE_TAB: 'reasonNoActiveTab',
  UNSUPPORTED_URL: 'reasonUnsupportedUrl',
})

export const controlStatusLabel = labeler<ControlStatus>({
  CONTROLLABLE: 'controlControllable',
  CONTROLLED_BY_OTHER_EXTENSION: 'controlOtherExtension',
  CONTROLLED_BY_POLICY: 'controlPolicy',
  CONTROLLED_BY_THIS_EXTENSION: 'controlThisExtension',
  NOT_CONTROLLABLE: 'controlNotControllable',
})

export const ruleValidityLabel = labeler<RuleValidity>({
  INVALID_PATTERN: 'validityInvalidPattern',
  INVALID_REFERENCE: 'validityInvalidReference',
  VALID: 'validityValid',
})

export const ruleTraceStatusLabel = labeler<RuleTraceStatus>({
  DISABLED: 'traceDisabled',
  INCOMPATIBLE: 'traceIncompatible',
  INVALID_PATTERN: 'traceInvalidPattern',
  MATCHED: 'traceMatched',
  NO_MATCH: 'traceNoMatch',
  TEMPORARILY_DISABLED: 'traceTemporarilyDisabled',
})

export const requestTypeLabel = labeler<SupportedRequestType>({
  DOWNLOAD: 'requestDownload',
  MAIN_FRAME: 'requestMainFrame',
  OTHER: 'requestOther',
  SUB_FRAME: 'requestSubFrame',
  WEBSOCKET: 'requestWebSocket',
  XMLHTTPREQUEST: 'requestXhr',
})

export const proxyInfoTypeLabel = labeler<ActualProxyInfo['type']>({
  DIRECT: 'proxyInfoDirect',
  HTTP: 'proxyInfoHttp',
  HTTPS: 'proxyInfoHttps',
  SOCKS: 'proxyInfoSocks',
  UNKNOWN: 'proxyInfoUnknown',
})

export const platformLabel = labeler<BrowserPlatform>({
  CHROMIUM: 'chromium',
  FIREFOX: 'firefox',
})

export const importStatusLabel = labeler<ProxyImportStatus>({
  DUPLICATE: 'importStatusDuplicate',
  ERROR: 'importStatusError',
  NEW: 'importStatusNew',
  UNCHANGED: 'importStatusUnchanged',
  UPDATE: 'importStatusUpdate',
})

export const proxyStringErrorLabel = labeler<ProxyStringErrorCode>({
  CONTROL_CHARACTER: 'proxyStringControl',
  CREDENTIALS_CONTROL: 'proxyStringCredentialsControl',
  EMPTY: 'proxyStringEmpty',
  FORMAT: 'proxyStringFormat',
  FOUR_FIELDS_INVALID: 'proxyStringFourFields',
  HOST_INVALID: 'proxyStringHostInvalid',
  HOST_REQUIRED: 'proxyStringHostRequired',
  IPV4_INVALID: 'proxyStringIpv4Invalid',
  IPV6_INVALID: 'proxyStringIpv6Invalid',
  PATH_NOT_ALLOWED: 'proxyStringPathNotAllowed',
  PERCENT_ENCODING_INVALID: 'proxyStringPercentInvalid',
  PORT_INVALID: 'proxyStringPortInvalid',
  PORT_REQUIRED: 'proxyStringPortRequired',
  PROTOCOL_COLUMN_INVALID: 'proxyStringProtocolColumn',
  PROTOCOL_CONFLICT: 'proxyStringProtocolConflict',
  SCHEME_UNSUPPORTED: 'proxyStringSchemeUnsupported',
  SOCKS4_UNSUPPORTED: 'proxyStringSocks4Unsupported',
  SOCKS5_UNSUPPORTED: 'proxyStringSocks5Unsupported',
  SOCKS_AMBIGUOUS: 'proxyStringSocksAmbiguous',
  TOO_LONG: 'proxyStringTooLong',
  USERNAME_REQUIRED: 'proxyStringUsernameRequired',
  UTF8_INVALID: 'proxyStringUtf8Invalid',
})

const checkErrorKeys: Record<IpGeoProviderErrorCode, MessageKey> = {
  HTTP_ERROR: 'checkHttpError',
  INVALID_COUNTRY: 'checkInvalidCountry',
  INVALID_ENDPOINT: 'checkInvalidEndpoint',
  INVALID_IP: 'checkInvalidIp',
  MALFORMED_RESPONSE: 'checkMalformedResponse',
  NETWORK_ERROR: 'checkNetworkError',
  RESPONSE_TOO_LARGE: 'checkResponseTooLarge',
  TIMEOUT: 'checkTimeout',
}

/** Persisted check results keep the stable code; unknown or future codes get a generic label. */
export const checkErrorLabel = (code: string): string =>
  t((checkErrorKeys as Record<string, MessageKey>)[code] ?? 'checkFailed')

const foxyProxySkipKeys: Record<string, MessageKey> = {
  DIRECT_ENTRY: 'skipDirectEntry',
  INVALID_HOST: 'skipInvalidHost',
  INVALID_PORT: 'skipInvalidPort',
  MALFORMED_ENTRY: 'skipMalformedEntry',
  UNSUPPORTED_PAC: 'skipUnsupportedPac',
  UNSUPPORTED_SOCKS: 'skipUnsupportedSocks',
}

export const foxyProxySkipLabel = (reason: string): string =>
  t(foxyProxySkipKeys[reason] ?? 'skipOther')

const errorKeys: Record<string, MessageKey> = {
  ACTIVE_PROFILE_NOT_FOUND: 'errorProfileNotFound',
  ALREADY_RUNNING: 'errorAlreadyRunning',
  CANCELLED: 'errorCancelled',
  ACTIVE_PROFILE_REQUIRED: 'errorActiveProfileRequired',
  CHECK_ALREADY_RUNNING: 'errorCheckAlreadyRunning',
  DOMAIN_SCOPE_UNAVAILABLE: 'errorDomainScopeUnavailable',
  FILTERED_REORDER_FORBIDDEN: 'errorFilteredReorder',
  INPUT_TOO_LARGE: 'errorInputTooLarge',
  INVALID_CONFIG: 'errorInvalidConfig',
  INVALID_URL: 'errorInvalidUrl',
  NO_ACTIVE_TAB: 'errorNoActiveTab',
  NOTHING_TO_IMPORT: 'errorNothingToImport',
  NOT_CONTROLLABLE: 'errorNotControllable',
  PATTERN_INVALID: 'errorPatternInvalid',
  PROFILE_INVALID: 'errorProfileInvalid',
  PROFILE_NOT_FOUND: 'errorProfileNotFound',
  RULE_INVALID: 'errorRuleInvalid',
  RULE_NOT_FOUND: 'errorRuleNotFound',
  TIME_BUDGET_EXCEEDED: 'errorTimeBudgetExceeded',
  UNSUPPORTED_FORMAT: 'errorUnsupportedFormat',
  WORKER_FAILED: 'errorWorkerFailed',
}

/** User-facing text for a runtime error; internal messages are never shown, only a stable code. */
export const errorText = (error: Pick<RuntimeCommandError, 'code'>): string => {
  const key = errorKeys[error.code]
  return key === undefined ? t('errorGeneric', error.code) : t(key)
}

/** Sidebar/popup summary of whether the persisted configuration is active in the browser. */
export const applyStateLabel = (busy: boolean, lastApplyError: string | null): string =>
  lastApplyError !== null ? t('applyStateFailed') : busy ? t('applying') : t('applyStateApplied')
