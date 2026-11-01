import { expect, test } from './fixtures/extension'

interface ExtensionApi {
  readonly runtime: { sendMessage(message: unknown): Promise<unknown> }
  readonly storage: {
    readonly local: { clear(): Promise<void> }
    readonly session: {
      clear(): Promise<void>
      get(key: string): Promise<Record<string, unknown>>
      set(items: Record<string, unknown>): Promise<void>
    }
  }
  readonly tabs: { getCurrent(): Promise<{ id?: number } | undefined> }
}

test('manages Once overrides through the background and hides private ones from a normal page', async ({
  extensionPage,
}) => {
  await extensionPage.evaluate(async () => {
    const api = (globalThis as unknown as { chrome: ExtensionApi }).chrome
    await api.storage.session.clear()
    await api.storage.local.clear()
  })
  await extensionPage.reload()
  await expect(extensionPage.getByRole('heading', { name: 'General' })).toBeVisible()

  const result = await extensionPage.evaluate(async () => {
    const api = (globalThis as unknown as { chrome: ExtensionApi }).chrome
    const tabId = (await api.tabs.getCurrent())?.id ?? 0
    const base = {
      action: { targetProxyProfileId: null, type: 'DIRECT' },
      createdAt: '2026-11-01T00:00:00.000Z',
      expiresOnTabClose: true,
      generatedPattern: '^(?:https?|wss?)://www\\.example\\.co\\.uk(?::\\d+)?/$',
      originKey: 'www.example.co.uk',
      platformScope: 'ORIGIN',
      scope: 'EXACT_HOSTNAME',
      sourceHostname: 'www.example.co.uk',
      sourceTabId: tabId,
    }
    await api.storage.session.set({
      'session.overrides': {
        overrides: [
          { ...base, id: 'normal-once', incognito: false },
          { ...base, id: 'private-once', incognito: true },
        ],
        schemaVersion: 2,
      },
    })
    type State = {
      ok: boolean
      error?: { code: string }
      value?: {
        overrides: { id: string; originKey: string }[]
        config: { rules: { pattern: string; position: number }[] }
      }
    }
    const send = (message: unknown) => api.runtime.sendMessage(message) as Promise<State>

    const initial = await send({ type: 'GET_STATE' })
    const widened = await send({
      overrideId: 'normal-once',
      scope: 'REGISTRABLE_DOMAIN',
      type: 'UPDATE_OVERRIDE',
    })
    const crossSession = await send({
      overrideId: 'private-once',
      scope: 'REGISTRABLE_DOMAIN',
      type: 'UPDATE_OVERRIDE',
    })
    const promoted = await send({ overrideId: 'normal-once', type: 'PROMOTE_OVERRIDE' })
    await send({ type: 'CLEAR_OVERRIDES' })
    const stored = (await api.storage.session.get('session.overrides'))['session.overrides'] as {
      overrides: { id: string }[]
    }
    return {
      crossSession: crossSession.error?.code,
      initialIds: initial.value?.overrides.map((entry) => entry.id),
      promotedOverrides: promoted.value?.overrides.length,
      promotedRule: promoted.value?.config.rules.find((rule) => rule.position === 0)?.pattern,
      storedIds: stored.overrides.map((entry) => entry.id),
      widened: widened.value?.overrides[0]?.originKey,
    }
  })

  expect(result).toEqual({
    crossSession: 'OVERRIDE_NOT_FOUND',
    initialIds: ['normal-once'],
    promotedOverrides: 0,
    promotedRule: '^(?:https?|wss?)://(?:[^./]+\\.)*example\\.co\\.uk(?::\\d+)?/$',
    storedIds: ['private-once'],
    widened: 'example.co.uk',
  })
})
