import { browser } from 'wxt/browser'

import { AuthAttemptTracker } from '../../application/auth/attempt-tracker'
import { matchProxyAuthChallenge } from '../../application/auth/match-challenge'
import type { RoutingSnapshot } from '../../domain/routing/snapshot'
import type { BrowserPlatform } from '../../domain/types/entities'

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

export interface AuthListenerOptions {
  readonly platform: BrowserPlatform
  readonly getSnapshot: () => RoutingSnapshot | null
  readonly onFailure: (failure: AuthFailure) => void
  readonly timeoutMs?: number
}

export const registerProxyAuthListeners = (options: AuthListenerOptions): (() => void) => {
  const tracker = new AuthAttemptTracker(options.timeoutMs ?? 120_000, Date.now)

  const onAuthRequired = (
    details: AuthChallengeDetails,
    callback?: AuthCallback,
  ): BlockingResponse | undefined => {
    const respond = (response: BlockingResponse = {}): BlockingResponse | undefined => {
      if (callback !== undefined) {
        callback(response)
        return undefined
      }
      return response
    }
    const snapshot = options.getSnapshot()
    if (snapshot === null || details.challenger === undefined || details.isProxy !== true) {
      return respond()
    }
    const match = matchProxyAuthChallenge(
      snapshot,
      options.platform,
      {
        challengerHost: details.challenger.host,
        challengerPort: details.challenger.port,
        incognito: details.incognito ?? false,
        isProxy: details.isProxy,
        requestId: details.requestId,
        tabId: details.tabId,
        url: details.url,
      },
      new Date(),
    )
    if (!match.matched) {
      return respond()
    }
    if (tracker.begin(details.requestId) === 'REJECTED') {
      options.onFailure({
        code: 'PROXY_AUTHENTICATION_FAILED',
        requestId: details.requestId,
        tabId: details.tabId,
        url: details.url,
      })
      return respond({ cancel: true })
    }
    return respond({
      authCredentials: {
        password: match.password,
        username: match.username,
      },
    })
  }

  const cleanup = (details: { requestId: string }): void => {
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
    tracker.clear()
  }
}
