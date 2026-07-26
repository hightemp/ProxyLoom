import { describe, expect, it } from 'vitest'

import { ErrorCorrelationStore } from '../../../src/application/errors/error-correlation-store'
import { inspectTab } from '../../../src/application/inspection/current-tab-inspection'
import { buildRoutingSnapshot } from '../../../src/domain/routing/snapshot'
import type { Clock } from '../../../src/domain/types/entities'
import { config } from '../domain/fixtures'

describe('redacted error correlation store', () => {
  it('exposes hostname-only context while keeping the retry URL one-time and private', () => {
    let now = new Date('2026-01-01T00:00:00.000Z')
    const clock: Clock = { now: () => now }
    const store = new ErrorCorrelationStore(clock, () => 'token-1', 1_000)
    const originalUrl = 'https://user:password@example.com/private/path?token=canary#fragment'

    const recorded = store.record({
      incognito: true,
      platform: 'CHROMIUM',
      profileId: null,
      profileName: null,
      requestId: 'request-1',
      ruleId: null,
      ruleName: null,
      tabId: 7,
      technicalCode: 'net::ERR_PROXY_CONNECTION_FAILED',
      url: originalUrl,
    })

    expect(recorded).toMatchObject({
      ok: true,
      value: {
        hostname: 'example.com',
        incognito: true,
        technicalCode: 'net::ERR_PROXY_CONNECTION_FAILED',
        token: 'token-1',
      },
    })
    expect(JSON.stringify(recorded)).not.toContain('private/path')
    expect(store.consumeRetryUrl('token-1')).toEqual({ ok: true, value: originalUrl })
    expect(store.get('token-1')).toEqual({
      error: { code: 'CONTEXT_NOT_FOUND' },
      ok: false,
    })

    store.record({
      incognito: false,
      platform: 'CHROMIUM',
      profileId: null,
      profileName: null,
      requestId: 'request-2',
      ruleId: null,
      ruleName: null,
      tabId: 7,
      technicalCode: 'FAILED',
      url: 'https://example.com/',
    })
    now = new Date('2026-01-01T00:00:02.000Z')
    expect(store.get('token-1')).toEqual({
      error: { code: 'CONTEXT_EXPIRED' },
      ok: false,
    })
  })

  it('bounds contexts and clears every item for a closed tab', () => {
    let token = 0
    const store = new ErrorCorrelationStore(
      { now: () => new Date('2026-01-01T00:00:00.000Z') },
      () => `token-${String((token += 1))}`,
      10_000,
      2,
    )
    for (const tabId of [1, 2, 3]) {
      store.record({
        incognito: false,
        platform: 'FIREFOX',
        profileId: null,
        profileName: null,
        requestId: String(tabId),
        ruleId: null,
        ruleName: null,
        tabId,
        technicalCode: 'FAILED',
        url: 'https://example.com/',
      })
    }
    expect(store.size).toBe(2)
    store.clearTab(3)
    expect(store.size).toBe(1)
  })
})

describe('current tab inspection', () => {
  it('returns one authoritative resolver decision and platform scope warning', () => {
    const snapshot = buildRoutingSnapshot(config(), [], new Date('2026-01-01T00:00:00.000Z'))
    expect(snapshot.ok).toBe(true)
    if (!snapshot.ok) {
      return
    }
    expect(
      inspectTab(
        snapshot.value,
        { id: 5, incognito: false, url: 'https://Example.COM/private?secret=1' },
        'CONTROLLED_BY_THIS_EXTENSION',
        'CHROMIUM',
        new Date('2026-01-01T00:00:00.000Z'),
      ),
    ).toMatchObject({
      controlStatus: 'CONTROLLED_BY_THIS_EXTENSION',
      decision: { action: 'DIRECT', normalizedTarget: 'https://example.com/' },
      hostname: 'example.com',
      scopeWarning: 'CHROMIUM_ORIGIN_SCOPE',
      supported: true,
    })
  })

  it('explains internal and missing tabs without throwing', () => {
    const snapshot = buildRoutingSnapshot(config(), [], new Date('2026-01-01T00:00:00.000Z'))
    if (!snapshot.ok) {
      throw new Error('Fixture snapshot must be valid.')
    }
    expect(
      inspectTab(
        snapshot.value,
        { id: 2, incognito: false, url: 'chrome://settings/' },
        'CONTROLLABLE',
        'CHROMIUM',
        new Date(),
      ),
    ).toMatchObject({ reason: 'UNSUPPORTED_URL', supported: false })
  })
})
