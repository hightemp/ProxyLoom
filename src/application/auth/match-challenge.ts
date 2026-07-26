import { resolveRoute } from '../../domain/routing/resolver'
import type { RoutingSnapshot } from '../../domain/routing/snapshot'
import type { BrowserPlatform } from '../../domain/types/entities'

export interface ProxyAuthChallenge {
  readonly isProxy: boolean
  readonly requestId: string
  readonly url: string
  readonly tabId: number
  readonly incognito: boolean
  readonly challengerHost: string
  readonly challengerPort: number
}

export type ProxyAuthMatch =
  | {
      readonly matched: true
      readonly profileId: string
      readonly username: string
      readonly password: string
    }
  | {
      readonly matched: false
      readonly reason:
        'NOT_PROXY_CHALLENGE' | 'ROUTE_IS_NOT_PROXY' | 'CHALLENGER_MISMATCH' | 'CREDENTIALS_EMPTY'
    }

const normalizeHost = (host: string): string =>
  host
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')

export const matchProxyAuthChallenge = (
  snapshot: RoutingSnapshot,
  platform: BrowserPlatform,
  challenge: ProxyAuthChallenge,
  now: Date,
): ProxyAuthMatch => {
  if (!challenge.isProxy) {
    return { matched: false, reason: 'NOT_PROXY_CHALLENGE' }
  }
  const decision = resolveRoute(snapshot, {
    incognito: challenge.incognito,
    now,
    platform,
    tabId: challenge.tabId >= 0 ? challenge.tabId : null,
    url: challenge.url,
  })
  if (decision.action !== 'PROXY' || decision.endpoint === null || decision.profileId === null) {
    return { matched: false, reason: 'ROUTE_IS_NOT_PROXY' }
  }
  if (
    normalizeHost(decision.endpoint.host) !== normalizeHost(challenge.challengerHost) ||
    decision.endpoint.port !== challenge.challengerPort
  ) {
    return { matched: false, reason: 'CHALLENGER_MISMATCH' }
  }
  if (decision.endpoint.username.length === 0 && decision.endpoint.password.length === 0) {
    return { matched: false, reason: 'CREDENTIALS_EMPTY' }
  }
  return {
    matched: true,
    password: decision.endpoint.password,
    profileId: decision.profileId,
    username: decision.endpoint.username,
  }
}
