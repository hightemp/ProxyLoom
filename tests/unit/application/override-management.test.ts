import { describe, expect, it } from 'vitest'

import { OverrideApplicationService } from '../../../src/application/overrides/override-service'
import { resolveRoute } from '../../../src/domain/routing/resolver'
import { buildRoutingSnapshot } from '../../../src/domain/routing/snapshot'
import { asProxyProfileId, type IdGenerator } from '../../../src/domain/types/brand'
import type { Clock } from '../../../src/domain/types/entities'
import { MemoryStorageArea } from '../../../src/storage/config/storage-area'
import { SessionRepository } from '../../../src/storage/session/session-repository'
import { config, override, profile } from '../domain/fixtures'

const clock: Clock = { now: () => new Date('2026-01-01T00:00:00.000Z') }

class SequentialIds implements IdGenerator {
  #next = 0
  next(): string {
    this.#next += 1
    return `override-${this.#next}`
  }
}

const setup = () => {
  const session = new SessionRepository(new MemoryStorageArea())
  const service = new OverrideApplicationService(session, new SequentialIds(), clock)
  const office = profile('office')
  const appConfig = config({ profiles: [office] })
  return { appConfig, office, service, session }
}

const createOnce = async (
  service: OverrideApplicationService,
  appConfig: ReturnType<typeof config>,
  incognito = false,
) => {
  const created = await service.create(appConfig, {
    action: { targetProxyProfileId: null, type: 'DIRECT' },
    incognito,
    platform: 'CHROMIUM',
    scope: 'EXACT_HOSTNAME',
    tabId: 4,
    url: 'https://www.example.co.uk/path?q=1',
  })
  if (!created.ok) throw new Error(created.error.code)
  return created.value
}

describe('override management', () => {
  it('remembers the normalized source hostname of a new override', async () => {
    const { appConfig, service } = setup()
    expect((await createOnce(service, appConfig)).sourceHostname).toBe('www.example.co.uk')
  })

  it('updates scope in both directions from the source hostname and keeps identity', async () => {
    const { appConfig, service, session } = setup()
    const created = await createOnce(service, appConfig)

    const widened = await service.update(appConfig, {
      incognito: false,
      overrideId: created.id,
      platform: 'CHROMIUM',
      scope: 'REGISTRABLE_DOMAIN',
    })
    expect(widened).toMatchObject({
      ok: true,
      value: { id: created.id, originKey: 'example.co.uk', scope: 'REGISTRABLE_DOMAIN' },
    })

    const narrowed = await service.update(appConfig, {
      incognito: false,
      overrideId: created.id,
      platform: 'CHROMIUM',
      scope: 'EXACT_HOSTNAME',
    })
    expect(narrowed).toMatchObject({ ok: true, value: { originKey: 'www.example.co.uk' } })
    const [stored] = await session.getOverrides()
    expect(stored).toMatchObject({
      createdAt: created.createdAt,
      id: created.id,
      sourceTabId: created.sourceTabId,
    })
  })

  it('changes the route and the resolver follows the updated override', async () => {
    const { appConfig, office, service, session } = setup()
    const created = await createOnce(service, appConfig)
    const updated = await service.update(appConfig, {
      action: { targetProxyProfileId: office.id, type: 'PROXY' },
      incognito: false,
      overrideId: created.id,
      platform: 'CHROMIUM',
    })
    expect(updated.ok).toBe(true)

    const snapshot = buildRoutingSnapshot(appConfig, await session.getOverrides(), clock.now())
    if (!snapshot.ok) throw new Error('snapshot')
    expect(
      resolveRoute(snapshot.value, {
        incognito: false,
        now: clock.now(),
        platform: 'CHROMIUM',
        tabId: 4,
        url: 'https://www.example.co.uk/',
      }),
    ).toMatchObject({ action: 'PROXY', profileId: office.id, source: 'OVERRIDE' })
  })

  it('rejects unknown profiles and overrides from another session without writing', async () => {
    const { appConfig, service, session } = setup()
    const created = await createOnce(service, appConfig, true)
    const before = await session.getOverrides()

    expect(
      await service.update(appConfig, {
        action: { targetProxyProfileId: asProxyProfileId('missing'), type: 'PROXY' },
        incognito: true,
        overrideId: created.id,
        platform: 'CHROMIUM',
      }),
    ).toEqual({ error: { code: 'PROFILE_NOT_FOUND' }, ok: false })
    expect(
      await service.update(appConfig, {
        incognito: false,
        overrideId: created.id,
        platform: 'CHROMIUM',
        scope: 'REGISTRABLE_DOMAIN',
      }),
    ).toEqual({ error: { code: 'OVERRIDE_NOT_FOUND', overrideId: created.id }, ok: false })
    expect(await service.remove(created.id, false)).toEqual({
      error: { code: 'OVERRIDE_NOT_FOUND', overrideId: created.id },
      ok: false,
    })
    expect(await session.getOverrides()).toEqual(before)
  })

  it('lists and clears only the caller session', async () => {
    const { appConfig, service } = setup()
    const normal = await createOnce(service, appConfig, false)
    const privateOne = await createOnce(service, appConfig, true)

    expect((await service.list(false)).map((entry) => entry.id)).toEqual([normal.id])
    expect((await service.list(true)).map((entry) => entry.id)).toEqual([privateOne.id])

    await service.clear(false)
    expect(await service.list(false)).toEqual([])
    expect((await service.list(true)).map((entry) => entry.id)).toEqual([privateOne.id])
  })

  it('reports overrides removed because their profile disappeared and skips no-op writes', async () => {
    const { appConfig, office, session, service } = setup()
    await session.setOverrides([
      override({ id: override().id, sourceHostname: 'example.com' }),
      override({
        action: { targetProxyProfileId: office.id, type: 'PROXY' },
        id: 'override-proxy' as never,
        sourceHostname: 'example.com',
      }),
    ])
    expect(await service.removeInvalid(appConfig)).toEqual({ removed: 0 })

    const withoutProfile = config({ profiles: [] })
    expect(await service.removeInvalid(withoutProfile)).toEqual({ removed: 1 })
    expect((await session.getOverrides()).map((entry) => entry.id)).toEqual([override().id])
  })

  it('builds a promotion that matches the override pattern and route', async () => {
    const { appConfig, service } = setup()
    const created = await createOnce(service, appConfig)
    expect(await service.promotion(created.id, false)).toEqual({
      ok: true,
      value: {
        action: created.action,
        originKey: created.originKey,
        pattern: created.generatedPattern,
      },
    })
  })
})
