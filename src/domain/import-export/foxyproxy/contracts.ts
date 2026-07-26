import type { ProxyTransport } from '../../types/entities'
import type { SafeJsonError } from '../safe-json'

export type FoxyProxyAdapterId = 'FOXYPROXY_8_PLUS' | 'FOXYPROXY_6_7'

export type FoxyProxySkipReason =
  | 'MALFORMED_ENTRY'
  | 'UNSUPPORTED_SOCKS'
  | 'UNSUPPORTED_PAC'
  | 'DIRECT_ENTRY'
  | 'INVALID_HOST'
  | 'INVALID_PORT'

export interface FoxyProxyCandidate {
  readonly sourceIndex: number
  readonly title: string
  readonly color: string
  readonly transport: ProxyTransport
  readonly hostname: string
  readonly port: number
  readonly username: string
  readonly password: string
  readonly active: boolean
}

export interface FoxyProxySkippedEntry {
  readonly sourceIndex: number
  readonly title: string
  readonly reason: FoxyProxySkipReason
}

export interface FoxyProxyParseResult {
  readonly adapter: FoxyProxyAdapterId
  readonly candidates: readonly FoxyProxyCandidate[]
  readonly skipped: readonly FoxyProxySkippedEntry[]
  readonly excludedData: readonly string[]
}

export type FoxyProxyParseError =
  | SafeJsonError
  | {
      readonly code: 'UNSUPPORTED_FORMAT' | 'NO_SUPPORTED_PROFILES'
      readonly issues: readonly string[]
    }
