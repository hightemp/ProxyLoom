import type { RoutingDecision } from '../../domain/routing/resolver'
import type { AppConfig, BrowserPlatform } from '../../domain/types/entities'
import { normalizeUrl } from '../../domain/url/normalize'
import type { LogStorePort } from '../ports/log-store'
import type { ActualProxyInfo, LogEntry, SupportedRequestType } from './log-types'
import type { PrivateLogBuffer } from './private-buffer'

export interface RoutingLogEvent {
  readonly url: string
  readonly requestType: SupportedRequestType
  readonly tabId: number | null
  readonly incognito: boolean
  readonly internal: boolean
  readonly platform: BrowserPlatform
  readonly decision: RoutingDecision
  readonly actualProxyInfo: ActualProxyInfo | null
  readonly httpStatus: number | null
  readonly totalDurationMs: number | null
  readonly errorCode: string | null
  readonly authFailure: boolean
  readonly timestamp: Date
}

export class LoggingService {
  constructor(
    private readonly persistent: LogStorePort,
    private readonly privateBuffer: PrivateLogBuffer,
  ) {}

  async record(config: AppConfig, event: RoutingLogEvent): Promise<void> {
    if (!config.general.loggingEnabled || config.general.loggingPaused || event.internal) {
      return
    }
    const isFailure = event.errorCode !== null || event.authFailure
    if (
      config.general.loggingMode === 'NAVIGATIONS_AND_FAILURES' &&
      event.requestType !== 'MAIN_FRAME' &&
      !isFailure
    ) {
      return
    }
    const normalized = normalizeUrl(event.url)
    if (!normalized.ok) {
      return
    }
    const matchedRule =
      event.decision.matchedRuleId === null
        ? null
        : (config.rules.find((rule) => rule.id === event.decision.matchedRuleId) ?? null)
    const entry: LogEntry = {
      actualProxyInfo: event.actualProxyInfo,
      authFailure: event.authFailure,
      correlationTabId: event.tabId,
      errorCode: event.errorCode,
      globalMode: config.general.mode,
      hostname: normalized.value.hostname,
      httpStatus: event.httpStatus,
      matchedRuleId: event.decision.matchedRuleId,
      matchedRuleName: matchedRule?.name ?? null,
      plannedAction: event.decision.action,
      plannedProxyProfileId: event.decision.profileId,
      platform: event.platform,
      requestType: event.requestType,
      scheme: normalized.value.scheme,
      timestamp: event.timestamp.toISOString(),
      totalDurationMs: event.totalDurationMs,
    }
    if (event.incognito) {
      this.privateBuffer.append(entry)
      return
    }
    await this.persistent.appendBatch([entry])
  }

  clearPrivateSession(): void {
    this.privateBuffer.clear()
  }
}
