import type { ProxyEndpoint, ProxyProfile } from '../types/entities'
import { err, ok, type Result } from '../types/result'

const HOST_PATTERN =
  /^(?:\[[0-9a-f:.]+\]|(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)$/i
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i
const SHORT_NAME_PATTERN = /^[a-z0-9]{1,3}$/i

export type ProfileValidationCode =
  | 'NAME_REQUIRED'
  | 'SHORT_NAME_INVALID'
  | 'COLOR_INVALID'
  | 'CHECK_URL_INVALID'
  | 'HOST_INVALID'
  | 'PORT_INVALID'

export interface ProfileValidationError {
  readonly code: ProfileValidationCode
  readonly field: string
}

const validateEndpoint = (
  endpoint: ProxyEndpoint,
  fieldPrefix: string,
): ProfileValidationError | null => {
  const host = endpoint.host.trim()
  if (!HOST_PATTERN.test(host)) {
    return { code: 'HOST_INVALID', field: `${fieldPrefix}.host` }
  }
  if (!Number.isInteger(endpoint.port) || endpoint.port < 1 || endpoint.port > 65_535) {
    return { code: 'PORT_INVALID', field: `${fieldPrefix}.port` }
  }
  return null
}

export const validateProxyProfile = (
  profile: ProxyProfile,
): Result<ProxyProfile, ProfileValidationError> => {
  if (profile.name.trim().length === 0) {
    return err({ code: 'NAME_REQUIRED', field: 'name' })
  }
  if (profile.shortName !== null && !SHORT_NAME_PATTERN.test(profile.shortName)) {
    return err({ code: 'SHORT_NAME_INVALID', field: 'shortName' })
  }
  if (!COLOR_PATTERN.test(profile.color)) {
    return err({ code: 'COLOR_INVALID', field: 'color' })
  }
  try {
    const url = new URL(profile.checkUrl)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return err({ code: 'CHECK_URL_INVALID', field: 'checkUrl' })
    }
  } catch {
    return err({ code: 'CHECK_URL_INVALID', field: 'checkUrl' })
  }

  const httpError = validateEndpoint(profile.httpEndpoint, 'httpEndpoint')
  if (httpError !== null) {
    return err(httpError)
  }
  const httpsError = validateEndpoint(profile.httpsEndpoint, 'httpsEndpoint')
  if (httpsError !== null) {
    return err(httpsError)
  }
  return ok(profile)
}

const cleanName = (name: string): string =>
  name
    .normalize('NFKD')
    .replace(/[^a-z0-9 ]/gi, ' ')
    .trim()

export const generateShortName = (
  name: string,
  existing: ReadonlySet<string> = new Set(),
): string => {
  const words = cleanName(name).split(/\s+/).filter(Boolean)
  const initials = words.map((word) => word[0]).join('')
  const compact = words.join('')
  const base = (initials.length >= 2 ? initials : compact).slice(0, 3).toUpperCase() || 'P'

  if (!existing.has(base)) {
    return base
  }
  for (let suffix = 2; suffix <= 9; suffix += 1) {
    const candidate = `${base.slice(0, 2)}${suffix}`.slice(0, 3)
    if (!existing.has(candidate)) {
      return candidate
    }
  }
  return base
}

export const effectiveEndpoint = (
  profile: ProxyProfile,
  target: 'HTTP' | 'HTTPS',
): ProxyEndpoint =>
  target === 'HTTP' || profile.useSameProxy ? profile.httpEndpoint : profile.httpsEndpoint

export const redactedProfile = (
  profile: ProxyProfile,
): Omit<ProxyProfile, 'httpEndpoint' | 'httpsEndpoint'> & {
  readonly httpEndpoint: Omit<ProxyEndpoint, 'username' | 'password'>
  readonly httpsEndpoint: Omit<ProxyEndpoint, 'username' | 'password'>
} => ({
  ...profile,
  httpEndpoint: {
    host: profile.httpEndpoint.host,
    port: profile.httpEndpoint.port,
    transport: profile.httpEndpoint.transport,
  },
  httpsEndpoint: {
    host: profile.httpsEndpoint.host,
    port: profile.httpsEndpoint.port,
    transport: profile.httpsEndpoint.transport,
  },
})
