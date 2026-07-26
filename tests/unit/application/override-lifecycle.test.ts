import { describe, expect, it } from 'vitest'

import { OverrideApplicationService } from '../../../src/application/overrides/override-service'
import { SessionLifecycleService } from '../../../src/application/session-lifecycle/session-lifecycle-service'
import type { IdGenerator } from '../../../src/domain/types/brand'
import type { Clock } from '../../../src/domain/types/entities'
import { resolveRoute } from '../../../src/domain/routing/resolver'
import { buildRoutingSnapshot } from '../../../src/domain/routing/snapshot'
import { MemoryStorageArea } from '../../../src/storage/config/storage-area'
import { SessionRepository } from '../../../src/storage/session/session-repository'
import { config, profile } from '../domain/fixtures'

const clock: Clock = {
  now: () => new Date('2026-01-01T00:00:00.000Z'),
}

class FixedId implements IdGenerator {
  next(): string {
    return 'override-created'
  }
}

describe('temporary override application service', () => {
  it('generates PSL-aware exact/domain patterns and platform scope warnings', () => {
    const service = new OverrideApplicationService(
      new SessionRepository(new MemoryStorageArea()),
      new FixedId(),
      clock,
    )
    expect(
      service.preview('https://Sub.Example.CO.UK:8443/path', 'EXACT_HOSTNAME', 'CHROMIUM'),
    ).toEqual({
      ok: true,
      value: {
        chromiumScopeWarning: true,
        generatedPattern: '^(?:https?|wss?)://sub\\.example\\.co\\.uk(?::\\d+)?/$',
        originKey: 'sub.example.co.uk',
        platformScope: 'ORIGIN',
      },
    })
    expect(
      service.preview('https://Sub.Example.CO.UK/path', 'REGISTRABLE_DOMAIN', 'FIREFOX'),
    ).toEqual({
      ok: true,
      value: {
        chromiumScopeWarning: false,
        generatedPattern: '^(?:https?|wss?)://(?:[^./]+\\.)*example\\.co\\.uk(?::\\d+)?/$',
        originKey: 'example.co.uk',
        platformScope: 'TAB',
      },
    })
    expect(service.preview('http://127.0.0.1/path', 'REGISTRABLE_DOMAIN', 'CHROMIUM')).toEqual({
      error: { code: 'DOMAIN_SCOPE_UNAVAILABLE' },
      ok: false,
    })
  })

  it('persists session-only state and the resolver applies it above rules except in DIRECT', async () => {
    const session = new SessionRepository(new MemoryStorageArea())
    const service = new OverrideApplicationService(session, new FixedId(), clock)
    const selectedProfile = profile('selected')
    const value = config({ profiles: [selectedProfile] })
    const created = await service.create(value, {
      action: { targetProxyProfileId: selectedProfile.id, type: 'PROXY' },
      incognito: false,
      platform: 'FIREFOX',
      scope: 'EXACT_HOSTNAME',
      tabId: 12,
      url: 'https://example.com/private',
    })
    expect(created).toMatchObject({
      ok: true,
      value: { id: 'override-created', platformScope: 'TAB', sourceTabId: 12 },
    })
    expect(await session.getOverrides()).toHaveLength(1)

    const snapshot = buildRoutingSnapshot(value, await session.getOverrides(), clock.now())
    expect(snapshot.ok).toBe(true)
    if (!snapshot.ok) {
      return
    }
    expect(
      resolveRoute(snapshot.value, {
        incognito: false,
        now: clock.now(),
        platform: 'FIREFOX',
        tabId: 12,
        url: 'https://example.com/another-path',
      }),
    ).toMatchObject({ action: 'PROXY', source: 'OVERRIDE' })
    expect(
      resolveRoute(
        { ...snapshot.value, mode: 'DIRECT' },
        {
          incognito: false,
          now: clock.now(),
          platform: 'FIREFOX',
          tabId: 12,
          url: 'https://example.com/',
        },
      ),
    ).toMatchObject({ action: 'DIRECT', source: 'MODE' })
  })

  it('rejects missing profiles and removes invalid overrides after profile deletion', async () => {
    const session = new SessionRepository(new MemoryStorageArea())
    const service = new OverrideApplicationService(session, new FixedId(), clock)
    const selectedProfile = profile('selected')
    const value = config({ profiles: [selectedProfile] })
    await service.create(value, {
      action: { targetProxyProfileId: selectedProfile.id, type: 'PROXY' },
      incognito: true,
      platform: 'CHROMIUM',
      scope: 'EXACT_HOSTNAME',
      tabId: 4,
      url: 'https://example.com/',
    })

    expect(await service.removeInvalid(config())).toEqual([])
    expect(
      await service.create(config(), {
        action: { targetProxyProfileId: selectedProfile.id, type: 'PROXY' },
        incognito: false,
        platform: 'CHROMIUM',
        scope: 'EXACT_HOSTNAME',
        tabId: 4,
        url: 'https://example.com/',
      }),
    ).toEqual({ error: { code: 'PROFILE_NOT_FOUND' }, ok: false })
  })

  it('never applies a normal override in private browsing or a private override normally', async () => {
    const session = new SessionRepository(new MemoryStorageArea())
    const service = new OverrideApplicationService(session, new FixedId(), clock)
    await service.create(config(), {
      action: { targetProxyProfileId: null, type: 'DIRECT' },
      incognito: true,
      platform: 'CHROMIUM',
      scope: 'EXACT_HOSTNAME',
      tabId: 4,
      url: 'https://example.com/',
    })
    const snapshot = buildRoutingSnapshot(config(), await session.getOverrides(), clock.now())
    expect(snapshot.ok).toBe(true)
    if (!snapshot.ok) return

    expect(
      resolveRoute(snapshot.value, {
        incognito: false,
        now: clock.now(),
        platform: 'CHROMIUM',
        tabId: 4,
        url: 'https://example.com/',
      }).source,
    ).toBe('FALLBACK')
    expect(
      resolveRoute(snapshot.value, {
        incognito: true,
        now: clock.now(),
        platform: 'CHROMIUM',
        tabId: 4,
        url: 'https://example.com/',
      }).source,
    ).toBe('OVERRIDE')
  })
})

