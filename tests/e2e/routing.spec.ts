import type { Page } from '@playwright/test'

import { asProxyProfileId } from '../../src/domain/types/brand'
import type { AppConfig, ProxyProfile, Rule } from '../../src/domain/types/entities'
import { createDefaultConfig } from '../../src/storage/seed/create-default-config'
import { startHttpsProxy } from '../integration/proxies/https-proxy'
import { startHttpProxy, type HttpProxyFixture } from '../integration/proxies/http-proxy'
import { startHttpOrigin, type HttpOriginFixture } from '../integration/servers/http-origin'
import { startHttpsOrigin, type HttpsOriginFixture } from '../integration/servers/https-origin'
import { expect, test } from './fixtures/extension'

const CONFIG_KEY = 'config.v1'

interface ExtensionBrowserApi {
  readonly proxy: {
    readonly settings: {
      get(details: { incognito: boolean }): Promise<{
        value: { mode?: string; pacScript?: { data?: string } }
      }>
      set(details: {
        scope: 'regular'
        value: {
          mode: 'pac_script'
          pacScript: { data: string; mandatory: boolean }
        }
      }): Promise<void>
    }
  }
  readonly storage: {
    readonly local: {
      set(values: Readonly<Record<string, unknown>>): Promise<void>
    }
  }
}

