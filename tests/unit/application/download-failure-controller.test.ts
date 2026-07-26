import { beforeEach, describe, expect, it, vi } from 'vitest'

import { LoggingService } from '../../../src/application/logging/logging-service'
import { PrivateLogBuffer } from '../../../src/application/logging/private-buffer'
import type { LogEntry } from '../../../src/application/logging/log-types'
import type { LogStorePort } from '../../../src/application/ports/log-store'
import { buildRoutingSnapshot } from '../../../src/domain/routing/snapshot'
import { DownloadFailureController } from '../../../src/platform/runtime/download-failure-controller'
import { config } from '../domain/fixtures'

const mocks = vi.hoisted(() => ({
  downloadChangedAdd: vi.fn(),
  downloadChangedRemove: vi.fn(),
  downloadErasedAdd: vi.fn(),
  downloadErasedRemove: vi.fn(),
  downloadSearch: vi.fn(),
  notificationClickedAdd: vi.fn(),
  notificationClickedRemove: vi.fn(),
  notificationClear: vi.fn(),
  notificationCreate: vi.fn(),
  tabCreate: vi.fn(),
}))

vi.mock('wxt/browser', () => ({
  browser: {
    downloads: {
      onChanged: {
        addListener: mocks.downloadChangedAdd,
        removeListener: mocks.downloadChangedRemove,
      },
      onErased: {
        addListener: mocks.downloadErasedAdd,
        removeListener: mocks.downloadErasedRemove,
      },
      search: mocks.downloadSearch,
    },
    i18n: {
      getMessage: (key: string) => key,
    },
    notifications: {
      clear: mocks.notificationClear,
      create: mocks.notificationCreate,
      onClicked: {
        addListener: mocks.notificationClickedAdd,
        removeListener: mocks.notificationClickedRemove,
      },
    },
    runtime: {
      getURL: (path: string) => `chrome-extension://proxyloom${path}`,
    },
    tabs: {
      create: mocks.tabCreate,
    },
  },
}))

class MemoryLogStore implements LogStorePort {
  readonly entries: LogEntry[] = []

  appendBatch(entries: readonly LogEntry[]): Promise<void> {
    this.entries.push(...entries)
    return Promise.resolve()
  }

  page(): Promise<readonly LogEntry[]> {
    return Promise.resolve(this.entries)
  }

  count(): Promise<number> {
    return Promise.resolve(this.entries.length)
  }

  clear(): Promise<void> {
    this.entries.splice(0)
    return Promise.resolve()
  }
}

describe('DownloadFailureController', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('logs and notifies a redacted failure, then opens Logs only after the notification click', async () => {
    const current = config()
    const snapshot = buildRoutingSnapshot(current, [], new Date())
    expect(snapshot.ok).toBe(true)
    if (!snapshot.ok) return
    const store = new MemoryLogStore()
    const controller = new DownloadFailureController({
      getConfig: () => current,
      getSnapshot: () => snapshot.value,
      logging: new LoggingService(store, new PrivateLogBuffer()),
      platform: 'CHROMIUM',
    })
    const unregister = controller.register()
    mocks.downloadSearch.mockResolvedValue([
      {
        finalUrl: 'https://user:password@example.com/private/file?token=secret',
        incognito: false,
        url: 'https://example.com/fallback',
      },
    ])

    const onChanged = mocks.downloadChangedAdd.mock.calls[0]?.[0] as
      ((delta: { id: number; error?: { current?: string } }) => void) | undefined
    expect(onChanged).toBeTypeOf('function')
    onChanged?.({ error: { current: 'NETWORK_FAILED' }, id: 42 })

    await vi.waitFor(() => expect(mocks.notificationCreate).toHaveBeenCalledOnce())
    expect(store.entries).toEqual([
      expect.objectContaining({
        errorCode: 'NETWORK_FAILED',
        hostname: 'example.com',
        requestType: 'DOWNLOAD',
        scheme: 'https',
      }),
    ])
    expect(JSON.stringify(store.entries)).not.toContain('private/file')
    expect(JSON.stringify(store.entries)).not.toContain('secret')
    expect(JSON.stringify(mocks.notificationCreate.mock.calls)).not.toContain('private/file')
    expect(mocks.tabCreate).not.toHaveBeenCalled()

    const onClicked = mocks.notificationClickedAdd.mock.calls[0]?.[0] as
      ((notificationId: string) => void) | undefined
    onClicked?.('download-failure-42')
    expect(mocks.notificationClear).toHaveBeenCalledWith('download-failure-42')
    expect(mocks.tabCreate).toHaveBeenCalledWith({
      url: 'chrome-extension://proxyloom/options.html#logs',
    })
    unregister()
    expect(mocks.downloadChangedRemove).toHaveBeenCalledWith(onChanged)
  })

  it('suppresses user cancellation and de-duplicates repeated failure deltas', async () => {
    const controller = new DownloadFailureController({
      getConfig: () => null,
      getSnapshot: () => null,
      logging: new LoggingService(new MemoryLogStore(), new PrivateLogBuffer()),
      platform: 'CHROMIUM',
    })
    controller.register()
    mocks.downloadSearch.mockResolvedValue([
      {
        incognito: false,
        url: 'https://example.com/download',
      },
    ])
    const onChanged = mocks.downloadChangedAdd.mock.calls[0]?.[0] as
      ((delta: { id: number; error?: { current?: string } }) => void) | undefined
    onChanged?.({ error: { current: 'USER_CANCELED' }, id: 7 })
    onChanged?.({ error: { current: 'NETWORK_FAILED' }, id: 7 })

    await vi.waitFor(() => expect(mocks.downloadSearch).toHaveBeenCalledOnce())
    expect(mocks.notificationCreate).not.toHaveBeenCalled()
  })
})
