import { describe, expect, it, vi } from 'vitest'

import { resolveTargetTab, type TargetTabsApi } from '../../../src/platform/runtime/target-tab'

interface TabFixture {
  readonly id?: number | undefined
  readonly incognito: boolean
  readonly url?: string | undefined
}

const tabsApi = (
  get: TargetTabsApi<TabFixture>['get'],
  query: TargetTabsApi<TabFixture>['query'],
): TargetTabsApi<TabFixture> => ({ get, query })

describe('target tab resolution', () => {
  it('uses the active tab when no explicit ID is supplied', async () => {
    const get = vi.fn<TargetTabsApi<TabFixture>['get']>()
    const query = vi
      .fn<TargetTabsApi<TabFixture>['query']>()
      .mockResolvedValue([{ id: 3, incognito: false }])

    await expect(resolveTargetTab(tabsApi(get, query))).resolves.toEqual({
      id: 3,
      incognito: false,
    })
    expect(query).toHaveBeenCalledWith({ active: true, currentWindow: true })
    expect(get).not.toHaveBeenCalled()
  })

  it('uses tabs.get for an ordinary explicit tab', async () => {
    const get = vi
      .fn<TargetTabsApi<TabFixture>['get']>()
      .mockResolvedValue({ id: 7, incognito: false })
    const query = vi.fn<TargetTabsApi<TabFixture>['query']>()

    await expect(resolveTargetTab(tabsApi(get, query), 7)).resolves.toEqual({
      id: 7,
      incognito: false,
    })
    expect(query).not.toHaveBeenCalled()
  })

  it('falls back to tabs.query when Chrome cannot get a visible private tab by ID', async () => {
    const getError = new Error('No tab with id: 11.')
    const get = vi.fn<TargetTabsApi<TabFixture>['get']>().mockRejectedValue(getError)
    const query = vi.fn<TargetTabsApi<TabFixture>['query']>().mockResolvedValue([
      { id: 4, incognito: false },
      { id: 11, incognito: true },
    ])

    await expect(resolveTargetTab(tabsApi(get, query), 11)).resolves.toEqual({
      id: 11,
      incognito: true,
    })
    expect(query).toHaveBeenCalledWith({})
  })

  it('preserves the original tabs.get error when the tab is no longer visible', async () => {
    const getError = new Error('No tab with id: 13.')
    const get = vi.fn<TargetTabsApi<TabFixture>['get']>().mockRejectedValue(getError)
    const query = vi
      .fn<TargetTabsApi<TabFixture>['query']>()
      .mockResolvedValue([{ id: 12, incognito: false }])

    await expect(resolveTargetTab(tabsApi(get, query), 13)).rejects.toBe(getError)
  })

  it('rejects invalid explicit IDs before calling the browser', async () => {
    const get = vi.fn<TargetTabsApi<TabFixture>['get']>()
    const query = vi.fn<TargetTabsApi<TabFixture>['query']>()

    await expect(resolveTargetTab(tabsApi(get, query), -1)).rejects.toThrow('INVALID_TAB_ID')
    expect(get).not.toHaveBeenCalled()
    expect(query).not.toHaveBeenCalled()
  })
})
