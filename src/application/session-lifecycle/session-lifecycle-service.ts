import type { Clock } from '../../domain/types/entities'
import type { SessionStatePort } from '../ports/session-state'

export interface TabInventoryPort {
  liveTabIds(): Promise<ReadonlySet<number>>
}

export class SessionLifecycleService {
  constructor(
    private readonly session: SessionStatePort,
    private readonly tabs: TabInventoryPort,
    private readonly clock: Clock,
  ) {}

  async startup(browserRestart: boolean): Promise<void> {
    const liveTabs = await this.tabs.liveTabIds()
    await this.session.reconcile(liveTabs, this.clock.now(), browserRestart)
  }

  async tabClosed(tabId: number): Promise<void> {
    await this.session.removeOverridesForTab(tabId)
  }

  async privateSessionEnded(): Promise<boolean> {
    const overrides = await this.session.getOverrides()
    const retained = overrides.filter((override) => !override.incognito)
    if (retained.length === overrides.length) {
      return false
    }
    await this.session.setOverrides(retained)
    return true
  }

  async tabCreated(tabId: number): Promise<boolean> {
    // A browser may reuse a numeric tab ID. Clearing any stale owner record on creation prevents
    // a missed close event from transferring an override to the new tab instance.
    const overrides = await this.session.getOverrides()
    if (!overrides.some((override) => override.sourceTabId === tabId)) {
      return false
    }
    await this.session.removeOverridesForTab(tabId)
    return true
  }

  async alarm(): Promise<void> {
    const liveTabs = await this.tabs.liveTabIds()
    await this.session.reconcile(liveTabs, this.clock.now(), false)
  }
}
