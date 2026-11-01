import { browser } from 'wxt/browser'

import {
  parseIpGeoPayload,
  type IpGeoProviderError,
} from '../../application/proxy-check/ip-geo-provider'
import type {
  CheckSettings,
  ProxyCheckRequestPort,
  ProxyLookupResult,
} from '../../application/proxy-check/proxy-check-service'
import type { SpeedSample, SpeedTestRequest } from '../../application/proxy-check/speed'
import type { ProxyPlatformAdapter } from '../../application/ports/proxy-platform'
import { buildRoutingSnapshot, type RoutingSnapshot } from '../../domain/routing/snapshot'
import { asIsoTimestamp, asTemporaryOverrideId } from '../../domain/types/brand'
import type { AppConfig, ProxyProfile, TemporaryOverride } from '../../domain/types/entities'
import { err, type Result } from '../../domain/types/result'
import { normalizeUrl } from '../../domain/url/normalize'
import type { SessionRepository } from '../../storage/session/session-repository'
import { measureDownloadInPage } from './speed-probe'

interface TargetedProxyCheckOptions {
  readonly adapter: ProxyPlatformAdapter
  readonly sessionRepository: SessionRepository
  readonly readConfig: () => Promise<AppConfig>
  readonly readOverrides: () => Promise<readonly TemporaryOverride[]>
  readonly runExclusive: <T>(operation: () => Promise<T>) => Promise<T>
  readonly restore: () => Promise<boolean>
  readonly setActiveSnapshot: (snapshot: RoutingSnapshot | null) => void
}

type SpeedProbe =
  { readonly invalid: true } | { readonly invalid: false; readonly request: SpeedTestRequest }

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
    settings: CheckSettings,
    signal: AbortSignal,
    speed: SpeedTestRequest | null,
  ): Promise<Result<ProxyLookupResult, IpGeoProviderError>> {
    return this.options.runExclusive(async () => {
      const normalized = normalizeUrl(profile.checkUrl)
      if (!normalized.ok) {
        return err({ code: 'INVALID_ENDPOINT', httpStatus: null })
      }
      const origin = normalized.value.originTarget
      // The download origin is routed through the profile and kept out of user logs like the
      // check origin; an unparsable speed URL is reported without blocking the check.
      const speedTarget = speed === null ? null : normalizeUrl(speed.endpoint)
      const speedOrigin = speedTarget?.ok === true ? speedTarget.value : null
      const routedOrigins = [
        { hostname: normalized.value.hostname, origin },
        ...(speedOrigin === null || speedOrigin.originTarget === origin
          ? []
          : [{ hostname: speedOrigin.hostname, origin: speedOrigin.originTarget }]),
      ]
      for (const entry of routedOrigins) this.#activeOrigins.add(entry.origin)
      const config = await this.options.readConfig()
      const overrides = await this.options.readOverrides()
      const marker = await this.options.sessionRepository.getTransientState()
      await this.options.sessionRepository.setTransientState({
        ...marker,
        proxyCheckRecoveryRevision: config.revision,
      })
      try {
        const checkOverrides: TemporaryOverride[] = routedOrigins.map((entry) => ({
          action: {
            targetProxyProfileId: profile.id,
            type: 'PROXY',
          },
          createdAt: asIsoTimestamp(new Date().toISOString()),
          expiresOnTabClose: true,
          generatedPattern: `^${escapeRegex(entry.origin)}$`,
          id: asTemporaryOverrideId(`proxy-check-${crypto.randomUUID()}`),
          incognito: false,
          originKey: entry.origin,
          platformScope: 'ORIGIN',
          scope: 'EXACT_HOSTNAME',
          sourceHostname: entry.hostname,
          sourceTabId: 0,
        }))
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
          [...checkOverrides, ...overrides],
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
        const speedProbe: SpeedProbe | null =
          speed === null
            ? null
            : speedOrigin === null
              ? { invalid: true }
              : { invalid: false, request: speed }
        return await this.lookupInTab(
          profile.checkUrl,
          settings.proxyCheckTimeoutMs,
          settings.geoIpEnabled,
          signal,
          speedProbe,
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
        for (const entry of routedOrigins) this.#activeOrigins.delete(entry.origin)
      }
    })
  }

  private async lookupInTab(
    endpoint: string,
    timeoutMs: number,
    geoIpEnabled: boolean,
    signal: AbortSignal,
    speed: SpeedProbe | null,
  ): Promise<Result<ProxyLookupResult, IpGeoProviderError>> {
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
          tab: { readonly url?: string | undefined },
        ): void => {
          // The placeholder about:blank document can report `complete` after navigation has
          // started; reading the page then hits about:blank instead of the check response.
          if (
            updatedTabId === tabId &&
            changeInfo.status === 'complete' &&
            tab.url !== undefined &&
            tab.url !== 'about:blank'
          ) {
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
      const parsed = parseIpGeoPayload(injection.result, navigation.value.httpStatus, geoIpEnabled)
      if (!parsed.ok || speed === null) return parsed
      const phaseStarted = performance.now()
      const sample = speed.invalid
        ? ({ code: 'INVALID_ENDPOINT', ok: false } as const)
        : await this.probeSpeed(tabId, speed.request, signal)
      return {
        ok: true,
        value: { ...parsed.value, speed: sample, speedPhaseMs: performance.now() - phaseStarted },
      }
    } catch {
      return err({ code: 'NETWORK_ERROR', httpStatus: null })
    } finally {
      await browser.tabs.remove(tabId).catch(() => undefined)
    }
  }

  /** Downloads inside the check tab so the request uses the profile; cancel ends it early. */
  private async probeSpeed(
    tabId: number,
    request: SpeedTestRequest,
    signal: AbortSignal,
  ): Promise<SpeedSample> {
    const cancelled = new Promise<SpeedSample>((resolve) => {
      if (signal.aborted) resolve({ code: 'TIMEOUT', ok: false })
      signal.addEventListener('abort', () => resolve({ code: 'TIMEOUT', ok: false }), {
        once: true,
      })
    })
    const injected = browser.scripting
      .executeScript({
        args: [request.endpoint, request.maxBytes, request.maxMs],
        func: measureDownloadInPage,
        target: { tabId },
      })
      .then(([injection]) => injection?.result ?? null)
      .then((sample): SpeedSample => sample ?? { code: 'NETWORK_ERROR', ok: false })
      .catch((): SpeedSample => ({ code: 'NETWORK_ERROR', ok: false }))
    return Promise.race([injected, cancelled])
  }
}
