import { describe, expect, it } from 'vitest'

import { AuthAttemptTracker } from '../../../src/application/auth/attempt-tracker'
import { matchProxyAuthChallenge } from '../../../src/application/auth/match-challenge'
import { buildRoutingSnapshot } from '../../../src/domain/routing/snapshot'
import { config, endpoint, profile } from '../domain/fixtures'

const now = new Date('2026-01-01T12:00:00.000Z')

describe('proxy auth attempt tracker', () => {
  it('allows one attempt and rejects the next challenge for a request', () => {
    let time = 0
    const tracker = new AuthAttemptTracker(1_000, () => time)
    expect(tracker.begin('request')).toBe('FIRST_ATTEMPT')
    expect(tracker.begin('request')).toBe('REJECTED')
    tracker.complete('request')
    expect(tracker.begin('request')).toBe('FIRST_ATTEMPT')
    time = 2_000
    expect(tracker.size).toBe(0)
  })
})

describe('proxy auth challenge matching', () => {
  const authenticatedProfile = profile('auth', {
    httpEndpoint: {
      ...endpoint('proxy.local', 8080),
      password: 'canary-password',
      username: 'alice',
    },
  })
  const snapshotResult = buildRoutingSnapshot(
    config({
      general: {
        ...config().general,
        activeProxyProfileId: authenticatedProfile.id,
        mode: 'PROXY',
      },
      profiles: [authenticatedProfile],
    }),
    [],
    now,
  )
  if (!snapshotResult.ok) {
    throw new Error(snapshotResult.error.code)
  }
  const snapshot = snapshotResult.value

  it('never answers ordinary website authentication', () => {
    expect(
      matchProxyAuthChallenge(
        snapshot,
        'CHROMIUM',
        {
          challengerHost: 'proxy.local',
          challengerPort: 8080,
          incognito: false,
          isProxy: false,
          requestId: '1',
          tabId: 1,
          url: 'http://example.com/',
        },
        now,
      ),
    ).toEqual({ matched: false, reason: 'NOT_PROXY_CHALLENGE' })
  })

  it('requires the challenge to match the effective endpoint', () => {
    expect(
      matchProxyAuthChallenge(
        snapshot,
        'CHROMIUM',
        {
          challengerHost: 'other.proxy',
          challengerPort: 8080,
          incognito: false,
          isProxy: true,
          requestId: '1',
          tabId: 1,
          url: 'http://example.com/',
        },
        now,
      ),
    ).toEqual({ matched: false, reason: 'CHALLENGER_MISMATCH' })
  })

  it('returns credentials only for the assigned proxy', () => {
    expect(
      matchProxyAuthChallenge(
        snapshot,
        'CHROMIUM',
        {
          challengerHost: 'PROXY.LOCAL',
          challengerPort: 8080,
          incognito: false,
          isProxy: true,
          requestId: '1',
          tabId: 1,
          url: 'http://example.com/',
        },
        now,
      ),
    ).toEqual({
      matched: true,
      password: 'canary-password',
      profileId: 'auth',
      username: 'alice',
    })
  })
})
