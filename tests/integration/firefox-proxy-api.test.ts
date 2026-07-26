import { spawn, type ChildProcess } from 'node:child_process'
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { firefox } from '@playwright/test'
import { afterEach, describe, expect, it } from 'vitest'

import { startHttpProxy, type HttpProxyFixture } from './proxies/http-proxy'
import { startHttpOrigin, type HttpOriginFixture } from './servers/http-origin'

const FIREFOX_BINARY = firefox.executablePath()
const SNAP_GECKODRIVER_BINARY = '/snap/firefox/current/usr/lib/firefox/geckodriver'

interface Closable {
  close(): Promise<void>
}

const started: Closable[] = []
const children: ChildProcess[] = []

const stopProcessGroup = async (child: ChildProcess): Promise<void> => {
  if (child.exitCode !== null || child.pid === undefined) {
    return
  }
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'EACCES') {
      child.kill('SIGTERM')
    } else if (code !== 'ESRCH') {
      throw error
    }
  }
  await new Promise<void>((resolvePromise) => {
    const timeout = setTimeout(() => {
      if (child.pid !== undefined) {
        try {
          process.kill(-child.pid, 'SIGKILL')
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'EACCES') {
            child.kill('SIGKILL')
          }
        }
      }
      resolvePromise()
    }, 3_000)
    child.once('exit', () => {
      clearTimeout(timeout)
      resolvePromise()
    })
  })
}

afterEach(async () => {
  await Promise.all(children.splice(0).map(stopProcessGroup))
  await Promise.all(started.splice(0).map(async (fixture) => fixture.close()))
})

const waitFor = async (predicate: () => boolean, timeoutMs: number): Promise<void> => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) {
      return
    }
    await new Promise((resolvePromise) => {
      setTimeout(resolvePromise, 50)
    })
  }
  throw new Error(
    `Firefox spike did not produce the expected local traffic within ${timeoutMs} ms.`,
  )
}

const extensionManifest = {
  background: { scripts: ['background.js'] },
  browser_specific_settings: {
    gecko: {
      data_collection_permissions: { required: ['none'] },
      id: 'proxyloom-firefox-spike@local.invalid',
      strict_min_version: '140.0',
    },
  },
  host_permissions: ['<all_urls>'],
  manifest_version: 3,
  name: 'ProxyLoom Firefox proxy API spike',
  permissions: ['proxy', 'storage', 'tabs', 'webRequest', 'webRequestBlocking'],
  version: '0.0.1',
}

