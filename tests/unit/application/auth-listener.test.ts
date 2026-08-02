import { beforeEach, describe, expect, it, vi } from 'vitest'

import { buildRoutingSnapshot, type RoutingSnapshot } from '../../../src/domain/routing/snapshot'
import { registerProxyAuthListeners } from '../../../src/platform/runtime/auth-listener'
import { config, endpoint, profile } from '../domain/fixtures'

const browserMocks = vi.hoisted(() => ({
  authAdd: vi.fn(),
  authRemove: vi.fn(),
  completedAdd: vi.fn(),
  completedRemove: vi.fn(),
  errorAdd: vi.fn(),
  errorRemove: vi.fn(),
  tabsGet: vi.fn(),
  tabsQuery: vi.fn(),
}))

vi.mock('wxt/browser', () => ({
  browser: {
    tabs: {
      get: browserMocks.tabsGet,
      query: browserMocks.tabsQuery,
    },
    webRequest: {
      onAuthRequired: {
        addListener: browserMocks.authAdd,
        removeListener: browserMocks.authRemove,
      },
      onCompleted: {
        addListener: browserMocks.completedAdd,
        removeListener: browserMocks.completedRemove,
      },
      onErrorOccurred: {
        addListener: browserMocks.errorAdd,
        removeListener: browserMocks.errorRemove,
      },
    },
  },
}))

interface TestAuthDetails {
  readonly challenger?: { readonly host: string; readonly port: number } | undefined
  readonly incognito?: boolean
  readonly isProxy?: boolean
  readonly requestId: string
  readonly tabId: number
  readonly url: string
}

interface TestAuthResponse {
  readonly cancel?: boolean
  readonly authCredentials?: { readonly username: string; readonly password: string }
}

type TestAuthCallback = (response: TestAuthResponse) => void
type TestAuthListener = (
  details: TestAuthDetails,
  callback?: TestAuthCallback,
) => TestAuthResponse | undefined
type TestCleanupListener = (details: { requestId: string }) => void

const authenticatedSnapshot = (): RoutingSnapshot => {
  const authenticatedProfile = profile('auth', {
    httpEndpoint: {
      ...endpoint('proxy.local', 8080),
      password: 'canary-password',
      username: 'alice',
    },
  })
  const result = buildRoutingSnapshot(
    config({
      general: {
        ...config().general,
        activeProxyProfileId: authenticatedProfile.id,
        mode: 'PROXY',
      },
      profiles: [authenticatedProfile],
    }),
    [],
    new Date('2026-01-01T12:00:00.000Z'),
  )
  if (!result.ok) throw new Error(result.error.code)
  return result.value
}

const proxyChallenge = (requestId = 'request-1'): TestAuthDetails => ({
  challenger: { host: 'proxy.local', port: 8080 },
  incognito: false,
  isProxy: true,
  requestId,
  tabId: 1,
  url: 'http://example.com/',
})

const proxyChallengeWithoutIncognito = (tabId: number): TestAuthDetails => ({
  challenger: { host: 'proxy.local', port: 8080 },
  isProxy: true,
  requestId: `request-${String(tabId)}`,
  tabId,
  url: 'http://example.com/',
})

const registeredAuthListener = (): TestAuthListener => {
  const listener = browserMocks.authAdd.mock.calls.at(-1)?.[0] as TestAuthListener | undefined
  if (listener === undefined) throw new Error('Proxy auth listener was not registered.')
  return listener
}

const registeredCompletedListener = (): TestCleanupListener => {
  const listener = browserMocks.completedAdd.mock.calls.at(-1)?.[0] as
    TestCleanupListener | undefined
  if (listener === undefined) throw new Error('Proxy auth cleanup listener was not registered.')
  return listener
}

