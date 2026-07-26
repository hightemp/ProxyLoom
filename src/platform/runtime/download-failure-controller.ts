import { browser } from 'wxt/browser'

import { inspectDownloadFailure } from '../../application/downloads/download-failure'
import type { LoggingService } from '../../application/logging/logging-service'
import { resolveRoute } from '../../domain/routing/resolver'
import type { RoutingSnapshot } from '../../domain/routing/snapshot'
import type { AppConfig, BrowserPlatform } from '../../domain/types/entities'
import { t } from '../../i18n/messages'

interface DownloadFailureControllerOptions {
  readonly getConfig: () => AppConfig | null
  readonly getSnapshot: () => RoutingSnapshot | null
  readonly logging: LoggingService
  readonly platform: BrowserPlatform
}

const NOTIFICATION_PREFIX = 'download-failure-'

export class DownloadFailureController {
  readonly #seen = new Set<number>()

  constructor(private readonly options: DownloadFailureControllerOptions) {}

  register(): () => void {
    const onChanged = (delta: {
      id: number
      error?: { current?: string | undefined } | undefined
    }): void => {
      const errorCode = delta.error?.current
      if (errorCode === undefined || this.#seen.has(delta.id)) return
      this.#seen.add(delta.id)
      void this.handle(delta.id, errorCode)
    }
    const onErased = (downloadId: number): void => {
      this.#seen.delete(downloadId)
    }
    const onNotificationClicked = (notificationId: string): void => {
      if (!notificationId.startsWith(NOTIFICATION_PREFIX)) return
      void browser.notifications.clear(notificationId)
      void browser.tabs.create({
        url: browser.runtime.getURL('/options.html#logs'),
      })
    }

    browser.downloads.onChanged.addListener(onChanged)
    browser.downloads.onErased.addListener(onErased)
    browser.notifications.onClicked.addListener(onNotificationClicked)
    return () => {
      browser.downloads.onChanged.removeListener(onChanged)
      browser.downloads.onErased.removeListener(onErased)
      browser.notifications.onClicked.removeListener(onNotificationClicked)
      this.#seen.clear()
    }
  }

  private async handle(downloadId: number, errorCode: string): Promise<void> {
    const [item] = await browser.downloads.search({ id: downloadId })
    if (item === undefined) return
    const details = inspectDownloadFailure(item.finalUrl || item.url, errorCode)
    if (!details.ok) return

    const config = this.options.getConfig()
    const snapshot = this.options.getSnapshot()
    if (config !== null && snapshot !== null) {
      const decision = resolveRoute(snapshot, {
        incognito: item.incognito,
        now: new Date(),
        platform: this.options.platform,
        tabId: null,
        url: item.finalUrl || item.url,
      })
      await this.options.logging.record(config, {
        actualProxyInfo: null,
        authFailure: false,
        decision,
        errorCode: details.value.errorCode,
        httpStatus: null,
        incognito: item.incognito,
        internal: false,
        platform: this.options.platform,
        requestType: 'DOWNLOAD',
        tabId: null,
        timestamp: new Date(),
        totalDurationMs: null,
        url: item.finalUrl || item.url,
      })
    }

    await browser.notifications.create(`${NOTIFICATION_PREFIX}${String(downloadId)}`, {
      iconUrl: browser.runtime.getURL('/icon.svg'),
      message: `${t('downloadFailedFrom')} ${details.value.hostname} (${details.value.errorCode}). ${t('openLogsForDetails')}`,
      title: t('downloadFailed'),
      type: 'basic',
    })
  }
}