const backgroundSource = ({
  arrayFailingPort,
  authPort,
  failingPort,
  origin,
  proxyPort,
}: {
  arrayFailingPort: number
  authPort: number
  failingPort: number
  origin: string
  proxyPort: number
}): string => `
const TARGET_ORIGIN = ${JSON.stringify(origin)};
const routes = {
  proxy: { type: 'http', host: '127.0.0.1', port: ${proxyPort} },
  failing: { type: 'http', host: '127.0.0.1', port: ${failingPort} },
  arrayFailing: { type: 'http', host: '127.0.0.1', port: ${arrayFailingPort} },
  auth: { type: 'http', host: '127.0.0.1', port: ${authPort} },
};
const attempts = new Set();

browser.proxy.onRequest.addListener((details) => {
  const path = new URL(details.url).pathname;
  if (
    path === '/firefox-undefined' ||
    path === '/firefox-after-none' ||
    path === '/firefox-after-reload'
  ) return undefined;
  if (path === '/firefox-null') return null;
  if (path === '/firefox-direct') return { type: 'direct' };
  if (path === '/firefox-single-fail-manual') return routes.failing;
  if (path === '/firefox-array') return [routes.arrayFailing, routes.proxy];
  if (path === '/firefox-fail') return routes.failing;
  if (path === '/firefox-auth') return routes.auth;
  return routes.proxy;
}, { urls: ['<all_urls>'] });

browser.webRequest.onAuthRequired.addListener((details) => {
  if (!details.isProxy) return {};
  if (attempts.has(details.requestId)) return { cancel: true };
  attempts.add(details.requestId);
  return { authCredentials: { username: 'firefox-user', password: 'firefox-password' } };
}, { urls: ['<all_urls>'] }, ['blocking']);

browser.webRequest.onCompleted.addListener(
  (details) => attempts.delete(details.requestId),
  { urls: ['<all_urls>'] },
);
browser.webRequest.onErrorOccurred.addListener(
  (details) => attempts.delete(details.requestId),
  { urls: ['<all_urls>'] },
);

const navigate = async (path) => {
  const target = TARGET_ORIGIN + path;
  const tab = await browser.tabs.create({ url: 'about:blank' });
  await new Promise((resolve, reject) => {
    let timeout;
    const cleanup = () => {
      clearTimeout(timeout);
      browser.tabs.onUpdated.removeListener(onUpdated);
    };
    const onUpdated = (tabId, changeInfo, updatedTab) => {
      if (
        tabId === tab.id &&
        changeInfo.status === 'complete' &&
        (updatedTab.url === target || updatedTab.url.startsWith('about:neterror'))
      ) {
        cleanup();
        resolve();
      }
    };
    browser.tabs.onUpdated.addListener(onUpdated);
    timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Navigation timeout: ' + path));
    }, 5_000);
    void browser.tabs.update(tab.id, { url: target }).catch((error) => {
      cleanup();
      reject(error);
    });
  });
};

const run = async () => {
  const { phase = 0 } = await browser.storage.local.get('phase');
  if (phase === 1) {
    const settings = await browser.proxy.settings.get({ incognito: false });
    await navigate('/firefox-after-reload?proxyType=' + settings.value.proxyType);
    await browser.storage.local.remove('phase');
    return;
  }

  const paths = [
    '/firefox-undefined',
    '/firefox-null',
    '/firefox-direct',
    '/firefox-single-fail-manual',
  ];
  for (const path of paths) {
    await navigate(path);
  }
  try {
    await browser.proxy.settings.set({ value: { proxyType: 'none' }, scope: 'regular' });
  } catch (error) {
    await navigate('/settings-error?message=' + encodeURIComponent(String(error)));
    return;
  }
  for (const path of [
    '/firefox-proxy',
    '/firefox-fail',
    '/firefox-array',
    '/firefox-auth',
    '/firefox-after-none',
  ]) await navigate(path);
  await browser.storage.local.set({ phase: 1 });
  browser.runtime.reload();
};
setTimeout(() => void run(), 250);
`

