import { browser } from 'wxt/browser'

import {
  parseIpGeoPayload,
  type IpGeoProviderError,
  type IpGeoResult,
} from '../../application/proxy-check/ip-geo-provider'
import type { ProxyCheckRequestPort } from '../../application/proxy-check/proxy-check-service'
import type { ProxyPlatformAdapter } from '../../application/ports/proxy-platform'
import { buildRoutingSnapshot, type RoutingSnapshot } from '../../domain/routing/snapshot'
import { asIsoTimestamp, asTemporaryOverrideId } from '../../domain/types/brand'
import type {
  AppConfig,
  GeneralSettings,
  ProxyProfile,
  TemporaryOverride,
} from '../../domain/types/entities'
import { err, type Result } from '../../domain/types/result'
import { normalizeUrl } from '../../domain/url/normalize'
import type { SessionRepository } from '../../storage/session/session-repository'

interface TargetedProxyCheckOptions {
  readonly adapter: ProxyPlatformAdapter
  readonly sessionRepository: SessionRepository
  readonly readConfig: () => Promise<AppConfig>
  readonly readOverrides: () => Promise<readonly TemporaryOverride[]>
  readonly runExclusive: <T>(operation: () => Promise<T>) => Promise<T>
  readonly restore: () => Promise<boolean>
  readonly setActiveSnapshot: (snapshot: RoutingSnapshot | null) => void
}

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export class TargetedProxyCheckRequest implements ProxyCheckRequestPort {
  readonly #activeOrigins = new Set<string>()

  constructor(private readonly options: TargetedProxyCheckOptions) {}

  isInternalUrl(url: string): boolean {
    const normalized = normalizeUrl(url)
    return normalized.ok && this.#activeOrigins.has(normalized.value.originTarget)
  }

  lookup(
    profile: ProxyProfile,
    settings: Pick<
      GeneralSettings,
      'ipGeoProviderEndpoint' | 'proxyCheckTimeoutMs' | 'geoIpEnabled'
    >,
    signal: AbortSignal,
  ): Promise<Result<IpGeoResult, IpGeoProviderError>> {
    return this.options.runExclusive(async () => {
      const normalized = normalizeUrl(profile.checkUrl)
      if (!normalized.ok) {
        return err({ code: 'INVALID_ENDPOINT', httpStatus: null })
      }
      const origin = normalized.value.originTarget
      this.#activeOrigins.add(origin)
      const config = await this.options.readConfig()
      const overrides = await this.options.readOverrides()
      const marker = await this.options.sessionRepository.getTransientState()
      await this.options.sessionRepository.setTransientState({
        ...marker,
        proxyCheckRecoveryRevision: config.revision,
      })
      try {
        const checkOverride: TemporaryOverride = {
          action: {
            targetProxyProfileId: profile.id,
            type: 'PROXY',
          },
          createdAt: asIsoTimestamp(new Date().toISOString()),
          expiresOnTabClose: true,
          generatedPattern: `^${escapeRegex(origin)}$`,
          id: asTemporaryOverrideId(`proxy-check-${crypto.randomUUID()}`),
          incognito: false,
          originKey: origin,
          platformScope: 'ORIGIN',
          scope: 'EXACT_HOSTNAME',
          sourceTabId: 0,
        }
        const temporaryConfig: AppConfig =
          config.general.mode === 'DIRECT'
            ? {
                ...config,
                general: {
                  ...config.general,
                  activeProxyProfileId: null,
                  mode: 'RULES',
                },
                rules: [],
              }
            : config
        const snapshot = buildRoutingSnapshot(
          temporaryConfig,
          [checkOverride, ...overrides],
          new Date(),
        )
        if (!snapshot.ok) {
          return err({ code: 'NETWORK_ERROR', httpStatus: null })
        }
        const applied = await this.options.adapter.applySnapshot(snapshot.value)
        if (!applied.ok) {
          return err({ code: 'NETWORK_ERROR', httpStatus: null })
        }
        this.options.setActiveSnapshot(snapshot.value)
        return await this.lookupInTab(
          profile.checkUrl,
          settings.proxyCheckTimeoutMs,
          settings.geoIpEnabled,
          signal,
        )
      } finally {
        this.options.setActiveSnapshot(null)
        const restored = await this.options.restore()
        if (restored) {
          const current = await this.options.sessionRepository.getTransientState()
          await this.options.sessionRepository.setTransientState({
            ...current,
            proxyCheckRecoveryRevision: null,
          })
        }
        this.#activeOrigins.delete(origin)
      }
    })
  }

  private async lookupInTab(
    endpoint: string,
    timeoutMs: number,
    geoIpEnabled: boolean,
    signal: AbortSignal,
  ): Promise<Result<IpGeoResult, IpGeoProviderError>> {
    const tab = await browser.tabs.create({ active: false, url: 'about:blank' })
    if (tab.id === undefined) {
      return err({ code: 'NETWORK_ERROR', httpStatus: null })
    }
    const tabId = tab.id
    try {
      const navigation = await new Promise<
        Result<{ readonly httpStatus: number }, IpGeoProviderError>
      >((resolve) => {
        let httpStatus: number | null = null
        let documentComplete = false
        let settled = false
        const finish = (
          result: Result<{ readonly httpStatus: number }, IpGeoProviderError>,
        ): void => {
          if (settled) return
          settled = true
          clearTimeout(timeout)
          signal.removeEventListener('abort', onAbort)
          browser.webRequest.onCompleted.removeListener(onCompleted)
          browser.webRequest.onErrorOccurred.removeListener(onError)
          browser.tabs.onUpdated.removeListener(onUpdated)
          resolve(result)
        }
        const completeIfReady = (): void => {
          if (httpStatus === null || !documentComplete) return
          finish(
            httpStatus >= 200 && httpStatus < 400
              ? { ok: true, value: { httpStatus } }
              : { error: { code: 'HTTP_ERROR', httpStatus }, ok: false },
          )
        }
        const onCompleted = (details: {
          readonly tabId: number
          readonly type: string
          readonly statusCode: number
        }): void => {
          if (details.tabId === tabId && details.type === 'main_frame') {
            httpStatus = details.statusCode
            completeIfReady()
          }
        }
        const onError = (details: { readonly tabId: number; readonly type: string }): void => {
          if (details.tabId === tabId && details.type === 'main_frame') {
            finish({ error: { code: 'NETWORK_ERROR', httpStatus: null }, ok: false })
          }
        }
        const onUpdated = (
          updatedTabId: number,
          changeInfo: { readonly status?: string | undefined },
        ): void => {
          if (updatedTabId === tabId && changeInfo.status === 'complete') {
            documentComplete = true
            completeIfReady()
          }
        }
        const onAbort = (): void => {
          finish({ error: { code: 'TIMEOUT', httpStatus: null }, ok: false })
        }
        const timeout = setTimeout(onAbort, timeoutMs)
        browser.webRequest.onCompleted.addListener(onCompleted, { urls: ['<all_urls>'] })
        browser.webRequest.onErrorOccurred.addListener(onError, { urls: ['<all_urls>'] })
        browser.tabs.onUpdated.addListener(onUpdated)
        signal.addEventListener('abort', onAbort, { once: true })
        void browser.tabs.update(tabId, { url: endpoint }).catch(() => {
          finish({ error: { code: 'NETWORK_ERROR', httpStatus: null }, ok: false })
        })
      })
      if (!navigation.ok) return navigation

      const [injection] = await browser.scripting.executeScript({
        func: () => document.body?.textContent ?? '',
        target: { tabId },
      })
      if (typeof injection?.result !== 'string') {
        return err({ code: 'MALFORMED_RESPONSE', httpStatus: navigation.value.httpStatus })
      }
      return parseIpGeoPayload(injection.result, navigation.value.httpStatus, geoIpEnabled)
    } catch {
      return err({ code: 'NETWORK_ERROR', httpStatus: null })
    } finally {
      await browser.tabs.remove(tabId).catch(() => undefined)
    }
  }
}
