import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ErrorCorrelationStore } from '../../../src/application/errors/error-correlation-store'
import { buildRoutingSnapshot } from '../../../src/domain/routing/snapshot'
import {
  isActiveOutermostNavigation,
  registerErrorNavigation,
} from '../../../src/platform/runtime/error-navigation'
import { config, profile } from '../domain/fixtures'

const browserMocks = vi.hoisted(() => ({
  errorAdd: vi.fn(),
  errorRemove: vi.fn(),
  tabUpdate: vi.fn(),
}))

vi.mock('wxt/browser', () => ({
  browser: {
    runtime: {
      getURL: (path: string) => `chrome-extension://proxyloom${path}`,
    },
    tabs: {
      update: browserMocks.tabUpdate,
    },
    webRequest: {
      onErrorOccurred: {
        addListener: browserMocks.errorAdd,
        removeListener: browserMocks.errorRemove,
      },
    },
  },
}))

interface TestErrorDetails {
  readonly documentLifecycle?: 'active' | 'cached' | 'pending_deletion' | 'prerender'
  readonly error: string
  readonly frameId?: number
  readonly frameType?: 'fenced_frame' | 'outermost_frame' | 'sub_frame'
  readonly parentFrameId?: number
  readonly requestId: string
  readonly tabId: number
  readonly type: string
  readonly url: string
}

type TestErrorListener = (details: TestErrorDetails) => void

const registeredErrorListener = (): TestErrorListener => {
  const listener = browserMocks.errorAdd.mock.calls.at(-1)?.[0] as TestErrorListener | undefined
  if (listener === undefined) throw new Error('Error navigation listener was not registered.')
  return listener
}

const activeFailure = (overrides: Partial<TestErrorDetails> = {}): TestErrorDetails => ({
  documentLifecycle: 'active',
  error: 'net::ERR_TUNNEL_CONNECTION_FAILED',
  frameId: 0,
  frameType: 'outermost_frame',
  parentFrameId: -1,
  requestId: 'request-1',
  tabId: 7,
  type: 'main_frame',
  url: 'https://github.com/example/repository',
  ...overrides,
})

describe('error navigation lifecycle filter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    browserMocks.tabUpdate.mockResolvedValue(undefined)
  })

  it.each([
    ['prerender document', { documentLifecycle: 'prerender' }],
    ['cached document', { documentLifecycle: 'cached' }],
    ['pending-deletion document', { documentLifecycle: 'pending_deletion' }],
    ['subframe type', { frameType: 'sub_frame' }],
    ['non-root frame', { frameId: 3 }],
    ['nested parent', { parentFrameId: 0 }],
  ] as const)('rejects a %s even when Chromium labels the resource main_frame', (_name, fields) => {
    expect(isActiveOutermostNavigation(activeFailure(fields))).toBe(false)
  })

  it('accepts an active outermost navigation and legacy events without lifecycle metadata', () => {
    expect(isActiveOutermostNavigation(activeFailure())).toBe(true)
    expect(
      isActiveOutermostNavigation({
        type: 'main_frame',
      }),
    ).toBe(true)
  })

  it('does not replace the visible tab or persist Retry state for a prerender failure', async () => {
    const selectedProfile = profile('fornex')
    const current = config({
      general: {
        ...config().general,
        activeProxyProfileId: selectedProfile.id,
        mode: 'PROXY',
      },
      profiles: [selectedProfile],
    })
    const snapshot = buildRoutingSnapshot(current, [], new Date('2026-08-23T06:42:47.000Z'))
    expect(snapshot.ok).toBe(true)
    if (!snapshot.ok) return
    const record = vi.fn()
    const unregister = registerErrorNavigation({
      getConfig: () => current,
      getSnapshot: () => snapshot.value,
      platform: 'CHROMIUM',
      store: { record } as unknown as ErrorCorrelationStore,
    })

    registeredErrorListener()(activeFailure({ documentLifecycle: 'prerender' }))
    await Promise.resolve()

    expect(record).not.toHaveBeenCalled()
    expect(browserMocks.tabUpdate).not.toHaveBeenCalled()
    unregister()
  })

  it('retains best-effort recovery for an active outermost proxy failure', async () => {
    const selectedProfile = profile('fornex')
    const current = config({
      general: {
        ...config().general,
        activeProxyProfileId: selectedProfile.id,
        mode: 'PROXY',
      },
      profiles: [selectedProfile],
    })
    const snapshot = buildRoutingSnapshot(current, [], new Date('2026-08-23T06:42:47.000Z'))
    expect(snapshot.ok).toBe(true)
    if (!snapshot.ok) return
    const record = vi.fn().mockResolvedValue({
      ok: true,
      value: { token: 'active-navigation-token' },
    })
    const unregister = registerErrorNavigation({
      getConfig: () => current,
      getSnapshot: () => snapshot.value,
      platform: 'CHROMIUM',
      store: { record } as unknown as ErrorCorrelationStore,
    })

    registeredErrorListener()(activeFailure())

    await vi.waitFor(() => expect(record).toHaveBeenCalledOnce())
    expect(browserMocks.tabUpdate).toHaveBeenCalledWith(7, {
      url: 'chrome-extension://proxyloom/error.html?token=active-navigation-token',
    })
    unregister()
  })
})
