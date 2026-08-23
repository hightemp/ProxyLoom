import { describe, expect, it, vi } from 'vitest'

import { BrowserTabInventory } from '../../../src/platform/runtime/tab-inventory'

describe('browser tab inventory', () => {
  it('resolves only candidate owner tabs on the routing-critical path', async () => {
    const get = vi.fn((tabId: number) => {
      if (tabId === 12) return Promise.reject(new Error('Tab closed'))
      return Promise.resolve({ id: tabId })
    })
    const query = vi.fn()
    const inventory = new BrowserTabInventory({ get, query })

    const live = await inventory.liveTabIds(new Set([7, 12]))

    expect([...live]).toEqual([7])
    expect(get.mock.calls).toEqual([[7], [12]])
    expect(query).not.toHaveBeenCalled()
  })

  it('uses the full tab inventory only when ancillary cleanup requests it', async () => {
    const get = vi.fn()
    const query = vi.fn().mockResolvedValue([{ id: 3 }, { id: undefined }, { id: 9 }])
    const inventory = new BrowserTabInventory({ get, query })

    const live = await inventory.liveTabIds()

    expect([...live]).toEqual([3, 9])
    expect(query).toHaveBeenCalledWith({})
    expect(get).not.toHaveBeenCalled()
  })
})
