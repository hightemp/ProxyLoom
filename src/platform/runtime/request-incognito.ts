import { browser } from 'wxt/browser'

import { resolveTargetTab, type TargetTabsApi } from './target-tab'

export interface RequestIncognitoDetails {
  readonly incognito?: boolean
  readonly tabId: number
}

export interface IncognitoTab {
  readonly id?: number | undefined
  readonly incognito: boolean
}

export const resolveRequestIncognitoContext = async (
  details: RequestIncognitoDetails,
  tabs: TargetTabsApi<IncognitoTab> = browser.tabs,
): Promise<boolean | null> => {
  if (details.incognito !== undefined) {
    return details.incognito
  }
  if (details.tabId < 0) {
    return false
  }
  try {
    return (await resolveTargetTab(tabs, details.tabId))?.incognito ?? null
  } catch {
    return null
  }
}

export const resolveRequestIncognito = async (
  details: RequestIncognitoDetails,
  tabs: TargetTabsApi<IncognitoTab> = browser.tabs,
): Promise<boolean> => (await resolveRequestIncognitoContext(details, tabs)) ?? false
