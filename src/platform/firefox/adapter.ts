import { browser } from 'wxt/browser'

import { resolveRoute } from '../../domain/routing/resolver'
import type { RoutingSnapshot } from '../../domain/routing/snapshot'
import type { ControlStatus } from '../../domain/types/entities'
import { err, ok, type Result } from '../../domain/types/result'
import type {
  PlatformApplyError,
  ProxyPlatformAdapter,
} from '../../application/ports/proxy-platform'

type FirefoxProxyInfo = {
  readonly type: 'direct' | 'http' | 'https'
  readonly host?: string
  readonly port?: number
}

type FirefoxProxyResult = FirefoxProxyInfo | null | undefined
type FirefoxProxyListenerResult = FirefoxProxyResult | Promise<FirefoxProxyResult>

interface FirefoxRequestDetails {
  readonly url: string
  readonly tabId: number
  readonly incognito?: boolean
}

type FirefoxRouteState =
  | { readonly kind: 'INITIALIZING' }
  | { readonly kind: 'DIRECT' }
  | { readonly kind: 'FAILED' }
  | { readonly kind: 'SNAPSHOT'; readonly snapshot: RoutingSnapshot }

interface FirefoxProxyApi {
  onRequest: {
    addListener(
      listener: (details: FirefoxRequestDetails) => FirefoxProxyListenerResult,
      filter: { urls: string[] },
    ): void
  }
  settings: {
    get(details: { incognito: boolean }): Promise<{
      levelOfControl?:
        | 'not_controllable'
        | 'controlled_by_other_extensions'
        | 'controllable_by_this_extension'
        | 'controlled_by_this_extension'
    }>
    set(details: { value: { proxyType: 'none' }; scope?: 'regular' }): Promise<void>
  }
}

const proxyApi = (): FirefoxProxyApi => (browser as unknown as { proxy: FirefoxProxyApi }).proxy
const INITIALIZATION_TIMEOUT_MS = 2_000
const FAIL_CLOSED_PROXY = { host: '127.0.0.1', port: 9, type: 'http' } as const

type LevelOfControl =
  | 'not_controllable'
  | 'controlled_by_other_extensions'
  | 'controllable_by_this_extension'
  | 'controlled_by_this_extension'

const mapControlStatus = (level: LevelOfControl | undefined): ControlStatus => {
  switch (level) {
    case 'controlled_by_this_extension':
      return 'CONTROLLED_BY_THIS_EXTENSION'
    case 'controllable_by_this_extension':
      return 'CONTROLLABLE'
    case 'controlled_by_other_extensions':
      return 'CONTROLLED_BY_OTHER_EXTENSION'
    case 'not_controllable':
      return 'NOT_CONTROLLABLE'
    default:
      return 'CONTROLLABLE'
  }
}

export class FirefoxProxyAdapter implements ProxyPlatformAdapter {
  readonly capabilities = {
    actualProxyInfo: false,
    fullUrlRules: true,
    guaranteedErrorPage: false,
    platform: 'FIREFOX',
    tabSpecificOverrides: true,
  } as const

  #initialization: Promise<void>
  #resolveInitialization: (() => void) | null = null
  #listenerRegistered = false
  #routeState: FirefoxRouteState = { kind: 'INITIALIZING' }

  constructor() {
    this.#initialization = new Promise((resolve) => {
      this.#resolveInitialization = resolve
    })
    // Firefox MV3 uses a non-persistent event page. Listeners that should wake it must be
    // registered synchronously during startup, before any storage or settings await.
    this.registerListener()
  }

  async getControlStatus(): Promise<ControlStatus> {
    try {
      const settings = await proxyApi().settings.get({ incognito: false })
      return mapControlStatus(settings.levelOfControl)
    } catch {
      return 'NOT_CONTROLLABLE'
    }
  }

  async applyDirect(revision: number): Promise<Result<number, PlatformApplyError>> {
    try {
      await proxyApi().settings.set({
        scope: 'regular',
        value: { proxyType: 'none' },
      })
      this.setRouteState({ kind: 'DIRECT' })
      return ok(revision)
    } catch (error) {
      this.setRouteState({ kind: 'FAILED' })
      return err({
        code: 'API_ERROR',
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async applySnapshot(snapshot: RoutingSnapshot): Promise<Result<number, PlatformApplyError>> {
    try {
      await proxyApi().settings.set({
        scope: 'regular',
        value: { proxyType: 'none' },
      })
      this.setRouteState({ kind: 'SNAPSHOT', snapshot })
      return ok(snapshot.revision)
    } catch (error) {
      this.setRouteState({ kind: 'FAILED' })
      return err({
        code: 'API_ERROR',
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  private registerListener(): void {
    if (this.#listenerRegistered) {
      return
    }
    proxyApi().onRequest.addListener((details) => this.routeRequest(details), {
      urls: ['<all_urls>'],
    })
    this.#listenerRegistered = true
  }

  private routeRequest(details: FirefoxRequestDetails): FirefoxProxyListenerResult {
    if (this.#routeState.kind === 'INITIALIZING') {
      return Promise.race([
        this.#initialization,
        new Promise<void>((resolve) => {
          setTimeout(resolve, INITIALIZATION_TIMEOUT_MS)
        }),
      ]).then(() => this.routeReadyRequest(details))
    }
    return this.routeReadyRequest(details)
  }

  private routeReadyRequest(details: FirefoxRequestDetails): FirefoxProxyResult {
    const state = this.#routeState
    if (state.kind === 'INITIALIZING' || state.kind === 'FAILED') {
      return FAIL_CLOSED_PROXY
    }
    if (state.kind === 'DIRECT') {
      return null
    }

    const snapshot = state.snapshot
    const decision = resolveRoute(snapshot, {
      incognito: details.incognito ?? false,
      now: new Date(),
      platform: 'FIREFOX',
      tabId: details.tabId >= 0 ? details.tabId : null,
      url: details.url,
    })
    if (decision.action === 'DIRECT') {
      return null
    }
    if (decision.action === 'CONFIG_ERROR' || decision.endpoint === null) {
      return FAIL_CLOSED_PROXY
    }
    return {
      host: decision.endpoint.host,
      port: decision.endpoint.port,
      type: decision.endpoint.transport === 'HTTPS' ? 'https' : 'http',
    }
  }

  private setRouteState(state: FirefoxRouteState): void {
    this.#routeState = state
    this.#resolveInitialization?.()
    this.#resolveInitialization = null
  }
}
