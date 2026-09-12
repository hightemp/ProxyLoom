import { describe, expect, it } from 'vitest'

import { ErrorCorrelationStore } from '../../../src/application/errors/error-correlation-store'
import { inspectTab } from '../../../src/application/inspection/current-tab-inspection'
import { buildRoutingSnapshot } from '../../../src/domain/routing/snapshot'
import type { Clock } from '../../../src/domain/types/entities'
import { MemoryStorageArea } from '../../../src/storage/config/storage-area'
import { SessionRepository } from '../../../src/storage/session/session-repository'
import { config } from '../domain/fixtures'

describe('redacted error correlation store', () => {
  it('exposes a safe origin link while keeping the exact retry URL one-time and private', async () => {
    let now = new Date('2026-01-01T00:00:00.000Z')
    const clock: Clock = { now: () => now }
    const store = new ErrorCorrelationStore(
      clock,
      () => 'token-1',
      new SessionRepository(new MemoryStorageArea()),
      1_000,
    )
    const originalUrl = 'https://user:password@example.com/private/path?token=canary#fragment'

    const recorded = await store.record({
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
    expect(await store.get('token-1')).toMatchObject({
      ok: true,
      value: {
        displayUrl: 'https://example.com/',
        hostname: 'example.com',
      },
    })
    expect(JSON.stringify(await store.get('token-1'))).not.toMatch(
      /password|private\/path|token=canary/u,
    )
    expect(await store.consumeRetry('token-1')).toEqual({
      ok: true,
      value: { context: recorded.ok ? recorded.value : null, originalUrl },
    })
    expect(await store.get('token-1')).toEqual({
      error: { code: 'CONTEXT_NOT_FOUND' },
      ok: false,
    })

    await store.record({
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
    expect(await store.get('token-1')).toEqual({
      error: { code: 'CONTEXT_EXPIRED' },
      ok: false,
    })
  })

  it('rejects a corrupted retry target instead of exposing a mismatched link', async () => {
    const store = new ErrorCorrelationStore(
      { now: () => new Date('2026-01-01T00:00:00.000Z') },
      () => 'unused-token',
      new SessionRepository(
        new MemoryStorageArea({
          'session.error-contexts': {
            contexts: [
              {
                context: {
                  hostname: 'expected.example',
                  incognito: false,
                  occurredAt: '2026-01-01T00:00:00.000Z',
                  platform: 'CHROMIUM',
                  profileId: null,
                  profileName: null,
                  requestId: 'request-1',
                  ruleId: null,
                  ruleName: null,
                  tabId: 7,
                  technicalCode: 'FAILED',
                  token: 'corrupted-token',
                },
                expiresAt: Date.parse('2026-01-01T00:05:00.000Z'),
                originalUrl: 'https://other.example/private',
              },
            ],
            schemaVersion: 1,
          },
        }),
      ),
    )

    expect(await store.get('corrupted-token')).toEqual({
      error: { code: 'INVALID_URL' },
      ok: false,
    })
    expect(await store.size()).toBe(0)
  })

  it('survives a service-worker store reconstruction within the session TTL', async () => {
    const storage = new MemoryStorageArea()
    const clock: Clock = { now: () => new Date('2026-01-01T00:00:00.000Z') }
    const firstWorkerStore = new ErrorCorrelationStore(
      clock,
      () => 'restart-token',
      new SessionRepository(storage),
    )
    await firstWorkerStore.record({
      incognito: false,
      platform: 'CHROMIUM',
      profileId: null,
      profileName: 'Proxy 1',
      requestId: 'request-before-worker-stop',
      ruleId: null,
      ruleName: null,
      tabId: 7,
      technicalCode: 'net::ERR_PROXY_CONNECTION_FAILED',
      url: 'https://example.com/recover-after-mode-switch?value=1',
    })

    const restartedWorkerStore = new ErrorCorrelationStore(
      clock,
      () => 'unused-token',
      new SessionRepository(storage),
    )

    expect(await restartedWorkerStore.get('restart-token')).toMatchObject({
      ok: true,
      value: { hostname: 'example.com', token: 'restart-token' },
    })
    expect(await restartedWorkerStore.consumeRetry('restart-token')).toMatchObject({
      ok: true,
      value: {
        originalUrl: 'https://example.com/recover-after-mode-switch?value=1',
      },
    })
  })

  it('bounds contexts and clears every item for a closed tab', async () => {
    let token = 0
    const store = new ErrorCorrelationStore(
      { now: () => new Date('2026-01-01T00:00:00.000Z') },
      () => `token-${String((token += 1))}`,
      new SessionRepository(new MemoryStorageArea()),
      10_000,
      2,
    )
    await Promise.all(
      [1, 2, 3].map((tabId) =>
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
        }),
      ),
    )
    expect(await store.size()).toBe(2)
    await store.clearTab(3)
    expect(await store.size()).toBe(1)
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
