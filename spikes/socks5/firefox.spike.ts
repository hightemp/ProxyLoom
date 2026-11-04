// PL-144 Firefox SOCKS5 spike. Prototype only; nothing here is imported by production code.
// A minimal MV3 extension answers proxy.onRequest with `type: 'socks'` ProxyInfo objects, drives
// tabs/downloads/private windows itself and posts a report to a local collector.
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer as createHttpServer, type Server } from 'node:http'
import { createServer, type AddressInfo } from 'node:net'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

import { startSocks5Proxy } from '../../tests/integration/proxies/socks5-proxy'
import { startHttpOrigin } from '../../tests/integration/servers/http-origin'
import { startHttpsOrigin } from '../../tests/integration/servers/https-origin'
import {
  launchPreparedFirefox,
  stopAllFirefox,
  waitFor,
} from '../../tests/integration/support/firefox-bidi'
import { sanitize, writeTrace, type SpikeObservation } from './trace'

const USER = 'spike-socks-user'
const PASSWORD = 'spike-socks-password'
const SECRETS = [USER, PASSWORD]

const manifest = {
  background: { scripts: ['background.js'] },
  browser_specific_settings: {
    gecko: {
      data_collection_permissions: { required: ['none'] },
      id: 'proxyloom-socks5-spike@local.invalid',
      strict_min_version: '140.0',
    },
  },
  host_permissions: ['<all_urls>'],
  incognito: 'spanning',
  manifest_version: 3,
  name: 'ProxyLoom SOCKS5 Firefox spike',
  permissions: ['downloads', 'proxy', 'scripting', 'tabs', 'webRequest'],
  version: '0.0.1',
}

interface Ports {
  readonly auth: number
  readonly closed: number
  readonly http: number
  readonly https: number
  readonly open: number
  readonly report: number
}

