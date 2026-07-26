import type { TargetScheme } from '../types/entities'
import { err, ok, type Result } from '../types/result'

const SUPPORTED_SCHEMES = new Set<TargetScheme>(['http', 'https', 'ws', 'wss'])

export type UrlNormalizationCode = 'INVALID_URL' | 'UNSUPPORTED_SCHEME' | 'MISSING_HOSTNAME'

export interface UrlNormalizationError {
  readonly code: UrlNormalizationCode
  readonly input: string
}

export interface NormalizedUrl {
  readonly scheme: TargetScheme
  readonly hostname: string
  readonly port: string
  readonly originTarget: string
  readonly fullUrlTarget: string
}

const parseSupportedUrl = (input: string): Result<URL, UrlNormalizationError> => {
  let parsed: URL
  try {
    parsed = new URL(input)
  } catch {
    return err({ code: 'INVALID_URL', input })
  }

  const scheme = parsed.protocol.slice(0, -1).toLowerCase()
  if (!SUPPORTED_SCHEMES.has(scheme as TargetScheme)) {
    return err({ code: 'UNSUPPORTED_SCHEME', input })
  }
  if (parsed.hostname.length === 0) {
    return err({ code: 'MISSING_HOSTNAME', input })
  }
  return ok(parsed)
}

export const normalizeUrl = (input: string): Result<NormalizedUrl, UrlNormalizationError> => {
  const result = parseSupportedUrl(input)
  if (!result.ok) {
    return result
  }

  const parsed = result.value
  parsed.username = ''
  parsed.password = ''
  parsed.hash = ''

  const scheme = parsed.protocol.slice(0, -1).toLowerCase() as TargetScheme
  const hostname = parsed.hostname.toLowerCase()
  const port = parsed.port
  const authority = port.length > 0 ? `${hostname}:${port}` : hostname
  const originTarget = `${scheme}://${authority}/`

  return ok({
    fullUrlTarget: parsed.href,
    hostname,
    originTarget,
    port,
    scheme,
  })
}

export const normalizeOrigin = (input: string): Result<string, UrlNormalizationError> => {
  const result = normalizeUrl(input)
  return result.ok ? ok(result.value.originTarget) : result
}

export const normalizeFullUrl = (input: string): Result<string, UrlNormalizationError> => {
  const result = normalizeUrl(input)
  return result.ok ? ok(result.value.fullUrlTarget) : result
}

export const endpointTargetForScheme = (scheme: TargetScheme): 'HTTP' | 'HTTPS' =>
  scheme === 'http' || scheme === 'ws' ? 'HTTP' : 'HTTPS'
