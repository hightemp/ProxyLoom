import { describe, expect, it } from 'vitest'

type Listener = (...args: never[]) => void

const event = () => {
  const listeners = new Set<Listener>()
  return {
    addListener: (listener: Listener) => listeners.add(listener),
    emit: (...args: unknown[]) =>
      [...listeners].forEach((listener) => (listener as (...a: unknown[]) => void)(...args)),
    removeListener: (listener: Listener) => listeners.delete(listener),
  }
}

const checkUrl = 'http://check.example/ip'
const tabId = 7
const onUpdated = event()
const onCompleted = event()
const onErrorOccurred = event()
let committedUrl = 'about:blank'
const injections: { args?: unknown[] }[] = []
let probe: () => Promise<unknown> = () => Promise.resolve(null)

Object.assign(globalThis, {
  chrome: {
    runtime: { id: 'test-extension' },
    scripting: {
      executeScript: (details: { args?: unknown[] }) => {
        injections.push(details)
        if (committedUrl === 'about:blank') {
          return Promise.reject(new Error('Cannot access contents of url "about:blank".'))
        }
        return details.args === undefined
          ? Promise.resolve([{ result: '{"ip":"192.0.2.10","country":"DE"}' }])
          : probe().then((result) => [{ result }])
      },
    },
    tabs: {
      create: () => Promise.resolve({ id: tabId }),
      onUpdated,
      remove: () => Promise.resolve(),
      update: () => {
        // A late `complete` for the initial about:blank document arrives first, then the target
        // response completes, and only afterwards the target document commits and completes.
        queueMicrotask(() => {
          onUpdated.emit(tabId, { status: 'complete' }, { id: tabId, url: 'about:blank' })
          onCompleted.emit({ statusCode: 200, tabId, type: 'main_frame' })
          setTimeout(() => {
            committedUrl = checkUrl
            onUpdated.emit(tabId, { status: 'complete' }, { id: tabId, url: checkUrl })
          }, 5)
        })
        return Promise.resolve({ id: tabId })
      },
    },
    webRequest: { onCompleted, onErrorOccurred },
  },
})

const { TargetedProxyCheckRequest } =
  await import('../../../src/platform/runtime/targeted-proxy-check')
const { config, profile } = await import('../domain/fixtures')

const appliedSnapshots: unknown[] = []
const makeRequest = (checked: ReturnType<typeof profile>) =>
  new TargetedProxyCheckRequest({
    adapter: {
      applyDirect: () => Promise.resolve({ ok: true, value: 1 }),
      applySnapshot: (snapshot: unknown) => {
        appliedSnapshots.push(snapshot)
        return Promise.resolve({ ok: true, value: 1 })
      },
      capabilities: {
        actualProxyInfo: false,
        fullUrlRules: false,
        socks5Auth: false,
        guaranteedErrorPage: false,
        platform: 'CHROMIUM',
        tabSpecificOverrides: false,
      },
      getControlStatus: () => Promise.resolve('CONTROLLED_BY_THIS_EXTENSION'),
    } as never,
    readConfig: () => Promise.resolve(config({ profiles: [checked] })),
    readOverrides: () => Promise.resolve([]),
    restore: () => Promise.resolve(true),
    runExclusive: (operation) => operation(),
    sessionRepository: {
      getTransientState: () => Promise.resolve({ proxyCheckRecoveryRevision: null }),
      setTransientState: () => Promise.resolve(),
    } as never,
    setActiveSnapshot: () => undefined,
  })
const settings = { geoIpEnabled: true, ipGeoProviderEndpoint: checkUrl, proxyCheckTimeoutMs: 2_000 }
const speed = {
  endpoint: 'https://speed.example/__down?bytes=5000000',
  maxBytes: 5_000_000,
  maxMs: 15_000,
}

describe('targeted proxy check with a speed test', () => {
  it('routes the download origin through the profile, marks it internal and returns the sample', async () => {
    committedUrl = 'about:blank'
    injections.length = 0
    appliedSnapshots.length = 0
    const checked = profile('p1', { checkUrl })
    const request = makeRequest(checked)
    let internalDuringProbe = false
    probe = () => {
      internalDuringProbe = request.isInternalUrl('https://speed.example/__down?bytes=5000000')
      return Promise.resolve({ bytes: 2_000_000, durationMs: 400, ok: true })
    }

    const result = await request.lookup(checked, settings, new AbortController().signal, speed)

    expect(result).toMatchObject({
      ok: true,
      value: { externalIp: '192.0.2.10', speed: { bytes: 2_000_000, ok: true } },
    })
    expect(result.ok && typeof result.value.speedPhaseMs).toBe('number')
    expect(injections.at(-1)?.args).toEqual([speed.endpoint, speed.maxBytes, speed.maxMs])
    expect(internalDuringProbe).toBe(true)
    expect(request.isInternalUrl(speed.endpoint)).toBe(false)
    expect(JSON.stringify(appliedSnapshots[0])).toContain('speed\\\\.example')
  })

  it('reports a cancelled download as a timeout sample', async () => {
    committedUrl = 'about:blank'
    const checked = profile('p1', { checkUrl })
    const request = makeRequest(checked)
    const controller = new AbortController()
    probe = () => {
      controller.abort()
      return new Promise(() => undefined)
    }
    const result = await request.lookup(checked, settings, controller.signal, speed)
    expect(result).toMatchObject({ ok: true, value: { speed: { code: 'TIMEOUT', ok: false } } })
  })

  it('does not inject a download for a plain check', async () => {
    committedUrl = 'about:blank'
    injections.length = 0
    const checked = profile('p1', { checkUrl })
    const result = await makeRequest(checked).lookup(
      checked,
      settings,
      new AbortController().signal,
      null,
    )
    expect(result.ok && result.value.speed).toBeUndefined()
    expect(injections.every((entry) => entry.args === undefined)).toBe(true)
  })
})

describe('targeted proxy check', () => {
  it('reads the response only after the target document, not about:blank, completes', async () => {
    const checked = profile('p1', { checkUrl })
    const request = new TargetedProxyCheckRequest({
      adapter: {
        applyDirect: () => Promise.resolve({ ok: true, value: 1 }),
        applySnapshot: () => Promise.resolve({ ok: true, value: 1 }),
        capabilities: {
          actualProxyInfo: false,
          fullUrlRules: false,
          socks5Auth: false,
          guaranteedErrorPage: false,
          platform: 'CHROMIUM',
          tabSpecificOverrides: false,
        },
        getControlStatus: () => Promise.resolve('CONTROLLED_BY_THIS_EXTENSION'),
      },
      readConfig: () => Promise.resolve(config({ profiles: [checked] })),
      readOverrides: () => Promise.resolve([]),
      restore: () => Promise.resolve(true),
      runExclusive: (operation) => operation(),
      sessionRepository: {
        getTransientState: () => Promise.resolve({ proxyCheckRecoveryRevision: null }),
        setTransientState: () => Promise.resolve(),
      } as never,
      setActiveSnapshot: () => undefined,
    })

    const result = await request.lookup(
      checked,
      { geoIpEnabled: true, ipGeoProviderEndpoint: checkUrl, proxyCheckTimeoutMs: 2_000 },
      new AbortController().signal,
      null,
    )

    expect(result).toMatchObject({ ok: true, value: { externalIp: '192.0.2.10' } })
  })
})
