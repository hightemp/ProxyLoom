import { browser } from 'wxt/browser'

import type { TabInventoryPort } from '../../application/session-lifecycle/session-lifecycle-service'

interface InventoryTab {
  readonly id?: number | undefined
}

interface InventoryTabsApi {
  get(tabId: number): Promise<InventoryTab>
  query(queryInfo: Record<string, never>): Promise<InventoryTab[]>
}

export class BrowserTabInventory implements TabInventoryPort {
  constructor(private readonly tabs: InventoryTabsApi = browser.tabs) {}

  async liveTabIds(candidateTabIds?: ReadonlySet<number>): Promise<ReadonlySet<number>> {
    if (candidateTabIds === undefined) {
      return new Set(
        (await this.tabs.query({}))
          .map((tab) => tab.id)
          .filter((tabId): tabId is number => tabId !== undefined),
      )
    }
    const resolvedTabIds = await Promise.all(
      [...candidateTabIds].map(async (tabId) => {
        try {
          return (await this.tabs.get(tabId)).id
        } catch {
          return undefined
        }
      }),
    )
    return new Set(resolvedTabIds.filter((tabId): tabId is number => tabId !== undefined))
  }
}
