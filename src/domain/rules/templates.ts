export type RuleTemplateId =
  | 'EXACT_HOSTNAME'
  | 'DOMAIN_AND_SUBDOMAINS'
  | 'EXACT_ORIGIN'
  | 'HTTP_ONLY'
  | 'HTTPS_ONLY'
  | 'CUSTOM_PORT'
  | 'LOCALHOST'
  | 'PRIVATE_IPV4'
  | 'FIREFOX_URL_PATH'
  | 'FIREFOX_QUERY_PARAMETER'

export interface RuleTemplateInput {
  readonly hostname?: string
  readonly scheme?: 'http' | 'https' | 'ws' | 'wss'
  readonly port?: number
  readonly path?: string
  readonly queryParameter?: string
}

export interface GeneratedRuleTemplate {
  readonly matcherType: 'ORIGIN' | 'FULL_URL'
  readonly pattern: string
  readonly flags: 'i'
}

export const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const requiredHostname = (input: RuleTemplateInput): string => {
  const hostname = input.hostname?.trim()
  if (hostname === undefined || hostname.length === 0) {
    throw new Error('A hostname is required for this template.')
  }
  return hostname.toLowerCase()
}

export const generateRuleTemplate = (
  id: RuleTemplateId,
  input: RuleTemplateInput = {},
): GeneratedRuleTemplate => {
  switch (id) {
    case 'EXACT_HOSTNAME': {
      const host = escapeRegex(requiredHostname(input))
      return {
        flags: 'i',
        matcherType: 'ORIGIN',
        pattern: `^(?:https?|wss?)://${host}(?::\\d+)?/$`,
      }
    }
    case 'DOMAIN_AND_SUBDOMAINS': {
      const domain = escapeRegex(requiredHostname(input))
      return {
        flags: 'i',
        matcherType: 'ORIGIN',
        pattern: `^(?:https?|wss?)://(?:[^./]+\\.)*${domain}(?::\\d+)?/$`,
      }
    }
    case 'EXACT_ORIGIN': {
      const scheme = input.scheme ?? 'https'
      const host = escapeRegex(requiredHostname(input))
      const port = input.port === undefined ? '' : `:${input.port}`
      return {
        flags: 'i',
        matcherType: 'ORIGIN',
        pattern: `^${scheme}://${host}${escapeRegex(port)}/$`,
      }
    }
    case 'HTTP_ONLY':
      return {
        flags: 'i',
        matcherType: 'ORIGIN',
        pattern: '^http://',
      }
    case 'HTTPS_ONLY':
      return {
        flags: 'i',
        matcherType: 'ORIGIN',
        pattern: '^https://',
      }
    case 'CUSTOM_PORT': {
      const host = escapeRegex(requiredHostname(input))
      if (
        input.port === undefined ||
        !Number.isInteger(input.port) ||
        input.port < 1 ||
        input.port > 65_535
      ) {
        throw new Error('A valid custom port is required for this template.')
      }
      return {
        flags: 'i',
        matcherType: 'ORIGIN',
        pattern: `^(?:https?|wss?)://${host}:${input.port}/$`,
      }
    }
    case 'LOCALHOST':
      return {
        flags: 'i',
        matcherType: 'ORIGIN',
        pattern: '^(?:https?|wss?)://(?:localhost|127\\.0\\.0\\.1|\\[::1\\])(?::\\d+)?/$',
      }
    case 'PRIVATE_IPV4':
      return {
        flags: 'i',
        matcherType: 'ORIGIN',
        pattern:
          '^(?:https?|wss?)://(?:10(?:\\.\\d{1,3}){3}|192\\.168(?:\\.\\d{1,3}){2}|172\\.(?:1[6-9]|2\\d|3[01])(?:\\.\\d{1,3}){2})(?::\\d+)?/$',
      }
    case 'FIREFOX_URL_PATH': {
      const host = escapeRegex(requiredHostname(input))
      const path = escapeRegex(input.path?.replace(/^\/+/, '') ?? '')
      return {
        flags: 'i',
        matcherType: 'FULL_URL',
        pattern: `^https?://${host}(?::\\d+)?/${path}`,
      }
    }
    case 'FIREFOX_QUERY_PARAMETER': {
      const parameter = escapeRegex(input.queryParameter?.trim() ?? '')
      if (parameter.length === 0) {
        throw new Error('A query parameter is required for this template.')
      }
      return {
        flags: 'i',
        matcherType: 'FULL_URL',
        pattern: `[?&]${parameter}=`,
      }
    }
  }
}
