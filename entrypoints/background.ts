import { browser } from 'wxt/browser'

import { ConfigApplicationService } from '../src/application/config/config-application-service'
import { CoalescingTaskRunner } from '../src/application/config/coalescing-task-runner'
import { ErrorCorrelationStore } from '../src/application/errors/error-correlation-store'
import { LoggingService } from '../src/application/logging/logging-service'
import { PrivateLogBuffer } from '../src/application/logging/private-buffer'
import { BatchedLogStore } from '../src/application/logging/batched-log-store'
import type { ProxyPlatformAdapter } from '../src/application/ports/proxy-platform'
import { SessionLifecycleService } from '../src/application/session-lifecycle/session-lifecycle-service'
import { buildRoutingSnapshot, type RoutingSnapshot } from '../src/domain/routing/snapshot'
import type { AppConfig } from '../src/domain/types/entities'
import { ChromiumProxyAdapter } from '../src/platform/chromium/adapter'
import { FirefoxProxyAdapter } from '../src/platform/firefox/adapter'
import { registerProxyAuthListeners } from '../src/platform/runtime/auth-listener'
import { BadgeController } from '../src/platform/runtime/badge-controller'
import { BrowserStorageAreaAdapter } from '../src/platform/runtime/browser-storage-area'
import { DownloadFailureController } from '../src/platform/runtime/download-failure-controller'
import { registerErrorNavigation } from '../src/platform/runtime/error-navigation'
import { registerLoggingEventBridge } from '../src/platform/runtime/logging-event-bridge'
import { PrivateSessionController } from '../src/platform/runtime/private-session-controller'
import { RuntimeController } from '../src/platform/runtime/runtime-controller'
import { TargetedProxyCheckRequest } from '../src/platform/runtime/targeted-proxy-check'
import { CONFIG_KEY, ConfigRepository } from '../src/storage/config/config-repository'
import { FallbackStorageArea } from '../src/storage/config/storage-area'
import { IndexedDbLogRepository } from '../src/storage/logs/indexeddb-log-repository'
import { SessionRepository } from '../src/storage/session/session-repository'

