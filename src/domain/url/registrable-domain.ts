import { getDomain } from 'tldts'

import { err, ok, type Result } from '../types/result'

export type RegistrableDomainErrorCode =
  'INVALID_HOSTNAME' | 'IP_ADDRESS' | 'LOCAL_HOSTNAME' | 'PUBLIC_SUFFIX'

export interface RegistrableDomainError {
  readonly code: RegistrableDomainErrorCode
  readonly hostname: string
}

const isIpAddress = (hostname: string): boolean => {
  const bareHostname = hostname.replace(/^\[|\]$/g, '')
  if (bareHostname.includes(':')) {
    return /^[0-9a-f:.]+$/i.test(bareHostname)
  }
  const parts = bareHostname.split('.')
  return parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
}

export const registrableDomain = (hostname: string): Result<string, RegistrableDomainError> => {
  const normalized = hostname.trim().toLowerCase().replace(/\.$/, '')
  if (normalized.length === 0 || normalized.includes('/')) {
    return err({ code: 'INVALID_HOSTNAME', hostname })
  }
  if (isIpAddress(normalized)) {
    return err({ code: 'IP_ADDRESS', hostname: normalized })
  }
  if (!normalized.includes('.') || normalized === 'localhost') {
    return err({ code: 'LOCAL_HOSTNAME', hostname: normalized })
  }
  const domain = getDomain(normalized, { allowPrivateDomains: true })
  if (domain === null) {
    return err({ code: 'PUBLIC_SUFFIX', hostname: normalized })
  }
  return ok(domain)
}
