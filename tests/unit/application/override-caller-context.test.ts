import { describe, expect, it } from 'vitest'

import {
  callerIncognito,
  visibleOverrides,
} from '../../../src/application/overrides/caller-context'
import { override } from '../domain/fixtures'

describe('override caller context', () => {
  it('uses the sender tab for extension pages opened in a tab', () => {
    expect(callerIncognito({ tab: { incognito: false } }, { incognito: true })).toBe(false)
    expect(callerIncognito({ tab: { incognito: true } }, { incognito: false })).toBe(true)
  })

  it('uses the target tab for the action popup, which has no sender tab', () => {
    expect(callerIncognito({}, { incognito: true })).toBe(true)
    expect(callerIncognito(undefined, { incognito: false })).toBe(false)
  })

  it('defaults to the normal session when nothing identifies the caller', () => {
    expect(callerIncognito(undefined, undefined)).toBe(false)
  })

  it('never exposes private overrides to a normal caller or vice versa', () => {
    const normal = override({ id: 'n' as never, incognito: false })
    const privateOne = override({ id: 'p' as never, incognito: true })
    expect(visibleOverrides([normal, privateOne], false)).toEqual([normal])
    expect(visibleOverrides([normal, privateOne], true)).toEqual([privateOne])
  })
})

describe('runtime state scoped to the caller session', () => {
  it('drops private overrides and the private target tab from a normal caller', async () => {
    const { runtimeState } = await import('../ui/support')
    const { scopeStateToCaller } = await import('../../../src/application/overrides/caller-context')
    const normal = override({ id: 'n' as never, incognito: false })
    const privateOne = override({ id: 'p' as never, incognito: true })
    const state = runtimeState(
      {},
      {
        activeTabId: 9,
        activeTabIncognito: true,
        activeTabUrl: 'https://private.example/',
        inspection: { reason: 'UNSUPPORTED_URL', supported: false } as never,
        overrides: [normal, privateOne],
      },
    )

    const scoped = scopeStateToCaller(state, false)
    expect(scoped.overrides).toEqual([normal])
    expect(scoped).toMatchObject({
      activeTabId: null,
      activeTabIncognito: false,
      activeTabUrl: null,
      inspection: null,
    })

    const privateScoped = scopeStateToCaller(state, true)
    expect(privateScoped.overrides).toEqual([privateOne])
    expect(privateScoped.activeTabUrl).toBe('https://private.example/')
  })
})