const launchPreparedFirefox = async ({
  directory,
  environment = {},
  extensionDirectories,
  prefs,
}: {
  directory: string
  environment?: Readonly<Record<string, string>>
  extensionDirectories: readonly string[]
  prefs: Readonly<Record<string, boolean | number | string>>
}): Promise<{ child: ChildProcess; output: () => string }> => {
  await access(FIREFOX_BINARY)
  await Promise.all(extensionDirectories.map((extensionDirectory) => access(extensionDirectory)))
  const geckodriverBinary = await access(SNAP_GECKODRIVER_BINARY)
    .then(() => SNAP_GECKODRIVER_BINARY)
    .catch(() => 'geckodriver')
  let output = ''
  const child = spawn(
    geckodriverBinary,
    ['--allow-system-access', '--port', '0', '--profile-root', directory],
    {
      detached: true,
      env: { ...process.env, ...environment },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  child.stdout?.on('data', (chunk: Buffer) => {
    output += chunk.toString('utf8')
  })
  child.stderr?.on('data', (chunk: Buffer) => {
    output += chunk.toString('utf8')
  })
  children.push(child)
  try {
    await waitFor(() => /Listening on 127\.0\.0\.1:\d+/.test(output), 5_000)
    const port = Number(/Listening on 127\.0\.0\.1:(\d+)/.exec(output)?.[1])
    const sessionResponse = await fetch(`http://127.0.0.1:${port}/session`, {
      body: JSON.stringify({
        capabilities: {
          alwaysMatch: {
            browserName: 'firefox',
            webSocketUrl: true,
            'moz:firefoxOptions': {
              args: ['-headless', '-remote-allow-system-access'],
              binary: FIREFOX_BINARY,
              prefs,
            },
          },
        },
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    const sessionPayload = (await sessionResponse.json()) as {
      value?: {
        capabilities?: { webSocketUrl?: string }
        error?: string
        message?: string
      }
    }
    const webSocketUrl = sessionPayload.value?.capabilities?.webSocketUrl
    if (!sessionResponse.ok || !webSocketUrl) {
      throw new Error(`Could not create Firefox BiDi session: ${JSON.stringify(sessionPayload)}`)
    }
    await new Promise<void>((resolvePromise, rejectPromise) => {
      const socket = new WebSocket(webSocketUrl)
      let extensionIndex = 0
      let settled = false
      const complete = (error?: Error) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        socket.close()
        if (error === undefined) resolvePromise()
        else rejectPromise(error)
      }
      const installNext = () => {
        socket.send(
          JSON.stringify({
            id: extensionIndex + 1,
            method: 'webExtension.install',
            params: {
              extensionData: {
                path: extensionDirectories[extensionIndex],
                type: 'path',
              },
              'moz:allowPrivateBrowsing': true,
            },
          }),
        )
      }
      const timeout = setTimeout(() => {
        complete(new Error('Timed out installing the Firefox spikes through WebDriver BiDi.'))
      }, 15_000)
      socket.addEventListener('open', installNext)
      socket.addEventListener('message', (event) => {
        const message = JSON.parse(String(event.data)) as {
          error?: string
          id?: number
          message?: string
          type?: string
        }
        if (message.id !== extensionIndex + 1) return
        if (message.type === 'success') {
          output += `\nInstalled Firefox spike through WebDriver BiDi: ${
            extensionDirectories[extensionIndex]
          }\n`
          extensionIndex += 1
          if (extensionIndex === extensionDirectories.length) complete()
          else installNext()
        } else {
          complete(new Error(`Could not install Firefox spike: ${JSON.stringify(message)}`))
        }
      })
      socket.addEventListener('error', () => {
        complete(new Error('Firefox BiDi connection failed.'))
      })
    })
  } catch (error) {
    await stopProcessGroup(child)
    await rm(directory, { force: true, recursive: true })
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}
geckodriver output:
${output}`,
      { cause: error },
    )
  }
  return { child, output: () => output }
}

const launchFirefoxSpike = async (
  origin: string,
  proxy: HttpProxyFixture,
  failingProxy: HttpProxyFixture,
  arrayFailingProxy: HttpProxyFixture,
  authProxy: HttpProxyFixture,
  manualProxy: HttpProxyFixture,
): Promise<{ child: ChildProcess; directory: string; output: () => string }> => {
  const directory = await mkdtemp(join(process.cwd(), '.proxyloom-firefox-spike-'))
  const extensionDirectory = join(directory, 'extension')
  await mkdir(extensionDirectory)
  await Promise.all([
    writeFile(join(extensionDirectory, 'manifest.json'), JSON.stringify(extensionManifest)),
    writeFile(
      join(extensionDirectory, 'background.js'),
      backgroundSource({
        arrayFailingPort: arrayFailingProxy.port,
        authPort: authProxy.port,
        failingPort: failingProxy.port,
        origin,
        proxyPort: proxy.port,
      }),
    ),
  ])
  try {
    const launched = await launchPreparedFirefox({
      directory,
      extensionDirectories: [extensionDirectory],
      prefs: {
        'dom.security.https_first': false,
        'dom.security.https_first_schemeless': false,
        'dom.security.https_only_mode': false,
        'dom.security.https_only_mode_pbm': false,
        'network.dns.localDomains': 'origin.proxyloom.test',
        'network.proxy.http': '127.0.0.1',
        'network.proxy.http_port': manualProxy.port,
        'network.proxy.no_proxies_on': '',
        'network.proxy.type': 1,
      },
    })
    return { ...launched, directory }
  } catch (error) {
    await rm(directory, { force: true, recursive: true })
    throw error
  }
}

const controlManifest = (id: string, name: string) => ({
  background: { scripts: ['background.js'] },
  browser_specific_settings: {
    gecko: {
      data_collection_permissions: { required: ['none'] },
      id,
      strict_min_version: '140.0',
    },
  },
  host_permissions: ['<all_urls>'],
  manifest_version: 3,
  name,
  permissions: ['proxy', 'tabs'],
  version: '0.0.1',
})

const subjectControlSource = (origin: string): string => `
const TARGET_ORIGIN = ${JSON.stringify(origin)};
let sawConflict = false;
let retried = false;
let events = Promise.resolve();

const getSettings = () => browser.proxy.settings.get({ incognito: false });
const report = async (label) => {
  const settings = await getSettings();
  const query = new URLSearchParams({
    level: settings.levelOfControl,
    proxyType: settings.value.proxyType,
  });
  await browser.tabs.create({ url: TARGET_ORIGIN + '/' + label + '?' + query });
};

const handleChange = async () => {
  const settings = await getSettings();
  if (settings.levelOfControl === 'controlled_by_other_extensions') {
    sawConflict = true;
    await report('firefox-control-lost');
    return;
  }
  if (
    sawConflict &&
    !retried &&
    settings.levelOfControl === 'controlled_by_this_extension'
  ) {
    retried = true;
    await report('firefox-control-restored');
    const changed = await browser.proxy.settings.set({
      scope: 'regular',
      value: { proxyType: 'none' },
    });
    await report(changed ? 'firefox-control-retry' : 'firefox-control-retry-failed');
  }
};

browser.proxy.settings.onChange.addListener(() => {
  events = events.then(handleChange);
});

void (async () => {
  await browser.proxy.settings.set({
    scope: 'regular',
    value: { proxyType: 'none' },
  });
  await report('firefox-subject-owned');
})();
`

const controllerControlSource = (origin: string, proxyPort: number): string => `
const TARGET_ORIGIN = ${JSON.stringify(origin)};
const wait = (delay) => new Promise((resolve) => setTimeout(resolve, delay));
const report = async (label) => {
  const settings = await browser.proxy.settings.get({ incognito: false });
  const query = new URLSearchParams({
    level: settings.levelOfControl,
    proxyType: settings.value.proxyType,
  });
  await browser.tabs.create({ url: TARGET_ORIGIN + '/' + label + '?' + query });
};

setTimeout(() => void (async () => {
  await browser.proxy.settings.set({
    scope: 'regular',
    value: {
      proxyType: 'manual',
      http: 'http://127.0.0.1:${proxyPort}',
      passthrough: '',
    },
  });
  await report('firefox-controller-owned');
  await wait(600);
  await report('firefox-controller-still-owned');
  await wait(400);
  await browser.proxy.settings.clear({ scope: 'regular' });
})(), 750);
`

const policyControlSource = (origin: string): string => `
const TARGET_ORIGIN = ${JSON.stringify(origin)};

void (async () => {
  const before = await browser.proxy.settings.get({ incognito: false });
  let setResult;
  try {
    setResult = String(await browser.proxy.settings.set({
      scope: 'regular',
      value: { proxyType: 'none' },
    }));
  } catch {
    setResult = 'rejected';
  }
  const after = await browser.proxy.settings.get({ incognito: false });
  const query = new URLSearchParams({
    afterLevel: after.levelOfControl,
    afterProxyType: after.value.proxyType,
    beforeLevel: before.levelOfControl,
    beforeProxyType: before.value.proxyType,
    setResult,
  });
  await browser.tabs.create({ url: TARGET_ORIGIN + '/firefox-policy-lock?' + query });
})();
`

const baseFirefoxPrefs = {
  'dom.security.https_first': false,
  'dom.security.https_first_schemeless': false,
  'dom.security.https_only_mode': false,
  'dom.security.https_only_mode_pbm': false,
  'network.dns.localDomains': 'origin.proxyloom.test',
} as const

const writeControlExtension = async (
  directory: string,
  manifest: ReturnType<typeof controlManifest>,
  source: string,
): Promise<void> => {
  await mkdir(directory)
  await Promise.all([
    writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest)),
    writeFile(join(directory, 'background.js'), source),
  ])
}

const launchFirefoxControlConflictSpike = async (
  origin: string,
  proxyPort: number,
): Promise<{ child: ChildProcess; directory: string; output: () => string }> => {
  const directory = await mkdtemp(join(process.cwd(), '.proxyloom-firefox-control-'))
  const subjectDirectory = join(directory, 'subject')
  const controllerDirectory = join(directory, 'controller')
  await Promise.all([
    writeControlExtension(
      subjectDirectory,
      controlManifest(
        'proxyloom-firefox-control-subject@local.invalid',
        'ProxyLoom Firefox control subject',
      ),
      subjectControlSource(origin),
    ),
    writeControlExtension(
      controllerDirectory,
      controlManifest(
        'proxyloom-firefox-control-controller@local.invalid',
        'ProxyLoom Firefox control controller',
      ),
      controllerControlSource(origin, proxyPort),
    ),
  ])
  try {
    const launched = await launchPreparedFirefox({
      directory,
      extensionDirectories: [subjectDirectory, controllerDirectory],
      prefs: baseFirefoxPrefs,
    })
    return { ...launched, directory }
  } catch (error) {
    await rm(directory, { force: true, recursive: true })
    throw error
  }
}

const launchFirefoxPolicySpike = async (
  origin: string,
  proxyPort: number,
): Promise<{ child: ChildProcess; directory: string; output: () => string }> => {
  const directory = await mkdtemp(join(process.cwd(), '.proxyloom-firefox-policy-'))
  const extensionDirectory = join(directory, 'extension')
  const policyPath = join(directory, 'policies.json')
  await Promise.all([
    writeControlExtension(
      extensionDirectory,
      controlManifest(
        'proxyloom-firefox-policy-subject@local.invalid',
        'ProxyLoom Firefox policy subject',
      ),
      policyControlSource(origin),
    ),
    writeFile(
      policyPath,
      JSON.stringify({
        policies: {
          Proxy: {
            HTTPProxy: `127.0.0.1:${proxyPort}`,
            Locked: true,
            Mode: 'manual',
            Passthrough: '',
          },
        },
      }),
    ),
  ])
  try {
    const launched = await launchPreparedFirefox({
      directory,
      environment: { PLAYWRIGHT_FIREFOX_POLICIES_JSON: policyPath },
      extensionDirectories: [extensionDirectory],
      prefs: baseFirefoxPrefs,
    })
    return { ...launched, directory }
  } catch (error) {
    await rm(directory, { force: true, recursive: true })
    throw error
  }
}

describe('Firefox 153 proxy API spike', () => {
  it('proves manual fallback, terminal null, arrays, controlled fail-closed, auth, and reload', async () => {
    const origin: HttpOriginFixture = await startHttpOrigin()
    const proxy = await startHttpProxy({ marker: 'firefox-proxy' })
    const failingProxy = await startHttpProxy({ failureMode: 'DROP', marker: 'firefox-fail' })
    const arrayFailingProxy = await startHttpProxy({
      failureMode: 'DROP',
      marker: 'firefox-array-fail',
    })
    const authProxy = await startHttpProxy({
      marker: 'firefox-auth',
      password: 'firefox-password',
      username: 'firefox-user',
    })
    const manualProxy = await startHttpProxy({ marker: 'firefox-manual' })
    started.push(origin, proxy, failingProxy, arrayFailingProxy, authProxy, manualProxy)
    const targetOrigin = origin.origin.replace('127.0.0.1', 'origin.proxyloom.test')
    const launched = await launchFirefoxSpike(
      targetOrigin,
      proxy,
      failingProxy,
      arrayFailingProxy,
      authProxy,
      manualProxy,
    )
    try {
      try {
        await waitFor(
          () =>
            proxy.requests.some((request) =>
              request.target.startsWith(`${targetOrigin}/firefox-proxy`),
            ) &&
            proxy.requests.some((request) =>
              request.target.startsWith(`${targetOrigin}/firefox-array`),
            ) &&
            failingProxy.requests.some((request) =>
              request.target.startsWith(`${targetOrigin}/firefox-fail`),
            ) &&
            authProxy.requests.some(
              (request) =>
                request.target.startsWith(`${targetOrigin}/firefox-auth`) && request.authenticated,
            ) &&
            origin.requests.some((request) =>
              request.path.startsWith('/firefox-after-reload?proxyType=none'),
            ),
          20_000,
        )
      } catch (error) {
        throw new Error(
          `${error instanceof Error ? error.message : String(error)}
geckodriver/BiDi output:
${launched.output()}
reachable proxy requests: ${JSON.stringify(proxy.requests)}
failing proxy requests: ${JSON.stringify(failingProxy.requests)}
array failing proxy requests: ${JSON.stringify(arrayFailingProxy.requests)}
auth proxy requests: ${JSON.stringify(authProxy.requests)}
manual proxy requests: ${JSON.stringify(manualProxy.requests)}
origin requests: ${JSON.stringify(origin.requests)}`,
          { cause: error },
        )
      }

      expect(launched.output()).toContain('Installed Firefox spike through WebDriver BiDi')
      expect(
        origin.requests.some(
          (request) =>
            request.path === '/firefox-proxy' &&
            request.headers['x-proxyloom-test-proxy'] === 'firefox-proxy',
        ),
      ).toBe(true)
      expect(origin.requests.some((request) => request.path === '/firefox-fail')).toBe(false)
      expect(
        manualProxy.requests
          .filter((request) =>
            ['/firefox-undefined', '/firefox-direct'].some((path) =>
              request.target.startsWith(`${targetOrigin}${path}`),
            ),
          )
          .map((request) => new URL(request.target).pathname),
      ).toEqual(['/firefox-undefined', '/firefox-direct'])
      expect(
        failingProxy.requests.some((request) =>
          request.target.startsWith(`${targetOrigin}/firefox-single-fail-manual`),
        ),
      ).toBe(true)
      expect(
        manualProxy.requests.some((request) =>
          request.target.startsWith(`${targetOrigin}/firefox-single-fail-manual`),
        ),
      ).toBe(true)
      expect(
        manualProxy.requests.some((request) =>
          request.target.startsWith(`${targetOrigin}/firefox-null`),
        ),
      ).toBe(false)
      expect(
        origin.requests.some(
          (request) =>
            request.path === '/firefox-null' &&
            request.headers['x-proxyloom-test-proxy'] === undefined,
        ),
      ).toBe(true)
      expect(
        origin.requests.some(
          (request) =>
            request.path === '/firefox-array' &&
            request.headers['x-proxyloom-test-proxy'] === 'firefox-proxy',
        ),
      ).toBe(true)
      expect(
        arrayFailingProxy.requests.some((request) =>
          request.target.startsWith(`${targetOrigin}/firefox-array`),
        ),
      ).toBe(true)
      expect(
        origin.requests.some(
          (request) =>
            request.path === '/firefox-after-none' &&
            request.headers['x-proxyloom-test-proxy'] === undefined,
        ),
      ).toBe(true)
      expect(
        origin.requests.some(
          (request) =>
            request.path === '/firefox-after-reload?proxyType=none' &&
            request.headers['x-proxyloom-test-proxy'] === undefined,
        ),
      ).toBe(true)
      expect(
        authProxy.requests
          .filter((request) => request.target.startsWith(`${targetOrigin}/firefox-auth`))
          .map((request) => request.authenticated),
      ).toEqual([false, true])
      expect(JSON.stringify(authProxy.requests)).not.toContain('firefox-password')
    } finally {
      await stopProcessGroup(launched.child)
      await rm(launched.directory, { force: true, recursive: true })
    }
  }, 30_000)

  it('observes a higher-precedence proxy extension without fighting and recovers after clear', async () => {
    const origin: HttpOriginFixture = await startHttpOrigin()
    const controllerProxy = await startHttpProxy({ marker: 'firefox-controller' })
    started.push(origin, controllerProxy)
    const targetOrigin = origin.origin.replace('127.0.0.1', 'origin.proxyloom.test')
    const launched = await launchFirefoxControlConflictSpike(targetOrigin, controllerProxy.port)
    const request = (label: string) =>
      origin.requests.find((candidate) => candidate.path.startsWith(`/${label}?`))

    try {
      try {
        await waitFor(
          () =>
            request('firefox-subject-owned') !== undefined &&
            request('firefox-control-lost') !== undefined &&
            request('firefox-controller-owned') !== undefined &&
            request('firefox-controller-still-owned') !== undefined &&
            request('firefox-control-restored') !== undefined &&
            request('firefox-control-retry') !== undefined,
          15_000,
        )
      } catch (error) {
        throw new Error(
          `${error instanceof Error ? error.message : String(error)}
geckodriver/BiDi output:
${launched.output()}
controller proxy requests: ${JSON.stringify(controllerProxy.requests)}
origin requests: ${JSON.stringify(origin.requests)}`,
          { cause: error },
        )
      }

      const params = (label: string) =>
        new URL(request(label)?.path ?? '/', targetOrigin).searchParams
      expect(params('firefox-subject-owned').get('level')).toBe('controlled_by_this_extension')
      expect(params('firefox-control-lost').get('level')).toBe('controlled_by_other_extensions')
      expect(params('firefox-control-lost').get('proxyType')).toBe('manual')
      expect(params('firefox-controller-owned').get('level')).toBe('controlled_by_this_extension')
      expect(params('firefox-controller-still-owned').get('level')).toBe(
        'controlled_by_this_extension',
      )
      expect(params('firefox-controller-still-owned').get('proxyType')).toBe('manual')
      expect(params('firefox-control-restored').get('level')).toBe('controlled_by_this_extension')
      expect(params('firefox-control-retry').get('proxyType')).toBe('none')
      expect(request('firefox-control-lost')?.headers['x-proxyloom-test-proxy']).toBe(
        'firefox-controller',
      )
      expect(request('firefox-controller-still-owned')?.headers['x-proxyloom-test-proxy']).toBe(
        'firefox-controller',
      )
      expect(request('firefox-control-restored')?.headers['x-proxyloom-test-proxy']).toBe(undefined)
      expect(
        origin.requests.some((candidate) =>
          candidate.path.startsWith('/firefox-control-retry-failed?'),
        ),
      ).toBe(false)

      const observedPaths = origin.requests.map((candidate) => candidate.path)
      const indexOf = (label: string) =>
        observedPaths.findIndex((path) => path.startsWith(`/${label}?`))
      expect(indexOf('firefox-subject-owned')).toBeLessThan(indexOf('firefox-controller-owned'))
      expect(indexOf('firefox-controller-still-owned')).toBeLessThan(
        indexOf('firefox-control-restored'),
      )
      expect(indexOf('firefox-control-restored')).toBeLessThan(indexOf('firefox-control-retry'))
    } finally {
      await stopProcessGroup(launched.child)
      await rm(launched.directory, { force: true, recursive: true })
    }
  }, 30_000)

  it('maps a locked Firefox enterprise Proxy policy to not_controllable', async () => {
    const origin: HttpOriginFixture = await startHttpOrigin()
    const policyProxy = await startHttpProxy({ marker: 'firefox-policy' })
    started.push(origin, policyProxy)
    const targetOrigin = origin.origin.replace('127.0.0.1', 'origin.proxyloom.test')
    const launched = await launchFirefoxPolicySpike(targetOrigin, policyProxy.port)

    try {
      try {
        await waitFor(
          () => origin.requests.some((request) => request.path.startsWith('/firefox-policy-lock?')),
          10_000,
        )
      } catch (error) {
        throw new Error(
          `${error instanceof Error ? error.message : String(error)}
geckodriver/BiDi output:
${launched.output()}
policy proxy requests: ${JSON.stringify(policyProxy.requests)}
origin requests: ${JSON.stringify(origin.requests)}`,
          { cause: error },
        )
      }

      const policyRequest = origin.requests.find((request) =>
        request.path.startsWith('/firefox-policy-lock?'),
      )
      const params = new URL(policyRequest?.path ?? '/', targetOrigin).searchParams
      expect(params.get('beforeLevel')).toBe('not_controllable')
      expect(params.get('beforeProxyType')).toBe('manual')
      expect(params.get('afterLevel')).toBe('not_controllable')
      expect(params.get('afterProxyType')).toBe('manual')
      expect(params.get('setResult')).toBe('rejected')
      expect(policyRequest?.headers['x-proxyloom-test-proxy']).toBe('firefox-policy')
    } finally {
      await stopProcessGroup(launched.child)
      await rm(launched.directory, { force: true, recursive: true })
    }
  }, 30_000)
})