const backgroundSource = (ports: Ports): string => `
const ports = ${JSON.stringify(ports)};
const socks = (port, extra = {}) => ({ type: 'socks', host: '127.0.0.1', port, proxyDNS: true, ...extra });
const routeFor = (path) => {
  if (path.startsWith('/ff-nodns')) return socks(ports.open, { proxyDNS: false });
  if (path.startsWith('/ff-auth-ok')) return socks(ports.auth, { username: ${JSON.stringify(USER)}, password: ${JSON.stringify(PASSWORD)} });
  if (path.startsWith('/ff-auth-wrong')) return socks(ports.auth, { username: ${JSON.stringify(USER)}, password: 'wrong-password' });
  if (path.startsWith('/ff-auth-missing')) return socks(ports.auth);
  if (path.startsWith('/ff-unreachable')) return socks(ports.closed);
  return socks(ports.open);
};
const incognitoSeen = [];
browser.proxy.onRequest.addListener((details) => {
  const url = new URL(details.url);
  if (url.port === String(ports.report)) return { type: 'direct' };
  if (!url.hostname.endsWith('proxyloom.test')) return { type: 'direct' };
  if (url.pathname.startsWith('/ff-private')) incognitoSeen.push(details.incognito);
  return routeFor(url.pathname);
}, { urls: ['<all_urls>'] });

const errors = {};
browser.webRequest.onErrorOccurred.addListener(
  (details) => { errors[new URL(details.url).pathname] = details.error; },
  { urls: ['<all_urls>'] },
);

const waitTab = (tabId, target) => new Promise((resolve) => {
  const timer = setTimeout(() => { cleanup(); resolve({ state: 'timeout' }); }, 8000);
  const cleanup = () => { clearTimeout(timer); browser.tabs.onUpdated.removeListener(listener); };
  const listener = (id, change, tab) => {
    if (id !== tabId || change.status !== 'complete') return;
    if (tab.url === target || tab.url.startsWith('about:neterror') || tab.url.startsWith('about:certerror')) {
      cleanup();
      resolve({ state: tab.url === target ? 'loaded' : 'error-page' });
    }
  };
  browser.tabs.onUpdated.addListener(listener);
});

const navigate = async (target, windowId) => {
  const tab = await browser.tabs.create({ url: 'about:blank', ...(windowId ? { windowId } : {}) });
  const done = waitTab(tab.id, target);
  await browser.tabs.update(tab.id, { url: target });
  const result = await done;
  return { tab, result: { ...result, error: errors[new URL(target).pathname] ?? null } };
};

const websocketIn = async (tabId, url) => {
  const [injected] = await browser.scripting.executeScript({
    target: { tabId },
    args: [url],
    func: (target) => new Promise((resolve) => {
      const socket = new WebSocket(target);
      const timer = setTimeout(() => resolve('timeout'), 5000);
      socket.onmessage = (event) => { clearTimeout(timer); resolve(String(event.data)); socket.close(); };
      socket.onerror = () => { clearTimeout(timer); resolve('error'); };
    }),
  });
  return injected?.result ?? 'no-result';
};

const download = (url) => new Promise((resolve) => {
  let id;
  const timer = setTimeout(() => resolve('timeout'), 8000);
  const listener = (delta) => {
    if (delta.id !== id || !delta.state) return;
    if (delta.state.current === 'complete' || delta.state.current === 'interrupted') {
      clearTimeout(timer);
      browser.downloads.onChanged.removeListener(listener);
      resolve(delta.state.current);
    }
  };
  browser.downloads.onChanged.addListener(listener);
  browser.downloads.download({ url, saveAs: false }).then((value) => { id = value; }, (error) => resolve(String(error)));
});

const report = async (step, data) => {
  await fetch('http://127.0.0.1:' + ports.report + '/report', {
    method: 'POST',
    body: JSON.stringify({ step, data }),
  });
};

const http = (host, path) => 'http://' + host + ':' + ports.http + path;
const https = (host, path) => 'https://' + host + ':' + ports.https + path;

const run = async () => {
  const info = await browser.runtime.getBrowserInfo();
  await browser.proxy.settings.set({ value: { proxyType: 'none' } });
  await report('start', { version: info.version, isAllowedIncognito: await browser.extension.isAllowedIncognitoAccess() });

  const steps = [
    ['http', http('remote.proxyloom.test', '/ff-http')],
    ['nodns', http('mapped.proxyloom.test', '/ff-nodns')],
    ['https', https('remote.proxyloom.test', '/ff-https')],
    ['auth-ok', http('authok.proxyloom.test', '/ff-auth-ok')],
    ['auth-wrong', http('mapped.proxyloom.test', '/ff-auth-wrong')],
    ['auth-missing', http('mapped.proxyloom.test', '/ff-auth-missing')],
    ['unreachable', http('mapped.proxyloom.test', '/ff-unreachable')],
  ];
  for (const [step, url] of steps) {
    const { result } = await navigate(url);
    await report(step, result);
  }

  const wsPage = await navigate(http('ws.proxyloom.test', '/ff-ws-page'));
  await report('ws', { message: await websocketIn(wsPage.tab.id, 'ws://ws.proxyloom.test:' + ports.http + '/ff-ws') });
  const wssPage = await navigate(https('wss.proxyloom.test', '/ff-wss-page'));
  await report('wss', { message: await websocketIn(wssPage.tab.id, 'wss://wss.proxyloom.test:' + ports.https + '/ff-wss') });
  await report('download', { state: await download(http('download.proxyloom.test', '/download')) });

  try {
    const privateWindow = await browser.windows.create({ incognito: true, url: 'about:blank' });
    const { result } = await navigate(http('private.proxyloom.test', '/ff-private'), privateWindow.id);
    await report('private', { ...result, incognitoSeen });
  } catch (error) {
    await report('private', { state: 'not-available', error: String(error) });
  }
  await report('done', {});
};
setTimeout(() => void run().catch((error) => report('crash', { error: String(error) })), 300);
`

const freePort = async (): Promise<number> => {
  const server = createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  await new Promise((resolve) => server.close(resolve))
  return port
}