describe('session lifecycle service', () => {
  it('reconciles startup/alarm and cleans a closed source tab', async () => {
    const session = new SessionRepository(new MemoryStorageArea())
    const overrideService = new OverrideApplicationService(session, new FixedId(), clock)
    await overrideService.create(config(), {
      action: { targetProxyProfileId: null, type: 'DIRECT' },
      incognito: false,
      platform: 'CHROMIUM',
      scope: 'EXACT_HOSTNAME',
      tabId: 9,
      url: 'https://example.com/',
    })
    let tabs = new Set([9])
    const lifecycle = new SessionLifecycleService(
      session,
      { liveTabIds: () => Promise.resolve(tabs) },
      clock,
    )

    await lifecycle.startup(false)
    expect(await session.getOverrides()).toHaveLength(1)
    await lifecycle.tabClosed(9)
    expect(await session.getOverrides()).toEqual([])

    await overrideService.create(config(), {
      action: { targetProxyProfileId: null, type: 'DIRECT' },
      incognito: false,
      platform: 'CHROMIUM',
      scope: 'EXACT_HOSTNAME',
      tabId: 9,
      url: 'https://example.com/',
    })
    expect(await lifecycle.tabCreated(9)).toBe(true)
    expect(await session.getOverrides()).toEqual([])
    expect(await lifecycle.tabCreated(9)).toBe(false)

    await overrideService.create(config(), {
      action: { targetProxyProfileId: null, type: 'DIRECT' },
      incognito: false,
      platform: 'CHROMIUM',
      scope: 'EXACT_HOSTNAME',
      tabId: 9,
      url: 'https://example.com/',
    })
    tabs = new Set()
    await lifecycle.alarm()
    expect(await session.getOverrides()).toEqual([])
  })

  it('removes only private overrides after the last private window closes', async () => {
    const session = new SessionRepository(new MemoryStorageArea())
    const privateOverride = {
      ...(await createOverride(session, true, 10)),
    }
    const normalOverride = {
      ...(await createOverride(session, false, 11)),
    }
    await session.setOverrides([privateOverride, normalOverride])
    const lifecycle = new SessionLifecycleService(
      session,
      { liveTabIds: () => Promise.resolve(new Set([10, 11])) },
      clock,
    )

    expect(await lifecycle.privateSessionEnded()).toBe(true)
    expect(await session.getOverrides()).toEqual([normalOverride])
    expect(await lifecycle.privateSessionEnded()).toBe(false)
  })
})

const createOverride = async (session: SessionRepository, incognito: boolean, tabId: number) => {
  const service = new OverrideApplicationService(session, new FixedId(), clock)
  const created = await service.create(config(), {
    action: { targetProxyProfileId: null, type: 'DIRECT' },
    incognito,
    platform: 'CHROMIUM',
    scope: 'EXACT_HOSTNAME',
    tabId,
    url: 'https://example.com/',
  })
  if (!created.ok) throw new Error(created.error.code)
  return created.value
}
