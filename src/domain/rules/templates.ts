export type RuleTemplateId =
  | 'EXACT_HOSTNAME'
  | 'DOMAIN_AND_SUBDOMAINS'
  | 'DOMAIN_SUFFIXES'
  | 'RUSSIAN_DOMAINS'
  | 'SOCIAL_NETWORKS'
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
  readonly domainSuffixes?: string
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

export interface NamedRuleTemplatePreset {
  readonly description: string
  readonly name: string
  readonly testUrls: readonly string[]
}

export const RUSSIAN_DOMAIN_SUFFIXES = '.ru, .рф, .su'

export const SOCIAL_NETWORK_DOMAINS = [
  'vk.com',
  'vk.ru',
  'vk.me',
  'userapi.com',
  'ok.ru',
  'odnoklassniki.ru',
  'facebook.com',
  'fb.com',
  'fb.me',
  'fbcdn.net',
  'messenger.com',
  'instagram.com',
  'cdninstagram.com',
  'threads.net',
  'x.com',
  'twitter.com',
  't.co',
  'twimg.com',
  'tiktok.com',
  'tiktokcdn.com',
  'tiktokv.com',
  'linkedin.com',
  'licdn.com',
  'reddit.com',
  'redd.it',
  'redditstatic.com',
  'pinterest.com',
  'pinimg.com',
  'snapchat.com',
  'sc-cdn.net',
  'telegram.org',
  'telegram.me',
  't.me',
  'discord.com',
  'discord.gg',
  'discordapp.com',
  'discordapp.net',
  'youtube.com',
  'youtu.be',
  'ytimg.com',
  'googlevideo.com',
] as const

export const NAMED_RULE_TEMPLATE_PRESETS: Readonly<
  Partial<Record<RuleTemplateId, NamedRuleTemplatePreset>>
> = {
  RUSSIAN_DOMAINS: {
    description: 'Matches Russian country-code domains (.ru, .рф, and .su), including subdomains.',
    name: 'Russian Sites example',
    testUrls: ['https://yandex.ru/', 'https://пример.рф/', 'https://example.ru.com/'],
  },
  SOCIAL_NETWORKS: {
    description:
      'Matches major social-network websites and their common supporting domains. Review the editable pattern as services change.',
    name: 'Social Networks example',
    testUrls: ['https://vk.com/', 'https://www.instagram.com/', 'https://example.com/'],
  },
}

export const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const requiredHostname = (input: RuleTemplateInput): string => {
  const hostname = input.hostname?.trim()
  if (hostname === undefined || hostname.length === 0) {
    throw new Error('A hostname is required for this template.')
  }
  return hostname.toLowerCase()
}

const normalizeDomainSuffix = (value: string): string => {
  const suffix = value.trim().replace(/^\.+/u, '')
  if (suffix.length === 0 || suffix.endsWith('.') || /[/:@?#[\]\\]/u.test(suffix)) {
    throw new Error('Enter valid domain suffixes separated by commas.')
  }

  let hostname: string
  try {
    hostname = new URL(`https://${suffix}/`).hostname.toLowerCase()
  } catch {
    throw new Error('Enter valid domain suffixes separated by commas.')
  }

  const dnsName =
    /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*$/u
  if (hostname.length > 253 || !dnsName.test(hostname)) {
    throw new Error('Enter valid domain suffixes separated by commas.')
  }
  return hostname
}

const requiredDomainSuffixes = (input: RuleTemplateInput): readonly string[] => {
  const values = input.domainSuffixes?.split(/[,\n]/u) ?? []
  const suffixes = [
    ...new Set(values.filter((value) => value.trim().length > 0).map(normalizeDomainSuffix)),
  ]
  if (suffixes.length === 0) {
    throw new Error('Enter at least one domain suffix.')
  }
  return suffixes
}

const domainAndSubdomainsPattern = (domains: readonly string[]): string => {
  const alternatives = domains.map((domain) => escapeRegex(domain)).join('|')
  return `^(?:https?|wss?)://(?:[^./:]+\\.)*(?:${alternatives})(?::\\d+)?/$`
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
    case 'DOMAIN_SUFFIXES': {
      const suffixes = requiredDomainSuffixes(input).map(escapeRegex).join('|')
      return {
        flags: 'i',
        matcherType: 'ORIGIN',
        pattern: `^(?:https?|wss?)://(?:[^./:]+\\.)+(?:${suffixes})(?::\\d+)?/$`,
      }
    }
    case 'RUSSIAN_DOMAINS':
      return generateRuleTemplate('DOMAIN_SUFFIXES', {
        domainSuffixes: RUSSIAN_DOMAIN_SUFFIXES,
      })
    case 'SOCIAL_NETWORKS':
      return {
        flags: 'i',
        matcherType: 'ORIGIN',
        pattern: domainAndSubdomainsPattern(SOCIAL_NETWORK_DOMAINS),
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