describe('Firefox MV3 proxy.onRequest SOCKS5 (PL-144)', () => {
  const closables: { close(): Promise<void> }[] = []
  let directory = ''

  afterAll(async () => {
    await stopAllFirefox()
    await Promise.all(closables.map(async (fixture) => fixture.close()))
    if (directory.length > 0) await rm(directory, { force: true, recursive: true })
  })

  it('records routing, DNS, auth, private window and fail-closed behavior', async () => {
    const httpOrigin = await startHttpOrigin()
    const httpsOrigin = await startHttpsOrigin()
    const open = await startSocks5Proxy()
    const auth = await startSocks5Proxy({ password: PASSWORD, username: USER })
    closables.push(httpOrigin, httpsOrigin, open, auth)
    const reports = new Map<string, unknown>()
    const collector: Server = createHttpServer((request, response) => {
      let body = ''
      request.on('data', (chunk: Buffer) => (body += chunk.toString('utf8')))
      request.on('end', () => {
        const parsed = JSON.parse(body) as { step: string; data: unknown }
        reports.set(parsed.step, parsed.data)
        response.writeHead(204, { 'access-control-allow-origin': '*' })
        response.end()
      })
    })
    await new Promise<void>((resolve) => collector.listen(0, '127.0.0.1', resolve))
    closables.push({ close: () => new Promise((resolve) => collector.close(() => resolve())) })
    const ports: Ports = {
      auth: auth.port,
      closed: await freePort(),
      http: Number(new URL(httpOrigin.origin).port),
      https: Number(new URL(httpsOrigin.origin).port),
      open: open.port,
      report: (collector.address() as AddressInfo).port,
    }

    directory = await mkdtemp(join(process.cwd(), '.proxyloom-socks5-firefox-'))
    const extensionDirectory = join(directory, 'extension')
    await mkdir(extensionDirectory)
    await writeFile(join(extensionDirectory, 'manifest.json'), JSON.stringify(manifest))
    await writeFile(join(extensionDirectory, 'background.js'), backgroundSource(ports))
    const launched = await launchPreparedFirefox({
      acceptInsecureCerts: true,
      directory,
      extensionDirectories: [extensionDirectory],
      prefs: {
        'browser.download.dir': directory,
        'browser.download.folderList': 2,
        'browser.download.useDownloadDir': true,
        'dom.security.https_first': false,
        'dom.security.https_first_schemeless': false,
        'dom.security.https_only_mode': false,
        'dom.security.https_only_mode_pbm': false,
        // Only `mapped.proxyloom.test` resolves locally; the rest only through proxy-side DNS.
        'network.dns.localDomains': 'mapped.proxyloom.test',
        'network.proxy.type': 0,
      },
    })
    try {
      await waitFor(() => reports.has('done') || reports.has('crash'), 90_000)
    } catch (error) {
      throw new Error(
        `${String(error)}\nreports: ${JSON.stringify([...reports])}\n${launched.output()}`,
        {
          cause: error,
        },
      )
    }
    expect(reports.get('crash')).toBeUndefined()

    const connectionsTo = (fixture: typeof open, host: string) =>
      fixture.connections.filter((connection) => connection.target?.startsWith(`${host}:`))
    const originHas = (path: string) =>
      httpOrigin.requests.some((request) => request.path === path) ||
      httpsOrigin.requests.some((request) => request.path === path)
    const state = (step: string) => (reports.get(step) as { state?: string } | undefined)?.state
    // Firefox keeps the target URL in the tab while showing a network error page, so failure is
    // judged by the webRequest error code, not by the tab URL.
    const failed = (step: string) =>
      typeof (reports.get(step) as { error?: unknown } | undefined)?.error === 'string'
    const message = (step: string) =>
      (reports.get(step) as { message?: string } | undefined)?.message
    const observations: SpikeObservation[] = []
    const observe = (scenario: string, expectation: string, observed: unknown, pass: boolean) => {
      observations.push({ expectation, observed, pass, scenario })
    }
    const unauthenticatedHostsOk = (host: string) =>
      connectionsTo(open, host).some(
        (connection) => connection.addressType === 'DOMAIN' && connection.outcome === 'TUNNELED',
      )

    observe(
      'http-proxy-dns',
      'HTTP target goes through SOCKS5 with proxyDNS: host sent as DOMAIN',
      { report: reports.get('http'), connections: connectionsTo(open, 'remote.proxyloom.test') },
      state('http') === 'loaded' &&
        originHas('/ff-http') &&
        unauthenticatedHostsOk('remote.proxyloom.test'),
    )
    const localDns = open.connections.filter((connection) => connection.addressType === 'IPV4')
    observe(
      'dns-proxydns-false',
      'proxyDNS: false resolves locally and sends ATYP IPV4',
      { report: reports.get('nodns'), ipv4Connections: localDns },
      state('nodns') === 'loaded' && originHas('/ff-nodns') && localDns.length > 0,
    )
    observe(
      'https-proxy-dns',
      'HTTPS target tunnels through SOCKS5',
      { report: reports.get('https'), connections: connectionsTo(open, 'remote.proxyloom.test') },
      state('https') === 'loaded' && originHas('/ff-https'),
    )
    const authOk = connectionsTo(auth, 'authok.proxyloom.test')
    observe(
      'auth-ok',
      'ProxyInfo username/password authenticates with RFC 1929 without onAuthRequired',
      { report: reports.get('auth-ok'), connections: authOk },
      state('auth-ok') === 'loaded' &&
        originHas('/ff-auth-ok') &&
        authOk.some((connection) => connection.authenticated && connection.outcome === 'TUNNELED'),
    )
    observe(
      'auth-wrong',
      'wrong password fails the request with no DIRECT fallback',
      {
        report: reports.get('auth-wrong'),
        rejectedHandshakes: auth.connections
          .filter((connection) => connection.outcome === 'REJECTED')
          .map((connection) => connection.authMethod),
        originReached: originHas('/ff-auth-wrong'),
      },
      failed('auth-wrong') && !originHas('/ff-auth-wrong'),
    )
    observe(
      'auth-missing',
      'missing credentials for an auth-only SOCKS5 server fail with no DIRECT fallback',
      { report: reports.get('auth-missing'), originReached: originHas('/ff-auth-missing') },
      failed('auth-missing') && !originHas('/ff-auth-missing'),
    )
    observe(
      'unreachable-endpoint',
      'unreachable SOCKS5 endpoint fails with no DIRECT fallback (proxyType none)',
      { report: reports.get('unreachable'), originReached: originHas('/ff-unreachable') },
      failed('unreachable') && !originHas('/ff-unreachable'),
    )
    observe(
      'ws',
      'WS upgrade travels through SOCKS5',
      { report: reports.get('ws'), connections: connectionsTo(open, 'ws.proxyloom.test') },
      message('ws') === 'origin-websocket' && unauthenticatedHostsOk('ws.proxyloom.test'),
    )
    observe(
      'wss',
      'WSS upgrade travels through SOCKS5',
      { report: reports.get('wss'), connections: connectionsTo(open, 'wss.proxyloom.test') },
      message('wss') === 'secure-origin-websocket' && unauthenticatedHostsOk('wss.proxyloom.test'),
    )
    observe(
      'download',
      'downloads.download goes through SOCKS5',
      {
        report: reports.get('download'),
        connections: connectionsTo(open, 'download.proxyloom.test'),
      },
      state('download') === 'complete' && unauthenticatedHostsOk('download.proxyloom.test'),
    )
    const privateReport = reports.get('private') as { incognitoSeen?: boolean[] } | undefined
    observe(
      'private-window',
      'private-window request reaches proxy.onRequest with incognito: true and goes through SOCKS5',
      { report: privateReport, connections: connectionsTo(open, 'private.proxyloom.test') },
      state('private') === 'loaded' &&
        (privateReport?.incognitoSeen ?? []).includes(true) &&
        unauthenticatedHostsOk('private.proxyloom.test'),
    )

    const start = reports.get('start') as { version: string }
    const path = await writeTrace(`firefox-${start.version.split('.')[0]}`, {
      api: "proxy.onRequest ProxyInfo { type: 'socks', proxyDNS, username, password }",
      browser: 'Firefox (Playwright build, WebDriver BiDi temporary install)',
      observations: sanitize(
        observations,
        {
          'auth-socks-port': ports.auth,
          'closed-port': ports.closed,
          'http-origin-port': ports.http,
          'https-origin-port': ports.https,
          'socks-port': ports.open,
        },
        SECRETS,
      ) as SpikeObservation[],
      version: start.version,
    })
    console.info(`Firefox SOCKS5 trace: ${path}`)
    expect(observations.filter((observation) => !observation.pass).map((o) => o.scenario)).toEqual(
      [],
    )
  })
})