export default defineBackground(() => {
  const adapter: ProxyPlatformAdapter = import.meta.env.FIREFOX
    ? new FirefoxProxyAdapter()
    : new ChromiumProxyAdapter()
  const localStorage = new BrowserStorageAreaAdapter(browser.storage.local)
  const sessionStorage = new FallbackStorageArea(
    new BrowserStorageAreaAdapter(browser.storage.session),
  )
  const configRepository = new ConfigRepository(localStorage, () => new Date())
  const sessionRepository = new SessionRepository(sessionStorage)
  const applicationService = new ConfigApplicationService(adapter)
  const privateLogBuffer = new PrivateLogBuffer()
  const logRepository = new IndexedDbLogRepository()
  const batchedLogRepository = new BatchedLogStore(logRepository)
  const loggingService = new LoggingService(batchedLogRepository, privateLogBuffer)
  const errorStore = new ErrorCorrelationStore({ now: () => new Date() }, () => crypto.randomUUID())
  const sessionLifecycle = new SessionLifecycleService(
    sessionRepository,
    {
      liveTabIds: async () =>
        new Set(
          (await browser.tabs.query({}))
            .map((tab) => tab.id)
            .filter((tabId): tabId is number => tabId !== undefined),
        ),
    },
    { now: () => new Date() },
  )

  let currentSnapshot: RoutingSnapshot | null = null
  let currentConfig: AppConfig | null = null
  let appliedRevision: number | null = null
  let appliedSnapshotHash: string | null = null
  let lastApplyError: string | null = null
  let applyQueue = Promise.resolve()
  const badgeController = new BadgeController({
    adapter,
    getConfig: () => currentConfig,
    getSnapshot: () => currentSnapshot,
  })
  badgeController.register()

  const applyCurrentConfiguration = async (): Promise<void> => {
    const config = await configRepository.initialize()
    if (!config.ok) {
      lastApplyError = config.error.code
      return
    }
    const overrides = await sessionRepository.getOverrides()
    const now = new Date()
    const result = await applicationService.apply(config.value, overrides, now)
    if (!result.ok) {
      lastApplyError = `${result.error.code}: ${result.error.message}`
      return
    }
    const snapshot = buildRoutingSnapshot(config.value, overrides, now)
    if (snapshot.ok) {
      currentSnapshot = snapshot.value
      currentConfig = config.value
      appliedRevision = result.value.appliedRevision
      appliedSnapshotHash = result.value.snapshotHash
      lastApplyError = null
      badgeController.configurationChanged()
      const transient = await sessionRepository.getTransientState()
      if (transient.proxyCheckRecoveryRevision !== null) {
        await sessionRepository.setTransientState({
          ...transient,
          proxyCheckRecoveryRevision: null,
        })
      }
    }
  }

  const runExclusive = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = applyQueue.then(operation, operation)
    applyQueue = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  const applyRunner = new CoalescingTaskRunner(() => runExclusive(applyCurrentConfiguration))
  const scheduleApply = (): Promise<void> => applyRunner.request()

  const targetedProxyCheck = new TargetedProxyCheckRequest({
    adapter,
    readConfig: async () => {
      const config = await configRepository.initialize()
      if (!config.ok) throw new Error(config.error.code)
      return config.value
    },
    readOverrides: () => sessionRepository.getOverrides(),
    restore: async () => {
      await applyCurrentConfiguration()
      return lastApplyError === null
    },
    runExclusive,
    sessionRepository,
    setActiveSnapshot: (snapshot) => {
      currentSnapshot = snapshot
    },
  })

  new RuntimeController({
    adapter,
    applyConfiguration: scheduleApply,
    configRepository,
    diagnostics: () => ({
      appliedRevision,
      appliedSnapshotHash,
      lastApplyError,
    }),
    errorStore,
    logs: batchedLogRepository,
    privateLogs: privateLogBuffer,
    proxyCheckRequest: targetedProxyCheck,
    sessionRepository,
  }).register()

  registerProxyAuthListeners({
    getSnapshot: () => currentSnapshot,
    onFailure: () => {
      // Error correlation is stored by the diagnostics service without credentials.
    },
    platform: adapter.capabilities.platform,
  })
  registerErrorNavigation({
    getConfig: () => currentConfig,
    getSnapshot: () => currentSnapshot,
    isInternalUrl: (url) => targetedProxyCheck.isInternalUrl(url),
    onProxyFailure: (tabId) => badgeController.markProxyError(tabId),
    platform: adapter.capabilities.platform,
    store: errorStore,
  })
  registerLoggingEventBridge({
    getConfig: () => currentConfig,
    getSnapshot: () => currentSnapshot,
    isInternalUrl: (url) => targetedProxyCheck.isInternalUrl(url),
    logging: loggingService,
    platform: adapter.capabilities.platform,
  })
  new DownloadFailureController({
    getConfig: () => currentConfig,
    getSnapshot: () => currentSnapshot,
    logging: loggingService,
    platform: adapter.capabilities.platform,
  }).register()

  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && CONFIG_KEY in changes) {
      void scheduleApply()
    }
    if (areaName === 'session') {
      void scheduleApply()
    }
  })

  browser.tabs.onRemoved.addListener((tabId) => {
    errorStore.clearTab(tabId)
    void sessionLifecycle.tabClosed(tabId).then(scheduleApply)
  })
  browser.tabs.onCreated.addListener((tab) => {
    if (tab.id !== undefined) {
      void sessionLifecycle.tabCreated(tab.id).then((changed) => {
        if (changed) void scheduleApply()
      })
    }
  })
  new PrivateSessionController({
    onPrivateSessionEnded: async () => {
      loggingService.clearPrivateSession()
      if (await sessionLifecycle.privateSessionEnded()) {
        await scheduleApply()
      }
    },
    windows: browser.windows,
  }).register()
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'proxyloom-session-reconcile') {
      void sessionLifecycle.alarm().then(scheduleApply)
    }
  })
  browser.runtime.onStartup.addListener(() => {
    void sessionLifecycle.startup(true).then(scheduleApply)
  })
  void browser.alarms.create('proxyloom-session-reconcile', { periodInMinutes: 1 })
  void sessionLifecycle.startup(false).then(scheduleApply)
  void scheduleApply()
})
