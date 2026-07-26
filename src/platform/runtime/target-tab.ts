export interface TargetTab {
  readonly id?: number | undefined
  readonly incognito: boolean
  readonly url?: string | undefined
}

export interface TargetTabsApi<Tab extends TargetTab> {
  get(tabId: number): Promise<Tab>
  query(queryInfo: { readonly active?: boolean; readonly currentWindow?: boolean }): Promise<Tab[]>
}

export const resolveTargetTab = async <Tab extends TargetTab>(
  tabs: TargetTabsApi<Tab>,
  tabId?: number,
): Promise<Tab | undefined> => {
  if (tabId === undefined) {
    const [tab] = await tabs.query({ active: true, currentWindow: true })
    return tab
  }
  if (!Number.isSafeInteger(tabId) || tabId < 0) {
    throw new Error('INVALID_TAB_ID')
  }

  try {
    return await tabs.get(tabId)
  } catch (getError) {
    const visibleTabs = await tabs.query({})
    const matchingTab = visibleTabs.find((tab) => tab.id === tabId)
    if (matchingTab !== undefined) return matchingTab
    throw getError
  }
}
