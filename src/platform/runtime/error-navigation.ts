import { browser } from 'wxt/browser'

import type { ErrorCorrelationStore } from '../../application/errors/error-correlation-store'
import { isSupportedProxyFailure } from '../../application/errors/proxy-failure-classifier'
import { resolveRoute } from '../../domain/routing/resolver'
import type { RoutingSnapshot } from '../../domain/routing/snapshot'
import type { AppConfig, BrowserPlatform } from '../../domain/types/entities'

interface ErrorDetails {
  readonly documentLifecycle?: 'active' | 'cached' | 'pending_deletion' | 'prerender'
  readonly error: string
  readonly frameId?: number
  readonly frameType?: 'fenced_frame' | 'outermost_frame' | 'sub_frame'
  readonly parentFrameId?: number
  readonly requestId: string
  readonly tabId: number
  readonly type: string
  readonly url: string
  readonly incognito?: boolean
}

export interface ErrorNavigationOptions {
  readonly platform: BrowserPlatform
  readonly store: ErrorCorrelationStore
  readonly getConfig: () => AppConfig | null
  readonly getSnapshot: () => RoutingSnapshot | null
  readonly onProxyFailure?: (tabId: number) => void
  readonly isInternalUrl?: (url: string) => boolean
}

export const isActiveOutermostNavigation = (
  details: Pick<
    ErrorDetails,
    'documentLifecycle' | 'frameId' | 'frameType' | 'parentFrameId' | 'type'
  >,
): boolean =>
  details.type === 'main_frame' &&
  (details.documentLifecycle === undefined || details.documentLifecycle === 'active') &&
  (details.frameType === undefined || details.frameType === 'outermost_frame') &&
  (details.frameId === undefined || details.frameId === 0) &&
  (details.parentFrameId === undefined || details.parentFrameId === -1)

export const registerErrorNavigation = (options: ErrorNavigationOptions): (() => void) => {
  const navigatingTabs = new Set<number>()
  const onError = (details: ErrorDetails): void => {
    if (
      !isActiveOutermostNavigation(details) ||
      details.tabId < 0 ||
      navigatingTabs.has(details.tabId) ||
      options.isInternalUrl?.(details.url) === true ||
      !isSupportedProxyFailure(details.error)
    ) {
      return
    }
    const config = options.getConfig()
    const snapshot = options.getSnapshot()
    if (config === null || snapshot === null || !config.general.errorPageEnabled) {
      return
    }
    const decision = resolveRoute(snapshot, {
      incognito: details.incognito ?? false,
      now: new Date(),
      platform: options.platform,
      tabId: details.tabId,
      url: details.url,
    })
    if (decision.action !== 'PROXY') {
      return
    }
    const profile =
      decision.profileId === null
        ? null
        : (config.profiles.find((candidate) => candidate.id === decision.profileId) ?? null)
    const rule =
      decision.matchedRuleId === null
        ? null
        : (config.rules.find((candidate) => candidate.id === decision.matchedRuleId) ?? null)
    navigatingTabs.add(details.tabId)
    void (async () => {
      const context = await options.store.record({
        incognito: details.incognito ?? false,
        platform: options.platform,
        profileId: decision.profileId,
        profileName: profile?.name ?? null,
        requestId: details.requestId,
        ruleId: decision.matchedRuleId,
        ruleName: rule?.name ?? null,
        tabId: details.tabId,
        technicalCode: details.error,
        url: details.url,
      })
      if (!context.ok) {
        return
      }
      options.onProxyFailure?.(details.tabId)
      await browser.tabs.update(details.tabId, {
        url: browser.runtime.getURL(`/error.html?token=${encodeURIComponent(context.value.token)}`),
      })
    })()
      .catch(() => undefined)
      .finally(() => {
        setTimeout(() => navigatingTabs.delete(details.tabId), 1_000)
      })
  }

  browser.webRequest.onErrorOccurred.addListener(onError, {
    urls: ['<all_urls>'],
  })
  return () => {
    browser.webRequest.onErrorOccurred.removeListener(onError)
    navigatingTabs.clear()
  }
}