describe('proxy auth runtime listener', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    browserMocks.tabsGet.mockReset()
    browserMocks.tabsQuery.mockReset()
    vi.useRealTimers()
  })

  it('answers a warm Chromium challenge only after confirming proxy control', async () => {
    const snapshot = authenticatedSnapshot()
    const waitForSnapshot = vi.fn<() => Promise<RoutingSnapshot | null>>()
    const isSnapshotActive = vi.fn<() => Promise<boolean>>().mockResolvedValue(true)
    const unregister = registerProxyAuthListeners({
      getSnapshot: () => snapshot,
      isSnapshotActive,
      onFailure: vi.fn(),
      platform: 'CHROMIUM',
      waitForSnapshot,
    })
    const callback = vi.fn<TestAuthCallback>()

    registeredAuthListener()(proxyChallenge(), callback)

    await vi.waitFor(() => expect(callback).toHaveBeenCalledOnce())
    expect(callback).toHaveBeenCalledWith({
      authCredentials: { password: 'canary-password', username: 'alice' },
    })
    expect(isSnapshotActive).toHaveBeenCalledOnce()
    expect(waitForSnapshot).not.toHaveBeenCalled()
    unregister()
  })

  it('does not answer an incognito challenge after ProxyLoom loses proxy control', async () => {
    const snapshot = authenticatedSnapshot()
    const waitForSnapshot = vi.fn<() => Promise<RoutingSnapshot | null>>()
    const isSnapshotActive = vi
      .fn<(incognito: boolean) => Promise<boolean>>()
      .mockResolvedValue(false)
    const unregister = registerProxyAuthListeners({
      getSnapshot: () => snapshot,
      isSnapshotActive,
      onFailure: vi.fn(),
      platform: 'CHROMIUM',
      waitForSnapshot,
    })
    const callback = vi.fn<TestAuthCallback>()

    registeredAuthListener()({ ...proxyChallenge(), incognito: true }, callback)

    await vi.waitFor(() => expect(callback).toHaveBeenCalledOnce())
    expect(callback).toHaveBeenCalledWith({})
    expect(isSnapshotActive).toHaveBeenCalledWith(true)
    expect(waitForSnapshot).not.toHaveBeenCalled()
    unregister()
  })

  it('derives Chromium incognito context from the request tab before checking control', async () => {
    const snapshot = authenticatedSnapshot()
    const waitForSnapshot = vi.fn<() => Promise<RoutingSnapshot | null>>()
    const isSnapshotActive = vi
      .fn<(incognito: boolean) => Promise<boolean>>()
      .mockResolvedValue(true)
    browserMocks.tabsGet.mockResolvedValue({ id: 9, incognito: true })
    const unregister = registerProxyAuthListeners({
      getSnapshot: () => snapshot,
      isSnapshotActive,
      onFailure: vi.fn(),
      platform: 'CHROMIUM',
      waitForSnapshot,
    })
    const callback = vi.fn<TestAuthCallback>()

    registeredAuthListener()(proxyChallengeWithoutIncognito(9), callback)

    await vi.waitFor(() => expect(callback).toHaveBeenCalledOnce())
    expect(browserMocks.tabsGet).toHaveBeenCalledWith(9)
    expect(isSnapshotActive).toHaveBeenCalledWith(true)
    expect(callback).toHaveBeenCalledWith({
      authCredentials: { password: 'canary-password', username: 'alice' },
    })
    expect(waitForSnapshot).not.toHaveBeenCalled()
    unregister()
  })

  it('fails closed when Chromium omits incognito and the request tab cannot be resolved', async () => {
    const snapshot = authenticatedSnapshot()
    const waitForSnapshot = vi.fn<() => Promise<RoutingSnapshot | null>>()
    const isSnapshotActive = vi.fn<(incognito: boolean) => Promise<boolean>>()
    browserMocks.tabsGet.mockRejectedValue(new Error('No tab with id: 10.'))
    browserMocks.tabsQuery.mockResolvedValue([])
    const unregister = registerProxyAuthListeners({
      getSnapshot: () => snapshot,
      isSnapshotActive,
      onFailure: vi.fn(),
      platform: 'CHROMIUM',
      waitForSnapshot,
    })
    const callback = vi.fn<TestAuthCallback>()

    registeredAuthListener()(proxyChallengeWithoutIncognito(10), callback)

    await vi.waitFor(() => expect(callback).toHaveBeenCalledOnce())
    expect(callback).toHaveBeenCalledWith({})
    expect(browserMocks.tabsQuery).toHaveBeenCalledWith({})
    expect(isSnapshotActive).not.toHaveBeenCalled()
    expect(waitForSnapshot).not.toHaveBeenCalled()
    unregister()
  })

  it('waits for the applied snapshot before answering a cold Chromium challenge', async () => {
    const snapshot = authenticatedSnapshot()
    let currentSnapshot: RoutingSnapshot | null = null
    let resolveSnapshot!: (snapshot: RoutingSnapshot | null) => void
    const readySnapshot = new Promise<RoutingSnapshot | null>((resolve) => {
      resolveSnapshot = resolve
    })
    const unregister = registerProxyAuthListeners({
      getSnapshot: () => currentSnapshot,
      isSnapshotActive: () => Promise.resolve(true),
      onFailure: vi.fn(),
      platform: 'CHROMIUM',
      waitForSnapshot: () => readySnapshot,
    })
    const callback = vi.fn<TestAuthCallback>()

    registeredAuthListener()(proxyChallenge(), callback)
    expect(callback).not.toHaveBeenCalled()
    currentSnapshot = snapshot
    resolveSnapshot(snapshot)

    await vi.waitFor(() => expect(callback).toHaveBeenCalledOnce())
    expect(callback).toHaveBeenCalledWith({
      authCredentials: { password: 'canary-password', username: 'alice' },
    })
    unregister()
  })

  it('answers once without credentials when readiness times out, even after a late snapshot', async () => {
    vi.useFakeTimers()
    const snapshot = authenticatedSnapshot()
    let resolveSnapshot!: (snapshot: RoutingSnapshot | null) => void
    const readySnapshot = new Promise<RoutingSnapshot | null>((resolve) => {
      resolveSnapshot = resolve
    })
    const unregister = registerProxyAuthListeners({
      getSnapshot: () => null,
      isSnapshotActive: () => Promise.resolve(true),
      onFailure: vi.fn(),
      platform: 'CHROMIUM',
      snapshotWaitTimeoutMs: 25,
      waitForSnapshot: () => readySnapshot,
    })
    const callback = vi.fn<TestAuthCallback>()

    registeredAuthListener()(proxyChallenge(), callback)
    await vi.advanceTimersByTimeAsync(25)
    expect(callback).toHaveBeenCalledOnce()
    expect(callback).toHaveBeenCalledWith({})

    resolveSnapshot(snapshot)
    await Promise.resolve()
    expect(callback).toHaveBeenCalledOnce()
    unregister()
  })

  it('answers once without credentials when readiness rejects', async () => {
    const unregister = registerProxyAuthListeners({
      getSnapshot: () => null,
      isSnapshotActive: () => Promise.resolve(true),
      onFailure: vi.fn(),
      platform: 'CHROMIUM',
      waitForSnapshot: () => Promise.reject(new Error('apply failed')),
    })
    const callback = vi.fn<TestAuthCallback>()

    registeredAuthListener()(proxyChallenge(), callback)

    await vi.waitFor(() => expect(callback).toHaveBeenCalledOnce())
    expect(callback).toHaveBeenCalledWith({})
    unregister()
  })

  it('answers once without credentials when no applied snapshot becomes available', async () => {
    const unregister = registerProxyAuthListeners({
      getSnapshot: () => null,
      isSnapshotActive: () => Promise.resolve(true),
      onFailure: vi.fn(),
      platform: 'CHROMIUM',
      waitForSnapshot: () => Promise.resolve(null),
    })
    const callback = vi.fn<TestAuthCallback>()

    registeredAuthListener()(proxyChallenge(), callback)

    await vi.waitFor(() => expect(callback).toHaveBeenCalledOnce())
    expect(callback).toHaveBeenCalledWith({})
    unregister()
  })

  it('does not wait for site authentication or a challenge without a challenger', () => {
    const waitForSnapshot = vi.fn<() => Promise<RoutingSnapshot | null>>()
    const isSnapshotActive = vi.fn<() => Promise<boolean>>()
    const unregister = registerProxyAuthListeners({
      getSnapshot: () => null,
      isSnapshotActive,
      onFailure: vi.fn(),
      platform: 'CHROMIUM',
      waitForSnapshot,
    })
    const siteCallback = vi.fn<TestAuthCallback>()
    const missingChallengerCallback = vi.fn<TestAuthCallback>()

    registeredAuthListener()({ ...proxyChallenge('site'), isProxy: false }, siteCallback)
    registeredAuthListener()(
      { ...proxyChallenge('missing-challenger'), challenger: undefined },
      missingChallengerCallback,
    )

    expect(siteCallback).toHaveBeenCalledWith({})
    expect(missingChallengerCallback).toHaveBeenCalledWith({})
    expect(isSnapshotActive).not.toHaveBeenCalled()
    expect(waitForSnapshot).not.toHaveBeenCalled()
    unregister()
  })

  it('prevents late credentials after request cleanup or listener teardown', async () => {
    vi.useFakeTimers()
    const snapshot = authenticatedSnapshot()
    const resolvers: Array<(snapshot: RoutingSnapshot | null) => void> = []
    const unregister = registerProxyAuthListeners({
      getSnapshot: () => null,
      isSnapshotActive: () => Promise.resolve(true),
      onFailure: vi.fn(),
      platform: 'CHROMIUM',
      waitForSnapshot: () =>
        new Promise((resolve) => {
          resolvers.push(resolve)
        }),
    })
    const cleanedCallback = vi.fn<TestAuthCallback>()
    const unregisteredCallback = vi.fn<TestAuthCallback>()

    registeredAuthListener()(proxyChallenge('cleaned'), cleanedCallback)
    registeredCompletedListener()({ requestId: 'cleaned' })
    registeredAuthListener()(proxyChallenge('unregistered'), unregisteredCallback)
    unregister()

    expect(cleanedCallback).toHaveBeenCalledWith({})
    expect(unregisteredCallback).toHaveBeenCalledWith({})
    expect(vi.getTimerCount()).toBe(0)
    for (const resolve of resolvers) resolve(snapshot)
    await Promise.resolve()
    expect(cleanedCallback).toHaveBeenCalledOnce()
    expect(unregisteredCallback).toHaveBeenCalledOnce()
  })

  it('issues credentials once for concurrent challenges with the same request ID', async () => {
    const snapshot = authenticatedSnapshot()
    let currentSnapshot: RoutingSnapshot | null = null
    let resolveSnapshot!: (snapshot: RoutingSnapshot | null) => void
    const readySnapshot = new Promise<RoutingSnapshot | null>((resolve) => {
      resolveSnapshot = resolve
    })
    const onFailure = vi.fn()
    const unregister = registerProxyAuthListeners({
      getSnapshot: () => currentSnapshot,
      isSnapshotActive: () => Promise.resolve(true),
      onFailure,
      platform: 'CHROMIUM',
      waitForSnapshot: () => readySnapshot,
    })
    const firstCallback = vi.fn<TestAuthCallback>()
    const secondCallback = vi.fn<TestAuthCallback>()

    registeredAuthListener()(proxyChallenge('same-request'), firstCallback)
    registeredAuthListener()(proxyChallenge('same-request'), secondCallback)
    currentSnapshot = snapshot
    resolveSnapshot(snapshot)

    await vi.waitFor(() => {
      expect(firstCallback).toHaveBeenCalledOnce()
      expect(secondCallback).toHaveBeenCalledOnce()
    })
    expect(firstCallback).toHaveBeenCalledWith({
      authCredentials: { password: 'canary-password', username: 'alice' },
    })
    expect(secondCallback).toHaveBeenCalledWith({ cancel: true })
    expect(onFailure).toHaveBeenCalledOnce()
    unregister()
  })

  it('keeps the Firefox cold path synchronous', () => {
    const waitForSnapshot = vi.fn<() => Promise<RoutingSnapshot | null>>()
    const isSnapshotActive = vi.fn<() => Promise<boolean>>()
    const unregister = registerProxyAuthListeners({
      getSnapshot: () => null,
      isSnapshotActive,
      onFailure: vi.fn(),
      platform: 'FIREFOX',
      waitForSnapshot,
    })

    expect(registeredAuthListener()(proxyChallenge())).toEqual({})
    expect(isSnapshotActive).not.toHaveBeenCalled()
    expect(waitForSnapshot).not.toHaveBeenCalled()
    unregister()
  })
})
