import { beforeEach, describe, expect, it, vi } from 'vitest'

import { buildRoutingSnapshot } from '../../../src/domain/routing/snapshot'
import { FirefoxProxyAdapter } from '../../../src/platform/firefox/adapter'
import { asProxyProfileId } from '../../../src/domain/types/brand'
import { config, profile } from '../domain/fixtures'

const mocks = vi.hoisted(() => ({
  onRequestAdd: vi.fn(),
  settingsGet: vi.fn(),
  settingsSet: vi.fn(),
}))

vi.mock('wxt/browser', () => ({
  browser: {
    proxy: {
      onRequest: {
        addListener: mocks.onRequestAdd,
      },
      settings: {
        get: mocks.settingsGet,
        set: mocks.settingsSet,
      },
    },
  },
}))

interface RequestDetails {
  readonly incognito?: boolean
  readonly tabId: number
  readonly url: string
}

type ProxyResult =
  { readonly host?: string; readonly port?: number; readonly type: string } | null | undefined

type ProxyListener = (details: RequestDetails) => ProxyResult | Promise<ProxyResult>

const listener = (): ProxyListener => {
  const registered = mocks.onRequestAdd.mock.calls[0]?.[0] as ProxyListener | undefined
  expect(registered).toBeTypeOf('function')
  if (registered === undefined) throw new Error('Firefox proxy listener was not registered.')
  return registered
}

const proxySnapshot = () => {
  const selectedProfile = profile('firefox-profile')
  const current = config({
    general: {
      ...config().general,
      activeProxyProfileId: asProxyProfileId('firefox-profile'),
      mode: 'PROXY',
    },
    profiles: [selectedProfile],
  })
  const snapshot = buildRoutingSnapshot(current, [], new Date())
  expect(snapshot.ok).toBe(true)
  if (!snapshot.ok) throw new Error(snapshot.error.code)
  return snapshot.value
}

describe('FirefoxProxyAdapter event-page lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.settingsGet.mockResolvedValue({
      levelOfControl: 'controllable_by_this_extension',
    })
    mocks.settingsSet.mockResolvedValue(undefined)
  })

  it('registers proxy.onRequest synchronously in the constructor', () => {
    new FirefoxProxyAdapter()

    expect(mocks.onRequestAdd).toHaveBeenCalledOnce()
    expect(mocks.onRequestAdd).toHaveBeenCalledWith(expect.any(Function), {
      urls: ['<all_urls>'],
    })
    expect(mocks.settingsSet).not.toHaveBeenCalled()
  })

  it('holds the wake-up request until the persisted snapshot has been restored', async () => {
    let releaseSettings: (() => void) | undefined
    mocks.settingsSet.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          releaseSettings = resolve
        }),
    )
    const adapter = new FirefoxProxyAdapter()
    const wakeUpRoute = listener()({
      incognito: false,
      tabId: 7,
      url: 'https://example.com/private?token=secret',
    })
    const apply = adapter.applySnapshot(proxySnapshot())

    let settled = false
    void Promise.resolve(wakeUpRoute).then(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)

    releaseSettings?.()
    await expect(apply).resolves.toEqual({ ok: true, value: 1 })
    await expect(wakeUpRoute).resolves.toEqual({
      host: '127.0.0.1',
      port: 8443,
      type: 'https',
    })
    expect(mocks.onRequestAdd).toHaveBeenCalledOnce()
  })

  it('returns terminal null DIRECT only after proxy settings ownership is restored', async () => {
    const adapter = new FirefoxProxyAdapter()
    await expect(adapter.applyDirect(4)).resolves.toEqual({ ok: true, value: 4 })

    expect(
      listener()({
        incognito: false,
        tabId: 8,
        url: 'http://example.com/',
      }),
    ).toBeNull()
  })

  it('fails closed when restoring Firefox proxy settings fails', async () => {
    mocks.settingsSet.mockRejectedValue(new Error('settings unavailable'))
    const adapter = new FirefoxProxyAdapter()
    const wakeUpRoute = listener()({
      incognito: false,
      tabId: 9,
      url: 'https://example.com/',
    })

    await expect(adapter.applySnapshot(proxySnapshot())).resolves.toEqual({
      error: {
        code: 'API_ERROR',
        message: 'settings unavailable',
      },
      ok: false,
    })
    await expect(wakeUpRoute).resolves.toEqual({
      host: '127.0.0.1',
      port: 9,
      type: 'http',
    })
  })
})
