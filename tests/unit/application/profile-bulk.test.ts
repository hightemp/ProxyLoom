import { describe, expect, it } from 'vitest'

import { filterProfiles } from '../../../src/application/profiles/profile-filter'
import { ProfileApplicationService } from '../../../src/application/profiles/profile-service'
import { asProxyProfileId } from '../../../src/domain/types/brand'
import type { Clock } from '../../../src/domain/types/entities'
import { config, endpoint, profile, rule } from '../domain/fixtures'

const clock: Clock = { now: () => new Date('2026-11-01T00:00:00.000Z') }
const service = new ProfileApplicationService({ next: () => 'id' }, clock)

const a = profile('a', {
  httpEndpoint: endpoint('10.0.0.1', 8080),
  name: 'Office A',
  useSameProxy: true,
})
const b = profile('b', {
  httpEndpoint: endpoint('proxy.example', 8443, 'HTTPS'),
  lastCheck: {
    availability: true,
    checkedAt: '2026-11-01T00:00:00.000Z' as never,
    connectDurationMs: null,
    country: null,
    errorCode: null,
    externalIp: '192.0.2.1',
    httpStatus: 200,
    totalDurationMs: 10,
  },
  name: 'Home',
  useSameProxy: true,
})
const c = profile('c', {
  httpEndpoint: endpoint('10.0.0.3', 3128),
  name: 'Lab',
  useSameProxy: true,
})

describe('bulk profile delete', () => {
  it('removes all selected profiles atomically and invalidates referring rules', () => {
    const appConfig = config({
      general: { ...config().general, activeProxyProfileId: a.id, mode: 'PROXY' },
      profiles: [a, b, c],
      rules: [rule('r1', 0, { action: { targetProxyProfileId: b.id, type: 'PROXY' } })],
    })
    const result = service.deleteMany(appConfig, [a.id, b.id])
    if (!result.ok) throw new Error(result.error.code)
    expect(result.value.config.profiles.map((entry) => entry.id)).toEqual([c.id])
    expect(result.value.config.general).toMatchObject({
      activeProxyProfileId: null,
      mode: 'DIRECT',
    })
    expect(result.value.config.rules[0]?.validity).toBe('INVALID_REFERENCE')
    expect(result.value.deleted).toBe(2)
  })

  it('changes nothing when any selected profile is missing', () => {
    const appConfig = config({ profiles: [a, b] })
    expect(service.deleteMany(appConfig, [a.id, asProxyProfileId('missing')])).toEqual({
      error: { code: 'PROFILE_NOT_FOUND', profileId: 'missing' },
      ok: false,
    })
  })
})

describe('profile filter', () => {
  const all = [a, b, c]
  it('matches name and host case-insensitively', () => {
    expect(filterProfiles(all, { check: 'ALL', query: 'office', transport: 'ALL' })).toEqual([a])
    expect(filterProfiles(all, { check: 'ALL', query: 'PROXY.EX', transport: 'ALL' })).toEqual([b])
  })

  it('filters by transport and last check', () => {
    expect(filterProfiles(all, { check: 'ALL', query: '', transport: 'HTTPS' })).toEqual([b])
    expect(filterProfiles(all, { check: 'AVAILABLE', query: '', transport: 'ALL' })).toEqual([b])
    expect(filterProfiles(all, { check: 'NEVER', query: '', transport: 'ALL' })).toEqual([a, c])
    expect(filterProfiles(all, { check: 'UNAVAILABLE', query: '', transport: 'ALL' })).toEqual([])
  })
})
