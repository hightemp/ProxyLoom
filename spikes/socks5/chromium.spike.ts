// PL-144 Chromium SOCKS5 spike. Prototype only; nothing here is imported by production code.
// A minimal MV3 extension applies a PAC script returning `SOCKS5 host:port` and records
// webRequest proxy-auth challenges. Local fixtures observe what actually reached the proxy.
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer, type AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, type BrowserContext, type Page, type Worker } from '@playwright/test'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  startSocks5Proxy,
  type Socks5ProxyFixture,
} from '../../tests/integration/proxies/socks5-proxy'
import {
  startHttpOrigin,
  type HttpOriginFixture,
} from '../../tests/integration/servers/http-origin'
import {
  startHttpsOrigin,
  type HttpsOriginFixture,
} from '../../tests/integration/servers/https-origin'
import { sanitize, writeTrace, type SpikeObservation } from './trace'

const USER = 'spike-socks-user'
const PASSWORD = 'spike-socks-password'
const SECRETS = [PASSWORD, USER]

const manifest = {
  background: { service_worker: 'background.js' },
  host_permissions: ['<all_urls>'],
  incognito: 'spanning',
  manifest_version: 3,
  name: 'ProxyLoom SOCKS5 Chromium spike',
  permissions: ['proxy', 'webRequest', 'webRequestAuthProvider'],
  version: '0.0.1',
}

const background = `
globalThis.authChallenges = [];
chrome.webRequest.onAuthRequired.addListener(
  (details, callback) => {
    globalThis.authChallenges.push({
      isProxy: details.isProxy,
      scheme: details.scheme,
      challenger: details.challenger,
      url: details.url,
    });
    callback({ authCredentials: { username: 'spike-socks-user', password: 'spike-socks-password' } });
  },
  { urls: ['<all_urls>'] },
  ['asyncBlocking'],
);
globalThis.applyPac = (data) =>
  new Promise((resolve, reject) =>
    chrome.proxy.settings.set(
      { value: { mode: 'pac_script', pacScript: { data, mandatory: true } }, scope: 'regular' },
      () => (chrome.runtime.lastError ? reject(chrome.runtime.lastError.message) : resolve()),
    ),
  );
globalThis.readSettings = () =>
  new Promise((resolve) => chrome.proxy.settings.get({ incognito: false }, resolve));
`

const freePort = async (): Promise<number> => {
  const server = createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  await new Promise((resolve) => server.close(resolve))
  return port
}

const pac = (directive: string): string =>
  `function FindProxyForURL(url, host) { return ${JSON.stringify(directive)}; }`

