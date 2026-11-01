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

Object.assign(globalThis, {
  chrome: {
    runtime: { id: 'test-extension' },
    scripting: {
      executeScript: () =>
        committedUrl === 'about:blank'
          ? Promise.reject(new Error('Cannot access contents of url "about:blank".'))
          : Promise.resolve([{ result: '{"ip":"192.0.2.10","country":"DE"}' }]),
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
    )

    expect(result).toMatchObject({ ok: true, value: { externalIp: '192.0.2.10' } })
  })
})
