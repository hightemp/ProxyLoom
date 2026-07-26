import { resolveRoute } from '../../domain/routing/resolver'
import type { RoutingSnapshot } from '../../domain/routing/snapshot'
import type { BrowserPlatform, ControlStatus } from '../../domain/types/entities'
import { normalizeUrl } from '../../domain/url/normalize'

export interface InspectableTab {
  readonly id: number | null
  readonly url: string | null
  readonly incognito: boolean
}

export type TabInspection =
  | {
      readonly supported: false
      readonly reason: 'NO_ACTIVE_TAB' | 'UNSUPPORTED_URL'
      readonly controlStatus: ControlStatus
      readonly platform: BrowserPlatform
    }
  | {
      readonly supported: true
      readonly hostname: string
      readonly controlStatus: ControlStatus
      readonly platform: BrowserPlatform
      readonly scopeWarning: 'CHROMIUM_ORIGIN_SCOPE' | null
      readonly decision: ReturnType<typeof resolveRoute>
    }

export const inspectTab = (
  snapshot: RoutingSnapshot,
  tab: InspectableTab,
  controlStatus: ControlStatus,
  platform: BrowserPlatform,
  now: Date,
): TabInspection => {
  if (tab.id === null || tab.url === null) {
    return {
      controlStatus,
      platform,
      reason: 'NO_ACTIVE_TAB',
      supported: false,
    }
  }
  const normalized = normalizeUrl(tab.url)
  if (!normalized.ok) {
    return {
      controlStatus,
      platform,
      reason: 'UNSUPPORTED_URL',
      supported: false,
    }
  }
  return {
    controlStatus,
    decision: resolveRoute(snapshot, {
      incognito: tab.incognito,
      now,
      platform,
      tabId: tab.id,
      url: tab.url,
    }),
    hostname: normalized.value.hostname,
    platform,
    scopeWarning: platform === 'CHROMIUM' ? 'CHROMIUM_ORIGIN_SCOPE' : null,
    supported: true,
  }
}
