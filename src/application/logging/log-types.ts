import type { BrowserPlatform, GlobalMode, TargetScheme } from '../../domain/types/entities'
import type { ProxyProfileId, RuleId } from '../../domain/types/brand'

export type SupportedRequestType =
  'MAIN_FRAME' | 'SUB_FRAME' | 'XMLHTTPREQUEST' | 'WEBSOCKET' | 'DOWNLOAD' | 'OTHER'

export interface ActualProxyInfo {
  readonly type: 'DIRECT' | 'HTTP' | 'HTTPS' | 'SOCKS' | 'UNKNOWN'
  readonly host: string | null
  readonly port: number | null
}

export interface LogEntry {
  readonly id?: number
  readonly timestamp: string
  readonly requestType: SupportedRequestType
  readonly hostname: string
  readonly scheme: TargetScheme
  readonly correlationTabId: number | null
  readonly globalMode: GlobalMode
  readonly matchedRuleId: RuleId | null
  readonly matchedRuleName: string | null
  readonly plannedAction: 'DIRECT' | 'PROXY' | 'CONFIG_ERROR'
  readonly plannedProxyProfileId: ProxyProfileId | null
  readonly actualProxyInfo: ActualProxyInfo | null
  readonly httpStatus: number | null
  readonly totalDurationMs: number | null
  readonly errorCode: string | null
  readonly authFailure: boolean
  readonly platform: BrowserPlatform
}

export interface LogQuery {
  readonly limit: number
  readonly offset: number
  readonly hostname: string
  readonly platform: BrowserPlatform | null
  readonly errorsOnly: boolean
}
