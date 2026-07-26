import { describe, expect, it, vi } from 'vitest'

import { buildRoutingSnapshot } from '../../../src/domain/routing/snapshot'
import { asProxyProfileId } from '../../../src/domain/types/brand'
import {
  resolveRequestIncognito,
  resolveRequestRoutingContext,
} from '../../../src/platform/runtime/logging-event-bridge'
import type { TargetTabsApi } from '../../../src/platform/runtime/target-tab'
import { config, override, profile } from '../domain/fixtures'

vi.mock('wxt/browser', () => ({ browser: {} }))

interface TabFixture {
  readonly id?: number | undefined
  readonly incognito: boolean
}

const tabsApi = (
  get: TargetTabsApi<TabFixture>['get'],
  query: TargetTabsApi<TabFixture>['query'],
): TargetTabsApi<TabFixture> => ({ get, query })

describe('routing-log private request classification', () => {
  it('uses an explicit browser-provided incognito flag without a tab lookup', async () => {
    const get = vi.fn<TargetTabsApi<TabFixture>['get']>()
    const query = vi.fn<TargetTabsApi<TabFixture>['query']>()

    await expect(
      resolveRequestIncognito({ incognito: true, tabId: 17 }, tabsApi(get, query)),
    ).resolves.toBe(true)
    expect(get).not.toHaveBeenCalled()
    expect(query).not.toHaveBeenCalled()
  })

  it('derives Chromium private status from the request tab', async () => {
    const get = vi
      .fn<TargetTabsApi<TabFixture>['get']>()
      .mockResolvedValue({ id: 18, incognito: true })
    const query = vi.fn<TargetTabsApi<TabFixture>['query']>()

    await expect(resolveRequestIncognito({ tabId: 18 }, tabsApi(get, query))).resolves.toBe(true)
    expect(get).toHaveBeenCalledWith(18)
    expect(query).not.toHaveBeenCalled()
  })

  it('falls back to the visible tab list for a Chrome private tab', async () => {
    const get = vi
      .fn<TargetTabsApi<TabFixture>['get']>()
      .mockRejectedValue(new Error('No tab with id: 19.'))
    const query = vi.fn<TargetTabsApi<TabFixture>['query']>().mockResolvedValue([
      { id: 4, incognito: false },
      { id: 19, incognito: true },
    ])

    await expect(resolveRequestIncognito({ tabId: 19 }, tabsApi(get, query))).resolves.toBe(true)
    expect(query).toHaveBeenCalledWith({})
  })

  it('treats browser-internal and vanished tabs as non-private', async () => {
    const get = vi
      .fn<TargetTabsApi<TabFixture>['get']>()
      .mockRejectedValue(new Error('No tab with id: 20.'))
    const query = vi.fn<TargetTabsApi<TabFixture>['query']>().mockResolvedValue([])
    const tabs = tabsApi(get, query)

    await expect(resolveRequestIncognito({ tabId: -1 }, tabs)).resolves.toBe(false)
    await expect(resolveRequestIncognito({ tabId: 20 }, tabs)).resolves.toBe(false)
  })

  it('uses the derived private status when resolving the logged route', async () => {
    const selectedProfile = profile('global')
    const current = config({
      general: {
        ...config().general,
        activeProxyProfileId: asProxyProfileId('global'),
        mode: 'PROXY',
      },
      profiles: [selectedProfile],
    })
    const snapshot = buildRoutingSnapshot(
      current,
      [override({ incognito: true, sourceTabId: 21 })],
      new Date(),
    )
    expect(snapshot.ok).toBe(true)
    if (!snapshot.ok) throw new Error(snapshot.error.code)
    const get = vi
      .fn<TargetTabsApi<TabFixture>['get']>()
      .mockResolvedValue({ id: 21, incognito: true })
    const query = vi.fn<TargetTabsApi<TabFixture>['query']>()

    await expect(
      resolveRequestRoutingContext(
        snapshot.value,
        { tabId: 21, url: 'https://example.com/private' },
        'CHROMIUM',
        tabsApi(get, query),
      ),
    ).resolves.toMatchObject({
      decision: { action: 'DIRECT', source: 'OVERRIDE' },
      incognito: true,
    })
  })
})
