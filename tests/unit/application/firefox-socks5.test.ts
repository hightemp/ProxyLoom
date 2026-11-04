import { beforeEach, describe, expect, it, vi } from 'vitest'

import { isSupportedProxyFailure } from '../../../src/application/errors/proxy-failure-classifier'
import { buildRoutingSnapshot } from '../../../src/domain/routing/snapshot'
import { ChromiumProxyAdapter } from '../../../src/platform/chromium/adapter'
import { FirefoxProxyAdapter } from '../../../src/platform/firefox/adapter'
import { config, endpoint, profile, rule } from '../domain/fixtures'

const mocks = vi.hoisted(() => ({
  onRequestAdd: vi.fn(),
  settingsGet: vi.fn(),
  settingsSet: vi.fn(),
}))

vi.mock('wxt/browser', () => ({
  browser: {
    proxy: {
      onRequest: { addListener: mocks.onRequestAdd },
      settings: { get: mocks.settingsGet, set: mocks.settingsSet },
    },
  },
}))

type Listener = (details: { tabId: number; url: string }) => unknown

const listener = (): Listener => mocks.onRequestAdd.mock.calls[0]?.[0] as Listener

const snapshotFor = (...profiles: ReturnType<typeof profile>[]) => {
  const snapshot = buildRoutingSnapshot(
    config({
      profiles,
      rules: profiles.map((entry, index) =>
        rule(`rule-${entry.id}`, index, {
          action: { targetProxyProfileId: entry.id, type: 'PROXY' },
          pattern: `^http://${entry.id}\\.example/$`,
        }),
      ),
    }),
    [],
    new Date(),
  )
  if (!snapshot.ok) throw new Error(snapshot.error.code)
  return snapshot.value
}

describe('Firefox SOCKS5 ProxyInfo (ADR-016)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.settingsGet.mockResolvedValue({ levelOfControl: 'controllable_by_this_extension' })
    mocks.settingsSet.mockResolvedValue(true)
  })

  it('returns one socks ProxyInfo with proxy-side DNS and the profile credentials', async () => {
    const withAuth = profile('auth', {
      httpEndpoint: {
        ...endpoint('192.0.2.5', 1080, 'SOCKS5'),
        password: 'synthetic-pass',
        username: 'synthetic-user',
      },
      useSameProxy: true,
    })
    const anonymous = profile('anon', {
      httpEndpoint: endpoint('socks.example', 1081, 'SOCKS5'),
      useSameProxy: true,
    })
    const adapter = new FirefoxProxyAdapter()
    await adapter.applySnapshot(snapshotFor(withAuth, anonymous))

    expect(listener()({ tabId: 1, url: 'http://auth.example/' })).toEqual({
      host: '192.0.2.5',
      password: 'synthetic-pass',
      port: 1080,
      proxyDNS: true,
      type: 'socks',
      username: 'synthetic-user',
    })
    expect(listener()({ tabId: 1, url: 'http://anon.example/' })).toEqual({
      host: 'socks.example',
      port: 1081,
      proxyDNS: true,
      type: 'socks',
    })
  })

  it('keeps HTTP ProxyInfo free of credentials (they go through onAuthRequired)', async () => {
    const http = profile('http', {
      httpEndpoint: { ...endpoint('192.0.2.6', 3128), password: 'p', username: 'u' },
      useSameProxy: true,
    })
    const adapter = new FirefoxProxyAdapter()
    await adapter.applySnapshot(snapshotFor(http))
    expect(listener()({ tabId: 1, url: 'http://http.example/' })).toEqual({
      host: '192.0.2.6',
      port: 3128,
      type: 'http',
    })
  })

  it('declares socks5Auth per browser family', () => {
    expect(new FirefoxProxyAdapter().capabilities.socks5Auth).toBe(true)
    expect(new ChromiumProxyAdapter().capabilities.socks5Auth).toBe(false)
  })
})

describe('SOCKS5 failures are proxy failures', () => {
  it.each([
    'net::ERR_SOCKS_CONNECTION_FAILED',
    'net::ERR_SOCKS_CONNECTION_HOST_UNREACHABLE',
    'net::ERR_PROXY_CONNECTION_FAILED',
    'NS_ERROR_PROXY_CONNECTION_REFUSED',
    'NS_ERROR_CONNECTION_REFUSED',
    'NS_ERROR_UNKNOWN_PROXY_HOST',
  ])('%s', (code) => {
    expect(isSupportedProxyFailure(code)).toBe(true)
  })
})
