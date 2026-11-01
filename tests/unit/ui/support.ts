// Side-effect module: import it before any UI module so `wxt/browser` resolves to this stub.
import catalog from '../../../public/_locales/en/messages.json'
import type { AppRuntimeState } from '../../../src/application/runtime/contracts'
import type { AppConfig } from '../../../src/domain/types/entities'
import { config as configFixture } from '../domain/fixtures'

type Catalog = Record<
  string,
  {
    readonly message: string
    readonly placeholders?: Record<string, { readonly content: string }>
  }
>

/** Mirrors chrome.i18n.getMessage named-placeholder and positional substitution rules. */
export const message = (key: string, substitutions?: string | readonly string[]): string => {
  const entry = (catalog as Catalog)[key]
  if (entry === undefined) return ''
  const values = substitutions === undefined ? [] : [substitutions].flat()
  const positional = (text: string): string =>
    text.replace(/\$(\d)/gu, (_, index: string) => values[Number(index) - 1] ?? '')
  return entry.message.replace(/\$([A-Za-z0-9_]+)\$/gu, (_, name: string) =>
    positional(entry.placeholders?.[name.toLowerCase()]?.content ?? ''),
  )
}

const sentMessages: unknown[] = []

Object.assign(globalThis, {
  chrome: {
    i18n: { getMessage: message },
    runtime: {
      id: 'test-extension',
      sendMessage: (request: unknown) => {
        sentMessages.push(request)
        return Promise.resolve({ ok: true, value: null })
      },
    },
  },
})

export const runtimeMessages = sentMessages

export const runtimeState = (
  config: Partial<AppConfig> = {},
  options: Partial<AppRuntimeState> = {},
): AppRuntimeState => ({
  activeTabId: null,
  activeTabIncognito: false,
  activeTabUrl: null,
  config: configFixture(config),
  diagnostics: {
    appVersion: '0.0.0',
    appliedRevision: 1,
    appliedSnapshotHash: null,
    browserUserAgent: 'test',
    capabilities: {
      actualProxyInfo: false,
      fullUrlRules: false,
      guaranteedErrorPage: false,
      platform: 'CHROMIUM',
      tabSpecificOverrides: false,
    },
    controlStatus: 'CONTROLLED_BY_THIS_EXTENSION',
    incognitoAllowed: false,
    incognitoHelp: 'CHROMIUM_EXTENSION_DETAILS',
    invalidOverridesRemoved: 0,
    lastApplyError: null,
    persistedRevision: 1,
    platform: 'CHROMIUM',
    schemaVersion: 3,
  },
  inspection: null,
  logs: [],
  overrides: [],
  privateLogCount: 0,
  ...options,
})
