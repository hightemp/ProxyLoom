import { browser } from 'wxt/browser'

import type { LoggingService } from '../../application/logging/logging-service'
import type { ActualProxyInfo, SupportedRequestType } from '../../application/logging/log-types'
import { resolveRoute } from '../../domain/routing/resolver'
import type { RoutingSnapshot } from '../../domain/routing/snapshot'
import type { AppConfig, BrowserPlatform } from '../../domain/types/entities'
import { resolveTargetTab, type TargetTabsApi } from './target-tab'

interface RequestDetails {
  readonly requestId: string
  readonly url: string
  readonly tabId: number
  readonly incognito?: boolean
  readonly type: string
  readonly statusCode?: number
  readonly error?: string
  readonly proxyInfo?: {
    readonly type?: string
    readonly host?: string
    readonly port?: number
  }
}

interface PendingRequest {
  readonly config: AppConfig
  readonly context: Promise<{
    readonly decision: ReturnType<typeof resolveRoute>
    readonly incognito: boolean
  }>
  readonly requestType: SupportedRequestType
  readonly startedAt: number
  readonly tabId: number | null
  readonly url: string
}

interface LoggingTab {
  readonly id?: number | undefined
  readonly incognito: boolean
}

export interface LoggingEventBridgeOptions {
  readonly platform: BrowserPlatform
  readonly logging: LoggingService
  readonly getConfig: () => AppConfig | null
  readonly getSnapshot: () => RoutingSnapshot | null
  readonly isInternalUrl?: (url: string) => boolean
}

const requestType = (type: string): SupportedRequestType => {
  switch (type) {
    case 'main_frame':
      return 'MAIN_FRAME'
    case 'sub_frame':
      return 'SUB_FRAME'
    case 'xmlhttprequest':
      return 'XMLHTTPREQUEST'
    case 'websocket':
      return 'WEBSOCKET'
    default:
      return 'OTHER'
  }
}

const actualProxyInfo = (details: RequestDetails): ActualProxyInfo | null => {
  const info = details.proxyInfo
  if (info === undefined) {
    return null
  }
  const type = info.type?.toLowerCase()
  return {
    host: info.host ?? null,
    port: info.port ?? null,
    type:
      type === 'direct'
        ? 'DIRECT'
        : type === 'http'
          ? 'HTTP'
          : type === 'https'
            ? 'HTTPS'
            : type === 'socks' || type === 'socks4'
              ? 'SOCKS'
              : 'UNKNOWN',
  }
}

export const resolveRequestIncognito = async (
  details: Pick<RequestDetails, 'incognito' | 'tabId'>,
  tabs: TargetTabsApi<LoggingTab> = browser.tabs,
): Promise<boolean> => {
  if (details.incognito !== undefined) {
    return details.incognito
  }
  if (details.tabId < 0) {
    return false
  }
  try {
    return (await resolveTargetTab(tabs, details.tabId))?.incognito ?? false
  } catch {
    return false
  }
}

export const resolveRequestRoutingContext = async (
  snapshot: RoutingSnapshot,
  details: Pick<RequestDetails, 'incognito' | 'tabId' | 'url'>,
  platform: BrowserPlatform,
  tabs: TargetTabsApi<LoggingTab> = browser.tabs,
): Promise<{
  readonly decision: ReturnType<typeof resolveRoute>
  readonly incognito: boolean
}> => {
  const incognito = await resolveRequestIncognito(details, tabs)
  return {
    decision: resolveRoute(snapshot, {
      incognito,
      now: new Date(),
      platform,
      tabId: details.tabId >= 0 ? details.tabId : null,
      url: details.url,
    }),
    incognito,
  }
}

export const registerLoggingEventBridge = (options: LoggingEventBridgeOptions): (() => void) => {
  const pending = new Map<string, PendingRequest>()

  const onBeforeRequest = (details: RequestDetails): undefined => {
    const config = options.getConfig()
    const snapshot = options.getSnapshot()
    if (config === null || snapshot === null) {
      return undefined
    }
    if (pending.size >= 5_000) {
      const oldest = pending.keys().next().value
      if (oldest !== undefined) {
        pending.delete(oldest)
      }
    }
    pending.set(details.requestId, {
      config,
      context: resolveRequestRoutingContext(snapshot, details, options.platform),
      requestType: requestType(details.type),
      startedAt: Date.now(),
      tabId: details.tabId >= 0 ? details.tabId : null,
      url: details.url,
    })
    return undefined
  }

  const finish = (details: RequestDetails, failed: boolean): void => {
    const request = pending.get(details.requestId)
    if (request === undefined) {
      return
    }
    pending.delete(details.requestId)
    void request.context.then(({ decision, incognito }) =>
      options.logging.record(request.config, {
        actualProxyInfo: actualProxyInfo(details),
        authFailure: false,
        decision,
        errorCode: failed ? (details.error ?? 'REQUEST_FAILED') : null,
        httpStatus: details.statusCode ?? null,
        incognito,
        internal: options.isInternalUrl?.(request.url) ?? false,
        platform: options.platform,
        requestType: request.requestType,
        tabId: request.tabId,
        timestamp: new Date(),
        totalDurationMs: Math.max(0, Date.now() - request.startedAt),
        url: request.url,
      }),
    )
  }

  const onCompleted = (details: RequestDetails): void => finish(details, false)
  const onError = (details: RequestDetails): void => finish(details, true)

  browser.webRequest.onBeforeRequest.addListener(onBeforeRequest, {
    urls: ['<all_urls>'],
  })
  browser.webRequest.onCompleted.addListener(onCompleted, {
    urls: ['<all_urls>'],
  })
  browser.webRequest.onErrorOccurred.addListener(onError, {
    urls: ['<all_urls>'],
  })

  return () => {
    browser.webRequest.onBeforeRequest.removeListener(onBeforeRequest)
    browser.webRequest.onCompleted.removeListener(onCompleted)
    browser.webRequest.onErrorOccurred.removeListener(onError)
    pending.clear()
  }
}
