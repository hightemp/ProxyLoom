import { describe, expect, it, vi } from 'vitest'

import { ProxyCheckService } from '../../../src/application/proxy-check/proxy-check-service'
import { downloadMbps } from '../../../src/application/proxy-check/speed'
import {
  DEFAULT_SPEED_TEST_ENDPOINT,
  SPEED_TEST_MAX_BYTES,
  SPEED_TEST_MAX_MS,
} from '../../../src/config/defaults'
import { ok } from '../../../src/domain/types/result'
import { profile } from '../domain/fixtures'

const settings = {
  geoIpEnabled: true,
  ipGeoProviderEndpoint: 'https://check.example',
  proxyCheckTimeoutMs: 2_000,
  speedTestEndpoint: DEFAULT_SPEED_TEST_ENDPOINT,
} as const
const clock = { now: () => new Date('2026-11-01T12:00:00.000Z') }
const lookupResult = { country: 'DE', externalIp: '203.0.113.8', httpStatus: 200 }

describe('download throughput', () => {
  it('converts bytes and milliseconds to megabits per second with one decimal', () => {
    expect(downloadMbps(5_000_000, 1_000)).toBe(40)
    expect(downloadMbps(1_234_567, 3_000)).toBe(3.3)
    expect(downloadMbps(1_000, 0)).toBe(8)
  })
})

describe('Test speed', () => {
  it('asks the request port for a bounded download and stores the speed', async () => {
    const lookup = vi
      .fn()
      .mockResolvedValue(
        ok({ ...lookupResult, speed: { bytes: 2_500_000, durationMs: 500, ok: true } }),
      )
    const service = new ProxyCheckService({ lookup }, clock)

    const result = await service.check(profile('p'), settings, { measureSpeed: true })

    expect(lookup.mock.calls[0]?.[3]).toEqual({
      endpoint: DEFAULT_SPEED_TEST_ENDPOINT,
      maxBytes: SPEED_TEST_MAX_BYTES,
      maxMs: SPEED_TEST_MAX_MS,
    })
    expect(result).toMatchObject({
      ok: true,
      value: {
        availability: true,
        downloadMbps: 40,
        externalIp: '203.0.113.8',
        speedErrorCode: null,
      },
    })
  })

  it('reports the response time of the check without the download phase', async () => {
    let now = 0
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    const lookup = vi.fn().mockImplementation(() => {
      now = 10_300
      return Promise.resolve(
        ok({
          ...lookupResult,
          speed: { bytes: 5_000_000, durationMs: 9_800, ok: true },
          speedPhaseMs: 10_000,
        }),
      )
    })
    const service = new ProxyCheckService({ lookup }, clock)

    const result = await service.check(profile('p'), settings, { measureSpeed: true })

    expect(result).toMatchObject({ ok: true, value: { totalDurationMs: 300 } })
    vi.restoreAllMocks()
  })

  it('keeps the profile available when only the download fails', async () => {
    const lookup = vi
      .fn()
      .mockResolvedValue(ok({ ...lookupResult, speed: { code: 'HTTP_ERROR', ok: false } }))
    const service = new ProxyCheckService({ lookup }, clock)

    const result = await service.check(profile('p'), settings, { measureSpeed: true })

    expect(result).toMatchObject({
      ok: true,
      value: { availability: true, downloadMbps: null, speedErrorCode: 'HTTP_ERROR' },
    })
  })

  it('does not download anything for a plain check', async () => {
    const lookup = vi.fn().mockResolvedValue(ok(lookupResult))
    const service = new ProxyCheckService({ lookup }, clock)

    const result = await service.check(profile('p'), settings)

    expect(lookup.mock.calls[0]?.[3]).toBeNull()
    expect(result).toMatchObject({ ok: true, value: { downloadMbps: null, speedErrorCode: null } })
  })
})
