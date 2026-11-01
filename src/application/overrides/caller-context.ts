import type { TemporaryOverride } from '../../domain/types/entities'
import type { AppRuntimeState } from '../runtime/contracts'

interface TabLike {
  readonly incognito?: boolean | undefined
}

/**
 * Session (normal or private) of the extension page that sent a runtime message. Options and error
 * pages run in a tab; the action popup has no sender tab, so the tab it acts on decides.
 */
export const callerIncognito = (
  sender: { readonly tab?: TabLike | undefined } | undefined,
  targetTab: TabLike | undefined,
): boolean => sender?.tab?.incognito ?? targetTab?.incognito ?? false

/** Normal and private overrides never mix in what a caller can see (FR-058, FR-074). */
export const visibleOverrides = (
  overrides: readonly TemporaryOverride[],
  incognito: boolean,
): readonly TemporaryOverride[] => overrides.filter((override) => override.incognito === incognito)

/**
 * Removes everything from another session before a runtime state leaves the background: the
 * other session's overrides and, when the target tab belongs to that session, its URL and route.
 */
export const scopeStateToCaller = (state: AppRuntimeState, incognito: boolean): AppRuntimeState => {
  const overrides = visibleOverrides(state.overrides, incognito)
  if (state.activeTabIncognito === incognito) return { ...state, overrides }
  return {
    ...state,
    activeTabId: null,
    activeTabIncognito: incognito,
    activeTabUrl: null,
    inspection: null,
    overrides,
  }
}