const profile = (
  id: string,
  port: number,
  credentials: { username: string; password: string } = { password: '', username: '' },
): ProxyProfile => {
  const timestamp = new Date('2026-01-01T00:00:00.000Z').toISOString()
  const endpoint = {
    host: '127.0.0.1',
    password: credentials.password,
    port,
    transport: 'HTTP' as const,
    username: credentials.username,
  }
  return {
    checkUrl: 'http://127.0.0.1/',
    color: '#3154D5',
    createdAt: timestamp,
    generatedShortName: id.slice(0, 3).toUpperCase(),
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

const originRule = (id: string, position: number, origin: string, action: Rule['action']): Rule => {
  const timestamp = new Date('2026-01-01T00:00:00.000Z').toISOString()
  const escapedOrigin = origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return {
    action,
    createdAt: timestamp,
    description: '',
    enabled: true,
    flags: 'i',
    id,
    matcherType: 'ORIGIN',
    name: id,
    pattern: `^${escapedOrigin}/$`,
    position,
    temporaryDisable: null,
    updatedAt: timestamp,
    validity: 'VALID',
  } as Rule
}

const baseConfig = (): AppConfig => ({
  ...createDefaultConfig(),
  revision: 1,
  rules: [],
})

const applyConfig = async (extensionPage: Page, config: AppConfig): Promise<void> => {
  await extensionPage.evaluate(
    async ({ key, value }) => {
      const extensionApi = (globalThis as unknown as { chrome: ExtensionBrowserApi }).chrome
      await extensionApi.storage.local.set({ [key]: value })
    },
    { key: CONFIG_KEY, value: config },
  )
  const expectedMode = config.general.mode === 'DIRECT' ? 'direct' : 'pac_script'
  const expectedProxyPort = config.profiles[0]?.httpEndpoint.port
  await expect
    .poll(
      async () =>
        extensionPage.evaluate(async () => {
          const extensionApi = (globalThis as unknown as { chrome: ExtensionBrowserApi }).chrome
          const settings = await extensionApi.proxy.settings.get({ incognito: false })
          return {
            mode: settings.value.mode,
            script: settings.value.pacScript?.data ?? '',
          }
        }),
      { timeout: 5_000 },
    )
    .toEqual({
      mode: expectedMode,
      script:
        expectedMode === 'direct'
          ? ''
          : expect.stringContaining(`127.0.0.1:${String(expectedProxyPort)}`),
    })
}

const requestCountFor = (proxy: HttpProxyFixture, targetPrefix: string): number =>
  proxy.requests.filter((request) => request.target.startsWith(targetPrefix)).length

const applyRawPac = async (extensionPage: Page, script: string): Promise<void> => {
  await extensionPage.evaluate(async (pacScript) => {
    const extensionApi = (globalThis as unknown as { chrome: ExtensionBrowserApi }).chrome
    await extensionApi.proxy.settings.set({
      scope: 'regular',
      value: {
        mode: 'pac_script',
        pacScript: { data: pacScript, mandatory: true },
      },
    })
  }, script)
  await expect
    .poll(() =>
      extensionPage.evaluate(async () => {
        const extensionApi = (globalThis as unknown as { chrome: ExtensionBrowserApi }).chrome
        const settings = await extensionApi.proxy.settings.get({ incognito: false })
        return settings.value.pacScript?.data ?? ''
      }),
    )
    .toBe(script)
}

test.describe('actual Chromium proxy routing', () => {
  let origin: HttpOriginFixture
  let secureOrigin: HttpsOriginFixture
  const proxies: HttpProxyFixture[] = []

  test.beforeAll(async () => {
    ;[origin, secureOrigin] = await Promise.all([startHttpOrigin(), startHttpsOrigin()])
  })

  test.afterAll(async () => {
    await Promise.all(proxies.splice(0).map(async (proxy) => proxy.close()))
    await Promise.all([origin.close(), secureOrigin.close()])
  })

  test.beforeEach(() => {
    origin.reset()
    secureOrigin.reset()
    for (const proxy of proxies) {
      proxy.reset()
    }
  })

  test('switches between true direct and a mandatory global proxy', async ({
    extensionContext,
    extensionPage,
  }) => {
    const proxy = await startHttpProxy({ marker: 'global' })
    proxies.push(proxy)
    const page = await extensionContext.newPage()
    const targetOrigin = origin.origin.replace('127.0.0.1', 'origin.proxyloom.test')

    await applyConfig(extensionPage, baseConfig())
    await page.goto(`${targetOrigin}/direct`)
    expect(origin.requests.some((request) => request.path === '/direct')).toBe(true)
    expect(requestCountFor(proxy, origin.origin)).toBe(0)

    origin.reset()
    await applyConfig(extensionPage, {
      ...baseConfig(),
      general: {
        ...baseConfig().general,
        activeProxyProfileId: asProxyProfileId('global'),
        mode: 'PROXY',
      },
      profiles: [profile('global', proxy.port)],
      revision: 2,
    })
    await page.goto(`${targetOrigin}/proxied`)

    expect(requestCountFor(proxy, `${targetOrigin}/proxied`)).toBeGreaterThan(0)
    expect(
      origin.requests.some(
        (request) =>
          request.path === '/proxied' && request.headers['x-proxyloom-test-proxy'] === 'global',
      ),
    ).toBe(true)
    await page.close()
  })

  test('uses first-match rules and direct fallback in RULES mode', async ({
    extensionContext,
    extensionPage,
  }) => {
    const proxy = await startHttpProxy({ marker: 'rule' })
    proxies.push(proxy)
    const page = await extensionContext.newPage()
    const config = baseConfig()
    const targetOrigin = origin.origin.replace('127.0.0.1', 'origin.proxyloom.test')
    await applyConfig(extensionPage, {
      ...config,
      general: { ...config.general, mode: 'RULES' },
      profiles: [profile('rule-proxy', proxy.port)],
      revision: 3,
      rules: [
        originRule('first-direct', 0, targetOrigin, {
          targetProxyProfileId: null,
          type: 'DIRECT',
        }),
        originRule('second-proxy', 1, targetOrigin, {
          targetProxyProfileId: asProxyProfileId('rule-proxy'),
          type: 'PROXY',
        }),
      ],
    })

    await page.goto(`${targetOrigin}/first-match`)

    expect(origin.requests.some((request) => request.path === '/first-match')).toBe(true)
    expect(requestCountFor(proxy, origin.origin)).toBe(0)
    await page.close()
  })

  test('routes different rule matches through their assigned proxy profiles', async ({
    extensionContext,
    extensionPage,
  }) => {
    const russianProxy = await startHttpProxy({ marker: 'russian-route' })
    const germanProxy = await startHttpProxy({ marker: 'german-route' })
    proxies.push(russianProxy, germanProxy)
    const page = await extensionContext.newPage()
    const config = baseConfig()
    const russianOrigin = origin.origin.replace('127.0.0.1', 'site.ru.proxyloom.test')
    const germanOrigin = origin.origin.replace('127.0.0.1', 'site.de.proxyloom.test')

    await applyConfig(extensionPage, {
      ...config,
      general: { ...config.general, mode: 'RULES' },
      profiles: [profile('proxy-1', russianProxy.port), profile('proxy-2', germanProxy.port)],
      revision: 4,
      rules: [
        originRule('russian-domains', 0, russianOrigin, {
          targetProxyProfileId: asProxyProfileId('proxy-1'),
          type: 'PROXY',
        }),
        originRule('german-domains', 1, germanOrigin, {
          targetProxyProfileId: asProxyProfileId('proxy-2'),
          type: 'PROXY',
        }),
      ],
    })

    await page.goto(`${russianOrigin}/through-proxy-1`)
    await page.goto(`${germanOrigin}/through-proxy-2`)

    expect(requestCountFor(russianProxy, russianOrigin)).toBeGreaterThan(0)
    expect(requestCountFor(russianProxy, germanOrigin)).toBe(0)
    expect(requestCountFor(germanProxy, germanOrigin)).toBeGreaterThan(0)
    expect(requestCountFor(germanProxy, russianOrigin)).toBe(0)
    expect(
      origin.requests.some(
        (request) =>
          request.path === '/through-proxy-1' &&
          request.headers['x-proxyloom-test-proxy'] === 'russian-route',
      ),
    ).toBe(true)
    expect(
      origin.requests.some(
        (request) =>
          request.path === '/through-proxy-2' &&
          request.headers['x-proxyloom-test-proxy'] === 'german-route',
      ),
    ).toBe(true)
    await page.close()
  })

  test('fails closed when the selected proxy drops the connection', async ({
    extensionContext,
    extensionPage,
  }) => {
    const proxy = await startHttpProxy({ failureMode: 'DROP', marker: 'unreachable' })
    proxies.push(proxy)
    const config = baseConfig()
    const targetOrigin = origin.origin.replace('127.0.0.1', 'origin.proxyloom.test')
    await applyConfig(extensionPage, {
      ...config,
      general: {
        ...config.general,
        activeProxyProfileId: asProxyProfileId('unreachable'),
        mode: 'PROXY',
      },
      profiles: [profile('unreachable', proxy.port)],
      revision: 4,
    })
    const page = await extensionContext.newPage()

    await expect(
      page.goto(`${targetOrigin}/must-not-be-direct`, { timeout: 5_000 }),
    ).rejects.toThrow()

    expect(requestCountFor(proxy, `${targetOrigin}/must-not-be-direct`)).toBeGreaterThan(0)
    expect(origin.requests.some((request) => request.path === '/must-not-be-direct')).toBe(false)
    await expect.poll(() => page.url(), { timeout: 5_000 }).toContain('/error.html?token=')
    await expect(page.getByText('origin.proxyloom.test', { exact: true })).toBeVisible()
    await expect(page.locator('body')).not.toContainText('must-not-be-direct')
    await page.close()
  })

  test('answers proxy authentication once with credentials for the selected endpoint', async ({
    extensionContext,
    extensionPage,
  }) => {
    const proxy = await startHttpProxy({
      marker: 'authenticated',
      password: 'correct-password',
      username: 'proxy-user',
    })
    proxies.push(proxy)
    const config = baseConfig()
    const targetOrigin = origin.origin.replace('127.0.0.1', 'origin.proxyloom.test')
    await applyConfig(extensionPage, {
      ...config,
      general: {
        ...config.general,
        activeProxyProfileId: asProxyProfileId('authenticated'),
        mode: 'PROXY',
      },
      profiles: [
        profile('authenticated', proxy.port, {
          password: 'correct-password',
          username: 'proxy-user',
        }),
      ],
      revision: 5,
    })
    const page = await extensionContext.newPage()

    await page.goto(`${targetOrigin}/authenticated`)

    const attempts = proxy.requests.filter((request) =>
      request.target.startsWith(`${targetOrigin}/authenticated`),
    )
    expect(attempts.map((request) => request.authenticated)).toEqual([false, true])
    expect(origin.requests.some((request) => request.path === '/authenticated')).toBe(true)
    expect(JSON.stringify(proxy.requests)).not.toContain('correct-password')
    await page.close()
  })

  test('routes HTTP/WS and HTTPS/WSS to separate endpoints', async ({
    extensionContext,
    extensionPage,
  }) => {
    const httpProxy = await startHttpProxy({ marker: 'plain-endpoint' })
    const secureProxy = await startHttpProxy({ marker: 'secure-endpoint' })
    proxies.push(httpProxy, secureProxy)
    const config = baseConfig()
    const plainTarget = origin.origin.replace('127.0.0.1', 'origin.proxyloom.test')
    const secureTarget = secureOrigin.origin.replace('127.0.0.1', 'origin.proxyloom.test')
    const separateProfile = profile('separate', httpProxy.port)
    await applyConfig(extensionPage, {
      ...config,
      general: {
        ...config.general,
        activeProxyProfileId: asProxyProfileId('separate'),
        mode: 'PROXY',
      },
      profiles: [
        {
          ...separateProfile,
          httpsEndpoint: {
            ...separateProfile.httpsEndpoint,
            port: secureProxy.port,
          },
          useSameProxy: false,
        },
      ],
      revision: 6,
    })
    const page = await extensionContext.newPage()

    await page.goto(`${plainTarget}/plain-endpoint`)
    const plainWebsocketResult = await page.evaluate(
      (url) =>
        new Promise<string>((resolve, reject) => {
          const socket = new WebSocket(url)
          socket.addEventListener('message', (event) => {
            resolve(String(event.data))
            socket.close()
          })
          socket.addEventListener('error', () => reject(new Error(`WebSocket failed: ${url}`)))
        }),
      plainTarget.replace('http://', 'ws://') + '/socket',
    )
    await page.goto(`${secureTarget}/secure-endpoint`)
    const secureWebsocketResult = await page.evaluate(
      (url) =>
        new Promise<string>((resolve, reject) => {
          const socket = new WebSocket(url)
          socket.addEventListener('message', (event) => {
            resolve(String(event.data))
            socket.close()
          })
          socket.addEventListener('error', () => reject(new Error(`WebSocket failed: ${url}`)))
        }),
      secureTarget.replace('https://', 'wss://') + '/socket',
    )

    expect(
      httpProxy.requests.some(
        (request) =>
          request.kind === 'HTTP' && request.target.startsWith(`${plainTarget}/plain-endpoint`),
      ),
    ).toBe(true)
    expect(
      secureProxy.requests.some(
        (request) => request.kind === 'CONNECT' && request.target === new URL(secureTarget).host,
      ),
    ).toBe(true)
    expect(plainWebsocketResult).toBe('origin-websocket')
    expect(secureWebsocketResult).toBe('secure-origin-websocket')
    expect(
      httpProxy.requests.some(
        (request) => request.kind === 'CONNECT' && request.target === new URL(plainTarget).host,
      ),
    ).toBe(true)
    expect(
      secureProxy.requests.some(
        (request) => request.kind === 'CONNECT' && request.target === new URL(secureTarget).host,
      ),
    ).toBe(true)
    await page.close()
  })

  test('supports an HTTPS proxy transport selected by PAC', async ({
    extensionContext,
    extensionPage,
  }) => {
    const proxy = await startHttpsProxy({ marker: 'tls-proxy' })
    proxies.push(proxy)
    const config = baseConfig()
    const targetOrigin = origin.origin.replace('127.0.0.1', 'origin.proxyloom.test')
    const secureTransportProfile = profile('https-transport', proxy.port)
    await applyConfig(extensionPage, {
      ...config,
      general: {
        ...config.general,
        activeProxyProfileId: asProxyProfileId('https-transport'),
        mode: 'PROXY',
      },
      profiles: [
        {
          ...secureTransportProfile,
          httpEndpoint: {
            ...secureTransportProfile.httpEndpoint,
            transport: 'HTTPS',
          },
          httpsEndpoint: {
            ...secureTransportProfile.httpsEndpoint,
            transport: 'HTTPS',
          },
        },
      ],
      revision: 7,
    })
    const page = await extensionContext.newPage()

    await page.goto(`${targetOrigin}/tls-proxy`)

    expect(
      proxy.requests.some((request) => request.target.startsWith(`${targetOrigin}/tls-proxy`)),
    ).toBe(true)
    expect(
      origin.requests.some(
        (request) =>
          request.path === '/tls-proxy' &&
          request.headers['x-proxyloom-test-proxy'] === 'tls-proxy',
      ),
    ).toBe(true)
    await page.close()
  })

  test('routes a browser download through the selected endpoint', async ({
    extensionContext,
    extensionPage,
  }) => {
    const proxy = await startHttpProxy({ marker: 'download' })
    proxies.push(proxy)
    const config = baseConfig()
    const targetOrigin = origin.origin.replace('127.0.0.1', 'origin.proxyloom.test')
    await applyConfig(extensionPage, {
      ...config,
      general: {
        ...config.general,
        activeProxyProfileId: asProxyProfileId('download'),
        mode: 'PROXY',
      },
      profiles: [profile('download', proxy.port)],
      revision: 8,
    })
    const page = await extensionContext.newPage()
    await page.setContent(`<a href="${targetOrigin}/download">download fixture</a>`)

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('link', { name: 'download fixture' }).click()
    const download = await downloadPromise

    expect(download.suggestedFilename()).toBe('proxyloom-test.txt')
    expect(
      proxy.requests.some((request) => request.target.startsWith(`${targetOrigin}/download`)),
    ).toBe(true)
    await download.cancel()
    await page.close()
  })

  test('records which URL portions Chromium exposes to PAC by scheme', async ({
    extensionContext,
    extensionPage,
  }) => {
    const pathVisibleProxy = await startHttpProxy({ marker: 'path-visible' })
    const originOnlyProxy = await startHttpProxy({ marker: 'origin-only' })
    proxies.push(pathVisibleProxy, originOnlyProxy)
    const plainTarget = origin.origin.replace('127.0.0.1', 'origin.proxyloom.test')
    const secureTarget = secureOrigin.origin.replace('127.0.0.1', 'origin.proxyloom.test')
    await applyRawPac(
      extensionPage,
      `function FindProxyForURL(url, host) {
  if (url.indexOf('/visible-token') >= 0) return 'PROXY 127.0.0.1:${pathVisibleProxy.port}';
  return 'PROXY 127.0.0.1:${originOnlyProxy.port}';
}`,
    )
    const page = await extensionContext.newPage()

    pathVisibleProxy.reset()
    originOnlyProxy.reset()
    await page.goto(`${plainTarget}/visible-token`)
    const httpPacInput =
      requestCountFor(pathVisibleProxy, `${plainTarget}/visible-token`) > 0
        ? 'PATH_VISIBLE'
        : 'ORIGIN_ONLY'
    pathVisibleProxy.reset()
    originOnlyProxy.reset()
    const plainWebSocket = await page.evaluate(
      (url) =>
        new Promise<string>((resolve, reject) => {
          const socket = new WebSocket(url)
          socket.addEventListener('message', (event) => {
            resolve(String(event.data))
            socket.close()
          })
          socket.addEventListener('error', () => reject(new Error(`WebSocket failed: ${url}`)))
        }),
      plainTarget.replace('http://', 'ws://') + '/visible-token',
    )
    const wsHost = new URL(plainTarget).host
    const wsPacInput = pathVisibleProxy.requests.some(
      (request) => request.kind === 'CONNECT' && request.target === wsHost,
    )
      ? 'PATH_VISIBLE'
      : 'ORIGIN_ONLY'
    pathVisibleProxy.reset()
    originOnlyProxy.reset()
    await page.goto(`${secureTarget}/visible-token`)
    const secureHost = new URL(secureTarget).host
    const httpsPacInput = pathVisibleProxy.requests.some(
      (request) => request.kind === 'CONNECT' && request.target === secureHost,
    )
      ? 'PATH_VISIBLE'
      : 'ORIGIN_ONLY'
    pathVisibleProxy.reset()
    originOnlyProxy.reset()
    const secureWebSocket = await page.evaluate(
      (url) =>
        new Promise<string>((resolve, reject) => {
          const socket = new WebSocket(url)
          socket.addEventListener('message', (event) => {
            resolve(String(event.data))
            socket.close()
          })
          socket.addEventListener('error', () => reject(new Error(`WebSocket failed: ${url}`)))
        }),
      secureTarget.replace('https://', 'wss://') + '/visible-token',
    )
    const wssPacInput = pathVisibleProxy.requests.some(
      (request) => request.kind === 'CONNECT' && request.target === secureHost,
    )
      ? 'PATH_VISIBLE'
      : 'ORIGIN_ONLY'

    expect({ http: httpPacInput, https: httpsPacInput, ws: wsPacInput, wss: wssPacInput }).toEqual({
      http: 'PATH_VISIBLE',
      https: 'ORIGIN_ONLY',
      ws: 'PATH_VISIBLE',
      wss: 'ORIGIN_ONLY',
    })
    expect(plainWebSocket).toBe('origin-websocket')
    expect(secureWebSocket).toBe('secure-origin-websocket')
    await page.close()
  })
})