describe('Chromium MV3 PAC SOCKS5 (PL-144)', () => {
  let context: BrowserContext
  let worker: Worker
  let page: Page
  let profileDirectory: string
  let httpOrigin: HttpOriginFixture
  let httpsOrigin: HttpsOriginFixture
  let open: Socks5ProxyFixture
  let auth: Socks5ProxyFixture
  let closedPort: number
  const observations: SpikeObservation[] = []

  const observe = (observation: SpikeObservation) => {
    observations.push(observation)
  }

  const apply = async (directive: string) => {
    await worker.evaluate(
      async (data) =>
        (globalThis as unknown as { applyPac(d: string): Promise<void> }).applyPac(data),
      pac(directive),
    )
    // Let the network service pick up the new PAC and drop pooled connections.
    // A failed navigation may still be committing its error page, so use a fresh tab.
    await page.close()
    page = await context.newPage()
    await page.waitForTimeout(300)
  }

  const navigate = async (
    url: string,
  ): Promise<{ ok: boolean; error: string | null; body: string }> => {
    try {
      const response = await page.goto(url, { timeout: 10_000 })
      return {
        body: (await page.textContent('body')) ?? '',
        error: null,
        ok: response?.ok() ?? false,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return {
        body: '',
        error: /net::[A-Z_]+/.exec(message)?.[0] ?? message.split('\n')[0] ?? '',
        ok: false,
      }
    }
  }

  const websocket = (url: string): Promise<string> =>
    page.evaluate(
      (target) =>
        new Promise<string>((resolve) => {
          const socket = new WebSocket(target)
          const timer = setTimeout(() => resolve('timeout'), 5_000)
          socket.onmessage = (event) => {
            clearTimeout(timer)
            resolve(String(event.data))
            socket.close()
          }
          socket.onerror = () => {
            clearTimeout(timer)
            resolve('error')
          }
        }),
      url,
    )

  beforeAll(async () => {
    httpOrigin = await startHttpOrigin()
    httpsOrigin = await startHttpsOrigin()
    open = await startSocks5Proxy()
    auth = await startSocks5Proxy({ password: PASSWORD, username: USER })
    closedPort = await freePort()
    profileDirectory = await mkdtemp(join(tmpdir(), 'proxyloom-socks5-chromium-'))
    const extensionDirectory = join(profileDirectory, 'extension')
    await mkdir(extensionDirectory)
    await writeFile(join(extensionDirectory, 'manifest.json'), JSON.stringify(manifest))
    await writeFile(join(extensionDirectory, 'background.js'), background)
    context = await chromium.launchPersistentContext(join(profileDirectory, 'profile'), {
      acceptDownloads: true,
      args: [
        `--disable-extensions-except=${extensionDirectory}`,
        `--load-extension=${extensionDirectory}`,
        // Only `mapped.proxyloom.test` resolves locally; every other test name is resolvable
        // exclusively by the SOCKS5 fixture, which separates proxy-side from local DNS.
        '--host-resolver-rules=MAP mapped.proxyloom.test 127.0.0.1',
        '--ignore-certificate-errors',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-component-update',
      ],
      ...(process.env.PROXYLOOM_BROWSER_EXECUTABLE === undefined
        ? { channel: 'chromium' as const }
        : { executablePath: process.env.PROXYLOOM_BROWSER_EXECUTABLE }),
      headless: true,
      ignoreHTTPSErrors: true,
    })
    worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
    page = await context.newPage()
  })

  afterAll(async () => {
    await context?.close()
    await Promise.all([httpOrigin?.close(), httpsOrigin?.close(), open?.close(), auth?.close()])
    await rm(profileDirectory, { force: true, recursive: true })
  })

  it('records routing, DNS, auth and fail-closed behavior', async () => {
    const httpPort = Number(new URL(httpOrigin.origin).port)
    const httpsPort = Number(new URL(httpsOrigin.origin).port)
    const http = (host: string, path: string) => `http://${host}:${httpPort}${path}`
    const https = (host: string, path: string) => `https://${host}:${httpsPort}${path}`
    const version = await page.evaluate(
      () => /Chrome\/([\d.]+)/.exec(navigator.userAgent)?.[1] ?? '',
    )

    // 1. No-auth SOCKS5: HTTP, HTTPS, WS, WSS, download, proxy-side DNS.
    await apply(`SOCKS5 127.0.0.1:${open.port}`)
    const settings = await worker.evaluate(() =>
      (
        globalThis as unknown as { readSettings(): Promise<{ levelOfControl: string }> }
      ).readSettings(),
    )
    observe({
      expectation: 'extension controls proxy settings with a SOCKS5 PAC',
      observed: { levelOfControl: settings.levelOfControl },
      pass: settings.levelOfControl === 'controlled_by_this_extension',
      scenario: 'apply-pac',
    })

    const httpResult = await navigate(http('remote.proxyloom.test', '/chromium-http'))
    observe({
      expectation: 'HTTP target loads through SOCKS5; host name sent unresolved (ATYP DOMAIN)',
      observed: { ...httpResult, body: undefined, connections: [...open.connections] },
      pass:
        httpResult.ok &&
        httpOrigin.requests.some((request) => request.path === '/chromium-http') &&
        open.connections.some(
          (connection) =>
            connection.addressType === 'DOMAIN' &&
            connection.target === `remote.proxyloom.test:${httpPort}` &&
            connection.outcome === 'TUNNELED',
        ),
      scenario: 'http-no-auth-remote-dns',
    })

    open.reset()
    const mappedResult = await navigate(http('mapped.proxyloom.test', '/chromium-http-mapped'))
    observe({
      expectation: 'locally resolvable host is still sent as DOMAIN (no local DNS before SOCKS5)',
      observed: { ...mappedResult, body: undefined, connections: [...open.connections] },
      pass:
        mappedResult.ok &&
        open.connections.every((connection) => connection.addressType === 'DOMAIN'),
      scenario: 'dns-mapped-host',
    })

    open.reset()
    const httpsResult = await navigate(https('remote.proxyloom.test', '/chromium-https'))
    observe({
      expectation: 'HTTPS target tunnels through SOCKS5',
      observed: { ...httpsResult, body: undefined, connections: [...open.connections] },
      pass:
        httpsResult.ok &&
        httpsOrigin.requests.some((request) => request.path === '/chromium-https') &&
        open.connections.some(
          (connection) => connection.target === `remote.proxyloom.test:${httpsPort}`,
        ),
      scenario: 'https-no-auth',
    })

    await navigate(http('remote.proxyloom.test', '/chromium-ws-page'))
    open.reset()
    const wsMessage = await websocket(`ws://remote.proxyloom.test:${httpPort}/chromium-ws`)
    observe({
      expectation: 'WS upgrade travels through SOCKS5',
      observed: { message: wsMessage, connections: [...open.connections] },
      pass:
        wsMessage === 'origin-websocket' &&
        open.connections.some(
          (connection) => connection.target === `remote.proxyloom.test:${httpPort}`,
        ),
      scenario: 'ws',
    })

    await navigate(https('remote.proxyloom.test', '/chromium-wss-page'))
    open.reset()
    const wssMessage = await websocket(`wss://remote.proxyloom.test:${httpsPort}/chromium-wss`)
    observe({
      expectation: 'WSS upgrade travels through SOCKS5',
      observed: { message: wssMessage, connections: [...open.connections] },
      pass:
        wssMessage === 'secure-origin-websocket' &&
        open.connections.some(
          (connection) => connection.target === `remote.proxyloom.test:${httpsPort}`,
        ),
      scenario: 'wss',
    })

    await navigate(http('remote.proxyloom.test', '/chromium-download-page'))
    open.reset()
    const downloadPromise = page.waitForEvent('download', { timeout: 10_000 })
    await page.evaluate(
      (href) => {
        const link = document.createElement('a')
        link.href = href
        link.download = ''
        document.body.append(link)
        link.click()
      },
      http('download.proxyloom.test', '/download'),
    )
    const download = await downloadPromise
    const downloadPath = await download.path()
    const downloadBody = downloadPath === null ? '' : await readFile(downloadPath, 'utf8')
    observe({
      expectation: 'browser download on a fresh host goes through SOCKS5 with proxy-side DNS',
      observed: { body: downloadBody, connections: [...open.connections] },
      pass:
        downloadBody === 'deterministic download' &&
        open.connections.some(
          (connection) =>
            connection.target === `download.proxyloom.test:${httpPort}` &&
            connection.addressType === 'DOMAIN',
        ),
      scenario: 'download',
    })

    // 2. SOCKS5 server that requires RFC 1929 username/password.
    await apply(`SOCKS5 127.0.0.1:${auth.port}`)
    httpOrigin.reset()
    const authResult = await navigate(http('mapped.proxyloom.test', '/chromium-auth'))
    const challenges = await worker.evaluate(
      () => (globalThis as unknown as { authChallenges: unknown[] }).authChallenges,
    )
    observe({
      expectation:
        'Chromium offers only NO AUTH, never calls onAuthRequired, the request fails with no DIRECT fallback',
      observed: {
        ...authResult,
        body: undefined,
        challenges,
        connections: [...auth.connections],
        originReached: httpOrigin.requests.some((request) => request.path === '/chromium-auth'),
      },
      pass:
        !authResult.ok &&
        challenges.length === 0 &&
        auth.connections.every((connection) => connection.authMethod === 'NO_ACCEPTABLE') &&
        !httpOrigin.requests.some((request) => request.path === '/chromium-auth'),
      scenario: 'auth-required',
    })

    // 3. Credentials inside the PAC directive are not a supported syntax.
    auth.reset()
    await apply(`SOCKS5 spike-socks-user:spike-socks-password@127.0.0.1:${auth.port}`)
    const inlineResult = await navigate(http('mapped.proxyloom.test', '/chromium-auth-inline'))
    observe({
      expectation:
        'NOT PORTABLE: userinfo in a PAC SOCKS5 directive is vendor-specific. Stock Chromium ' +
        'discards the directive and goes DIRECT even with mandatory PAC; Brave authenticates. ' +
        'The serializer must never emit userinfo; this scenario only records which variant ran.',
      observed: {
        ...inlineResult,
        body: undefined,
        connections: [...auth.connections],
        originReached: httpOrigin.requests.some(
          (request) => request.path === '/chromium-auth-inline',
        ),
        variant: auth.connections.some((connection) => connection.authenticated)
          ? 'AUTHENTICATED_THROUGH_PROXY'
          : auth.connections.length === 0 &&
              httpOrigin.requests.some((request) => request.path === '/chromium-auth-inline')
            ? 'DIRECT_BYPASS'
            : 'FAILED',
      },
      pass: true,
      scenario: 'auth-inline-userinfo',
    })

    // 4. Unreachable SOCKS5 endpoint: fail-closed, no DIRECT even though the host resolves locally.
    await apply(`SOCKS5 127.0.0.1:${closedPort}`)
    const unreachable = await navigate(http('mapped.proxyloom.test', '/chromium-unreachable'))
    observe({
      expectation: 'unreachable SOCKS5 endpoint fails the request without DIRECT fallback',
      observed: {
        ...unreachable,
        body: undefined,
        originReached: httpOrigin.requests.some(
          (request) => request.path === '/chromium-unreachable',
        ),
      },
      pass:
        !unreachable.ok &&
        !httpOrigin.requests.some((request) => request.path === '/chromium-unreachable'),
      scenario: 'unreachable-endpoint',
    })

    const ports = {
      'auth-socks-port': auth.port,
      'closed-port': closedPort,
      'http-origin-port': httpPort,
      'https-origin-port': httpsPort,
      'socks-port': open.port,
    }
    const label = (process.env.PROXYLOOM_BROWSER_LABEL ?? 'chromium')
      .toLowerCase()
      .replace(/\W+/g, '-')
    const path = await writeTrace(`${label}-${version.split('.')[0]}`, {
      api: 'chrome.proxy.settings pac_script (mandatory) + webRequest.onAuthRequired asyncBlocking',
      browser:
        process.env.PROXYLOOM_BROWSER_EXECUTABLE === undefined
          ? 'Chromium (Playwright)'
          : `Chromium-family: ${process.env.PROXYLOOM_BROWSER_LABEL ?? 'custom executable'}`,
      observations: sanitize(observations, ports, SECRETS) as SpikeObservation[],
      version,
    })
    console.info(`Chromium SOCKS5 trace: ${path}`)
    expect(observations.filter((observation) => !observation.pass).map((o) => o.scenario)).toEqual(
      [],
    )
  })
})
