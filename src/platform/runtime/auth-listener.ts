import { browser } from 'wxt/browser'

import { AuthAttemptTracker } from '../../application/auth/attempt-tracker'
import { matchProxyAuthChallenge } from '../../application/auth/match-challenge'
import type { RoutingSnapshot } from '../../domain/routing/snapshot'
import type { BrowserPlatform } from '../../domain/types/entities'
import { resolveRequestIncognitoContext } from './request-incognito'

interface AuthFailure {
  readonly requestId: string
  readonly tabId: number
  readonly url: string
  readonly code: 'PROXY_AUTHENTICATION_FAILED'
}

interface AuthChallengeDetails {
  readonly challenger?: {
    readonly host: string
    readonly port: number
  }
  readonly incognito?: boolean
  readonly isProxy?: boolean
  readonly requestId: string
  readonly tabId: number
  readonly url: string
}

interface BlockingResponse {
  readonly cancel?: boolean
  readonly authCredentials?: {
    readonly username: string
    readonly password: string
  }
}

type AuthCallback = (response: BlockingResponse) => void

interface PendingAuthResponse {
  readonly cancelSnapshotWait: () => void
  readonly requestId: string
  readonly respondEmpty: () => void
}

interface ReadySnapshotWait {
  readonly cancel: () => void
  readonly result: Promise<ReadyAuthContext | null>
}

interface ReadyAuthContext {
  readonly incognito: boolean
  readonly snapshot: RoutingSnapshot
}

export interface AuthListenerOptions {
  readonly platform: BrowserPlatform
  readonly getSnapshot: () => RoutingSnapshot | null
  readonly isSnapshotActive: (incognito: boolean) => Promise<boolean>
  readonly waitForSnapshot: () => Promise<RoutingSnapshot | null>
  readonly onFailure: (failure: AuthFailure) => void
  readonly snapshotWaitTimeoutMs?: number
  readonly timeoutMs?: number
}

const DEFAULT_SNAPSHOT_WAIT_TIMEOUT_MS = 2_000

const resolveActiveSnapshot = async (
  options: AuthListenerOptions,
  details: Pick<AuthChallengeDetails, 'incognito' | 'tabId'>,
): Promise<ReadyAuthContext | null> => {
  const incognito = await resolveRequestIncognitoContext(details)
  if (incognito === null) return null
  const candidate = options.getSnapshot() ?? (await options.waitForSnapshot())
  if (candidate === null || !(await options.isSnapshotActive(incognito))) return null
  return options.getSnapshot() === candidate ? { incognito, snapshot: candidate } : null
}

const createReadySnapshotWait = (
  options: AuthListenerOptions,
  details: Pick<AuthChallengeDetails, 'incognito' | 'tabId'>,
): ReadySnapshotWait => {
  let settled = false
  let resolveResult!: (context: ReadyAuthContext | null) => void
  const result = new Promise<ReadyAuthContext | null>((resolve) => {
    resolveResult = resolve
  })
  const settle = (context: ReadyAuthContext | null): void => {
    if (settled) return
    settled = true
    clearTimeout(timeout)
    resolveResult(context)
  }
  const timeout = setTimeout(
    () => settle(null),
    options.snapshotWaitTimeoutMs ?? DEFAULT_SNAPSHOT_WAIT_TIMEOUT_MS,
  )
  try {
    void resolveActiveSnapshot(options, details).then(settle, () => settle(null))
  } catch {
    settle(null)
  }
  return {
    cancel: () => settle(null),
    result,
  }
}

export const registerProxyAuthListeners = (options: AuthListenerOptions): (() => void) => {
  const tracker = new AuthAttemptTracker(options.timeoutMs ?? 120_000, Date.now)
  const pendingResponses = new Set<PendingAuthResponse>()

  const answerChallenge = (
    snapshot: RoutingSnapshot,
    details: AuthChallengeDetails,
    incognito: boolean,
  ): BlockingResponse => {
    if (details.challenger === undefined) return {}
    const match = matchProxyAuthChallenge(
      snapshot,
      options.platform,
      {
        challengerHost: details.challenger.host,
        challengerPort: details.challenger.port,
        incognito,
        isProxy: details.isProxy ?? false,
        requestId: details.requestId,
        tabId: details.tabId,
        url: details.url,
      },
      new Date(),
    )
    if (!match.matched) return {}
    if (tracker.begin(details.requestId) === 'REJECTED') {
      options.onFailure({
        code: 'PROXY_AUTHENTICATION_FAILED',
        requestId: details.requestId,
        tabId: details.tabId,
        url: details.url,
      })
      return { cancel: true }
    }
    return {
      authCredentials: {
        password: match.password,
        username: match.username,
      },
    }
  }

  const onAuthRequired = (
    details: AuthChallengeDetails,
    callback?: AuthCallback,
  ): BlockingResponse | undefined => {
    let callbackInvoked = false
    const respond = (response: BlockingResponse = {}): BlockingResponse | undefined => {
      if (callback !== undefined) {
        if (!callbackInvoked) {
          callbackInvoked = true
          callback(response)
        }
        return undefined
      }
      return response
    }
    if (details.challenger === undefined || details.isProxy !== true) {
      return respond()
    }
    if (options.platform !== 'CHROMIUM') {
      const snapshot = options.getSnapshot()
      return respond(
        snapshot === null ? {} : answerChallenge(snapshot, details, details.incognito ?? false),
      )
    }
    if (callback === undefined) return respond()

    const snapshotWait = createReadySnapshotWait(options, details)
    const pendingResponse: PendingAuthResponse = {
      cancelSnapshotWait: snapshotWait.cancel,
      requestId: details.requestId,
      respondEmpty: () => {
        respond()
      },
    }
    pendingResponses.add(pendingResponse)
    void snapshotWait.result.then((readyContext) => {
      if (!pendingResponses.delete(pendingResponse)) return
      respond(
        readyContext === null
          ? {}
          : answerChallenge(readyContext.snapshot, details, readyContext.incognito),
      )
    })
    return undefined
  }

  const cleanup = (details: { requestId: string }): void => {
    for (const pendingResponse of pendingResponses) {
      if (pendingResponse.requestId !== details.requestId) continue
      pendingResponses.delete(pendingResponse)
      pendingResponse.cancelSnapshotWait()
      pendingResponse.respondEmpty()
    }
    tracker.complete(details.requestId)
  }

  const authExtraInfoSpec = options.platform === 'FIREFOX' ? ['blocking'] : ['asyncBlocking']
  browser.webRequest.onAuthRequired.addListener(
    onAuthRequired,
    { urls: ['<all_urls>'] },
    authExtraInfoSpec as ['asyncBlocking'],
  )
  browser.webRequest.onCompleted.addListener(cleanup, {
    urls: ['<all_urls>'],
  })
  browser.webRequest.onErrorOccurred.addListener(cleanup, {
    urls: ['<all_urls>'],
  })

  return () => {
    browser.webRequest.onAuthRequired.removeListener(onAuthRequired)
    browser.webRequest.onCompleted.removeListener(cleanup)
    browser.webRequest.onErrorOccurred.removeListener(cleanup)
    for (const pendingResponse of pendingResponses) {
      pendingResponses.delete(pendingResponse)
      pendingResponse.cancelSnapshotWait()
      pendingResponse.respondEmpty()
    }
    tracker.clear()
  }
}
