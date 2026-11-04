import { randomUUID } from 'node:crypto'
import { createServer, type AddressInfo } from 'node:net'

import type { Page } from '@playwright/test'

import { asProxyProfileId } from '../../src/domain/types/brand'
import type { AppConfig, ProxyProfile } from '../../src/domain/types/entities'
import { createDefaultConfig } from '../../src/storage/seed/create-default-config'
import { startSocks5Proxy, type Socks5ProxyFixture } from '../integration/proxies/socks5-proxy'
import { startHttpOrigin, type HttpOriginFixture } from '../integration/servers/http-origin'
import { startHttpsOrigin, type HttpsOriginFixture } from '../integration/servers/https-origin'
import { expect, test } from './fixtures/extension'

// The SOCKS5 profile is written through the page context; traces stay off so the synthetic
// credentials never reach test artifacts.
test.use({ trace: 'off' })

const CONFIG_KEY = 'config.v1'

interface ChromeApi {
  readonly proxy: {
    readonly settings: {
      get(details: { incognito: boolean }): Promise<{ value: { pacScript?: { data?: string } } }>
    }
  }
  readonly storage: {
    readonly local: {
      get(keys: readonly string[]): Promise<Readonly<Record<string, unknown>>>
      set(values: Readonly<Record<string, unknown>>): Promise<void>
    }
  }
}

const socksProfile = (
  id: string,
  port: number,
  credentials = { password: '', username: '' },
): ProxyProfile => {
  const timestamp = new Date('2026-01-01T00:00:00.000Z').toISOString()
  const endpoint = { host: '127.0.0.1', port, transport: 'SOCKS5' as const, ...credentials }
  return {
    checkUrl: 'http://127.0.0.1/',
    color: '#3154D5',
    createdAt: timestamp,
    generatedShortName: 'SOC',
    httpEndpoint: endpoint,
    httpsEndpoint: endpoint,
    id,
    lastCheck: null,
    name: id,
    note: '',
    shortName: null,
    updatedAt: timestamp,
    useSameProxy: true,
  } as ProxyProfile
}

const proxyConfig = (profile: ProxyProfile): AppConfig => {
  const base = createDefaultConfig()
  return {
    ...base,
    general: { ...base.general, activeProxyProfileId: asProxyProfileId(profile.id), mode: 'PROXY' },
    profiles: [profile],
    revision: 1,
    rules: [],
  }
}

const applyConfig = async (extensionPage: Page, config: AppConfig): Promise<void> => {
  await extensionPage.evaluate(
    async ({ key, value }) => {
      const api = (globalThis as unknown as { chrome: ChromeApi }).chrome
      const stored = await api.storage.local.get([key])
      const revision = (stored[key] as { revision?: number } | undefined)?.revision ?? -1
      await api.storage.local.set({ [key]: { ...value, revision: revision + 1 } })
    },
    { key: CONFIG_KEY, value: config },
  )
  const port = config.profiles[0]?.httpEndpoint.port
  await expect
    .poll(
      () =>
        extensionPage.evaluate(async () => {
          const api = (globalThis as unknown as { chrome: ChromeApi }).chrome
          return (await api.proxy.settings.get({ incognito: false })).value.pacScript?.data ?? ''
        }),
      { timeout: 5_000 },
    )
    .toContain(`SOCKS5 127.0.0.1:${String(port)}`)
}

const closedPort = async (): Promise<number> => {
  const server = createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  await new Promise((resolve) => server.close(resolve))
  return port
}

