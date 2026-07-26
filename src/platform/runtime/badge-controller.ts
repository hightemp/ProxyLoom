import { browser } from 'wxt/browser'

import { buildBadgePresentation } from '../../application/inspection/badge-presentation'
import { inspectTab } from '../../application/inspection/current-tab-inspection'
import type { ProxyPlatformAdapter } from '../../application/ports/proxy-platform'
import type { RoutingSnapshot } from '../../domain/routing/snapshot'
import type { AppConfig } from '../../domain/types/entities'
import { t } from '../../i18n/messages'

interface BadgeControllerOptions {
  readonly adapter: ProxyPlatformAdapter
  readonly getConfig: () => AppConfig | null
  readonly getSnapshot: () => RoutingSnapshot | null
}

const badgeTitle = (badge: ReturnType<typeof buildBadgePresentation>): string => {
  switch (badge.titleCode) {
    case 'PROXY_CONNECTION_FAILED':
      return t('badgeProxyConnectionFailed')
    case 'DIRECT':
      return t('badgeDirect')
    case 'CONFIGURATION_ERROR':
      return t('badgeConfigurationError', badge.titleDetail ?? t('unknownError'))
    case 'GLOBAL_PROXY_MISSING':
      return t('badgeGlobalProxyMissing')
    case 'GLOBAL_PROXY':
      return t('badgeGlobalProxy', badge.titleDetail ?? t('missingProfile'))
    case 'RULES_DIRECT':
      return t('badgeRulesDirect')
    case 'RULES_PROXY':
      return t('badgeRulesProxy', badge.titleDetail ?? t('missingProfile'))
  }
}

export class BadgeController {
  readonly #errorTabs = new Set<number>()

  constructor(private readonly options: BadgeControllerOptions) {}

  register(): () => void {
    const onActivated = ({ tabId }: { tabId: number }): void => {
      void this.refresh(tabId)
    }
    const onUpdated = (tabId: number, changeInfo: { status?: string; url?: string }): void => {
      if (changeInfo.status === 'loading' || changeInfo.url !== undefined) {
        this.#errorTabs.delete(tabId)
      }
      void this.refresh(tabId)
    }
    const onRemoved = (tabId: number): void => {
      this.#errorTabs.delete(tabId)
    }
    const onFocusChanged = (): void => {
      void this.refreshActive()
    }

    browser.tabs.onActivated.addListener(onActivated)
    browser.tabs.onUpdated.addListener(onUpdated)
    browser.tabs.onRemoved.addListener(onRemoved)
    browser.windows.onFocusChanged.addListener(onFocusChanged)
    void this.refreshActive()

    return () => {
      browser.tabs.onActivated.removeListener(onActivated)
      browser.tabs.onUpdated.removeListener(onUpdated)
      browser.tabs.onRemoved.removeListener(onRemoved)
      browser.windows.onFocusChanged.removeListener(onFocusChanged)
      this.#errorTabs.clear()
    }
  }

  markProxyError(tabId: number): void {
    this.#errorTabs.add(tabId)
    void this.refresh(tabId)
  }

  configurationChanged(): void {
    this.#errorTabs.clear()
    void this.refreshActive()
  }

  async refreshActive(): Promise<void> {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
    if (tab?.id !== undefined) {
      await this.refresh(tab.id)
    }
  }

  async refresh(tabId: number): Promise<void> {
    const config = this.options.getConfig()
    const snapshot = this.options.getSnapshot()
    if (config === null || snapshot === null) return

    let tab: { readonly id?: number; readonly incognito: boolean; readonly url?: string }
    try {
      tab = (await browser.tabs.get(tabId)) as {
        readonly id?: number
        readonly incognito: boolean
        readonly url?: string
      }
    } catch {
      return
    }
    const controlStatus = await this.options.adapter.getControlStatus()
    const inspection = inspectTab(
      snapshot,
      {
        id: tab.id ?? null,
        incognito: tab.incognito,
        url: tab.url ?? null,
      },
      controlStatus,
      this.options.adapter.capabilities.platform,
      new Date(),
    )
    const badge = buildBadgePresentation(config, inspection, this.#errorTabs.has(tabId))
    await Promise.all([
      browser.action.setBadgeText({ tabId, text: badge.text }),
      browser.action.setBadgeBackgroundColor({ color: badge.backgroundColor, tabId }),
      browser.action.setTitle({ tabId, title: badgeTitle(badge) }),
    ])
  }
}
