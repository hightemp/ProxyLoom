import { describe, expect, it, vi } from 'vitest'

import { IpGeoProvider, type FetchLike } from '../../../src/application/proxy-check/ip-geo-provider'
import {
  ProxyCheckService,
  type ProxyCheckRequestPort,
} from '../../../src/application/proxy-check/proxy-check-service'
import type { IpGeoResult } from '../../../src/application/proxy-check/ip-geo-provider'
import type { IpGeoProviderError } from '../../../src/application/proxy-check/ip-geo-provider'
import { ok } from '../../../src/domain/types/result'
import type { Result } from '../../../src/domain/types/result'
import { profile } from '../domain/fixtures'

const response = (body: string, status = 200): Response =>
  new Response(body, {
    headers: { 'content-type': 'application/json' },
    status,
  })

describe('IpGeoProvider', () => {
  it('validates a successful IPv4 response without caching it', async () => {
    const fetcher = vi
      .fn<FetchLike>()
      .mockResolvedValue(response(JSON.stringify({ country: 'Finland', ip: '203.0.113.10' })))
    const provider = new IpGeoProvider(fetcher)

    const result = await provider.lookup('https://check.example/result', 500, true)

    expect(result).toEqual({
      ok: true,
      value: {
        country: 'Finland',
        externalIp: '203.0.113.10',
        httpStatus: 200,
      },
    })
    expect(fetcher).toHaveBeenCalledOnce()
    const [calledUrl, calledInit] = fetcher.mock.calls[0]!
    expect(calledUrl).toBe('https://check.example/result')
    expect(calledInit.cache).toBe('no-store')
    expect(calledInit.signal).toBeInstanceOf(AbortSignal)
  })

  it('accepts IPv6 and omits country when GeoIP is disabled', async () => {
    const provider = new IpGeoProvider(
      vi
        .fn<FetchLike>()
        .mockResolvedValue(response(JSON.stringify({ country: 42, ip: '2001:db8::1' }))),
    )

    await expect(provider.lookup('http://localhost/check', 500, false)).resolves.toEqual({
      ok: true,
      value: {
        country: null,
        externalIp: '2001:db8::1',
        httpStatus: 200,
      },
    })
  })

  it.each([
    ['ftp://check.example', 'INVALID_ENDPOINT'],
    ['not a url', 'INVALID_ENDPOINT'],
  ])('rejects endpoint %s', async (endpoint, code) => {
    const result = await new IpGeoProvider(vi.fn<FetchLike>()).lookup(endpoint, 500, true)
    expect(result).toEqual({
      error: { code, httpStatus: null },
      ok: false,
    })
  })

  it.each([
    [response('{}'), 'INVALID_IP', 200],
    [response('{"ip":"999.1.1.1"}'), 'INVALID_IP', 200],
    [response('{"ip":"203.0.113.1","country":""}'), 'INVALID_COUNTRY', 200],
    [response('<html>nope</html>'), 'MALFORMED_RESPONSE', 200],
    [response('failure', 503), 'HTTP_ERROR', 503],
  ])('maps invalid provider responses', async (value, code, httpStatus) => {
    const provider = new IpGeoProvider(vi.fn<FetchLike>().mockResolvedValue(value))
    const result = await provider.lookup('https://check.example', 500, true)
    expect(result).toEqual({
      error: { code, httpStatus },
      ok: false,
    })
  })

  it('rejects responses over 64 KiB', async () => {
    const provider = new IpGeoProvider(
      vi.fn<FetchLike>().mockResolvedValue(response('x'.repeat(64 * 1_024 + 1))),
    )
    const result = await provider.lookup('https://check.example', 500, true)
    expect(result).toEqual({
      error: { code: 'RESPONSE_TOO_LARGE', httpStatus: 200 },
      ok: false,
    })
  })

  it('times out and distinguishes an ordinary network error', async () => {
    const timeoutProvider = new IpGeoProvider(
      vi.fn<FetchLike>().mockImplementation(
        (_input, init) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener(
              'abort',
              () => reject(new DOMException('aborted', 'AbortError')),
              { once: true },
            )
          }),
      ),
    )
    const networkProvider = new IpGeoProvider(
      vi.fn<FetchLike>().mockRejectedValue(new TypeError('offline')),
    )

    await expect(timeoutProvider.lookup('https://check.example', 1, true)).resolves.toEqual({
      error: { code: 'TIMEOUT', httpStatus: null },
      ok: false,
    })
    await expect(networkProvider.lookup('https://check.example', 500, true)).resolves.toEqual({
      error: { code: 'NETWORK_ERROR', httpStatus: null },
      ok: false,
    })
  })
})

describe('ProxyCheckService', () => {
  const settings = {
    geoIpEnabled: true,
    ipGeoProviderEndpoint: 'https://check.example',
    proxyCheckTimeoutMs: 2_000,
  } as const
  const clock = { now: () => new Date('2026-07-26T12:00:00.000Z') }

  it('maps a successful result and releases its mutex', async () => {
    const request: ProxyCheckRequestPort = {
      lookup: vi.fn().mockResolvedValue(
        ok({
          country: 'Japan',
          externalIp: '203.0.113.8',
          httpStatus: 200,
        }),
      ),
    }
    const service = new ProxyCheckService(request, clock)

    const result = await service.check(profile('profile-1'), settings)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toMatchObject({
        availability: true,
        checkedAt: '2026-07-26T12:00:00.000Z',
        connectDurationMs: null,
        country: 'Japan',
        errorCode: null,
        externalIp: '203.0.113.8',
        httpStatus: 200,
      })
      expect(result.value.totalDurationMs).toBeGreaterThanOrEqual(0)
    }
    expect(service.running).toBe(false)
  })

  it('prevents concurrent checks and supports cancellation', async () => {
    let finish: (() => void) | undefined
    const request: ProxyCheckRequestPort = {
      lookup: vi.fn().mockImplementation(
        async (_profile, _settings, signal: AbortSignal) =>
          new Promise<Result<IpGeoResult, IpGeoProviderError>>((resolve) => {
            finish = () =>
              resolve(
                ok({
                  country: null,
                  externalIp: '203.0.113.9',
                  httpStatus: 200,
                }),
              )
            signal.addEventListener('abort', finish, { once: true })
          }),
      ),
    }
    const service = new ProxyCheckService(request, clock)
    const first = service.check(profile('profile-1'), settings)

    await expect(service.check(profile('profile-1'), settings)).resolves.toEqual({
      error: { code: 'CHECK_ALREADY_RUNNING' },
      ok: false,
    })
    service.cancel()
    finish?.()
    await expect(first).resolves.toEqual({
      error: { code: 'CHECK_CANCELLED' },
      ok: false,
    })
    expect(service.running).toBe(false)
  })
})