test.describe('Chromium SOCKS5 routing through the production build (PL-145)', () => {
  let origin: HttpOriginFixture
  let secureOrigin: HttpsOriginFixture
  const proxies: Socks5ProxyFixture[] = []

  test.beforeAll(async () => {
    ;[origin, secureOrigin] = await Promise.all([startHttpOrigin(), startHttpsOrigin()])
  })

  test.afterAll(async () => {
    await Promise.all(proxies.splice(0).map(async (proxy) => proxy.close()))
    await Promise.all([origin.close(), secureOrigin.close()])
  })

  test('routes HTTP and HTTPS through SOCKS5 with proxy-side DNS', async ({
    extensionContext,
    extensionPage,
  }) => {
    const proxy = await startSocks5Proxy()
    proxies.push(proxy)
    await applyConfig(extensionPage, proxyConfig(socksProfile('socks-open', proxy.port)))
    const page = await extensionContext.newPage()
    const http = origin.origin.replace('127.0.0.1', 'socks-http.proxyloom.test')
    const https = secureOrigin.origin.replace('127.0.0.1', 'socks-https.proxyloom.test')

    await page.goto(`${http}/socks-http`)
    await page.goto(`${https}/socks-https`)

    expect(origin.requests.some((request) => request.path === '/socks-http')).toBe(true)
    expect(secureOrigin.requests.some((request) => request.path === '/socks-https')).toBe(true)
    for (const host of [new URL(http).host, new URL(https).host]) {
      expect(proxy.connections).toContainEqual(
        expect.objectContaining({ addressType: 'DOMAIN', outcome: 'TUNNELED', target: host }),
      )
    }
    await page.close()
  })

  test('fails closed when the SOCKS5 endpoint is unreachable', async ({
    extensionContext,
    extensionPage,
  }) => {
    await applyConfig(extensionPage, proxyConfig(socksProfile('socks-down', await closedPort())))
    const page = await extensionContext.newPage()
    const target = origin.origin.replace('127.0.0.1', 'origin.proxyloom.test')

    await expect(
      page.goto(`${target}/socks-must-not-be-direct`, { timeout: 5_000 }),
    ).rejects.toThrow()

    expect(origin.requests.some((request) => request.path === '/socks-must-not-be-direct')).toBe(
      false,
    )
    await expect.poll(() => page.url(), { timeout: 5_000 }).toContain('/error.html?token=')
    await page.close()
  })

  test('keeps SOCKS5 credentials, shows authentication unsupported and never goes DIRECT', async ({
    extensionContext,
    extensionId,
    extensionPage,
  }) => {
    const username = `socks-user-${randomUUID()}`
    const password = `socks-password-${randomUUID()}`
    const proxy = await startSocks5Proxy({ password, username })
    proxies.push(proxy)
    await applyConfig(
      extensionPage,
      proxyConfig(socksProfile('socks-auth', proxy.port, { password, username })),
    )
    const page = await extensionContext.newPage()
    const target = origin.origin.replace('127.0.0.1', 'origin.proxyloom.test')

    await expect(page.goto(`${target}/socks-auth-blocked`, { timeout: 5_000 })).rejects.toThrow()

    expect(origin.requests.some((request) => request.path === '/socks-auth-blocked')).toBe(false)
    expect(proxy.connections.length).toBeGreaterThan(0)
    expect(proxy.connections.every((connection) => connection.authMethod === 'NO_ACCEPTABLE')).toBe(
      true,
    )

    const options = await extensionContext.newPage()
    await options.goto(`chrome-extension://${extensionId}/options.html#proxies`)
    const row = options.locator('li.proxy-row', { hasText: 'socks-auth' })
    await expect(row.locator('.socks5-auth-unsupported')).toHaveText(
      /Authentication unsupported in this browser/u,
    )
    await expect(row.locator('.badge.protocol')).toHaveText('SOCKS5')
    const stored = await extensionPage.evaluate(async (key) => {
      const api = (globalThis as unknown as { chrome: ChromeApi }).chrome
      return (await api.storage.local.get([key]))[key] as AppConfig
    }, CONFIG_KEY)
    expect(stored.profiles[0]?.httpEndpoint).toMatchObject({
      password,
      transport: 'SOCKS5',
      username,
    })
    await options.close()
    await page.close()
  })
})
