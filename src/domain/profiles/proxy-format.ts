import type { ProxyEndpoint, ProxyProfile } from '../types/entities'

/** Text forms a profile can be copied or exported as. Credentials are included as entered. */
export type ProxyTextFormat = 'URL' | 'CURL' | 'COMPACT'

/** `scheme://user:pass@host:port`; userinfo is percent-encoded so it parses back unchanged. */
// `socks5h` states proxy-side DNS, which is what ProxyLoom does for SOCKS5 (ADR-016).
const URL_SCHEME = { HTTP: 'http', HTTPS: 'https', SOCKS5: 'socks5h' } as const
const COMPACT_SUFFIX = { HTTP: '', HTTPS: ' https', SOCKS5: ' socks5' } as const

export const formatProxyUrl = (endpoint: ProxyEndpoint): string => {
  const scheme = URL_SCHEME[endpoint.transport]
  const userInfo =
    endpoint.username === ''
      ? ''
      : `${encodeURIComponent(endpoint.username)}${
          endpoint.password === '' ? '' : `:${encodeURIComponent(endpoint.password)}`
        }@`
  return `${scheme}://${userInfo}${endpoint.host}:${endpoint.port}`
}

// Characters that would change how the compact line is split when it is parsed again.
const COMPACT_UNSAFE = /[:@,;\s]/u

/**
 * `host:port[:user:pass]` with a trailing `https`/`socks5` word, or null when the
 * credentials cannot be written without changing how the line parses.
 */
export const formatProxyCompact = (endpoint: ProxyEndpoint): string | null => {
  const suffix = COMPACT_SUFFIX[endpoint.transport]
  const address = `${endpoint.host}:${endpoint.port}`
  if (endpoint.username === '' && endpoint.password === '') return `${address}${suffix}`
  if (
    endpoint.username === '' ||
    endpoint.password === '' ||
    COMPACT_UNSAFE.test(endpoint.username) ||
    COMPACT_UNSAFE.test(endpoint.password)
  ) {
    return null
  }
  return `${address}:${endpoint.username}:${endpoint.password}${suffix}`
}

/** POSIX shell single-quoting; the result is one literal argument. */
export const shellQuote = (value: string): string => `'${value.replaceAll("'", `'\\''`)}'`

export const formatProxyCurl = (endpoint: ProxyEndpoint, targetUrl: string): string =>
  `curl -x ${shellQuote(formatProxyUrl(endpoint))} ${shellQuote(targetUrl)}`

const formatEndpoint = (
  endpoint: ProxyEndpoint,
  format: ProxyTextFormat,
  targetUrl: string,
): string => {
  switch (format) {
    case 'URL':
      return formatProxyUrl(endpoint)
    case 'CURL':
      return formatProxyCurl(endpoint, targetUrl)
    case 'COMPACT':
      return formatProxyCompact(endpoint) ?? formatProxyUrl(endpoint)
  }
}

/** One line, or two labelled lines when HTTP and HTTPS targets use different endpoints. */
export const formatProfile = (profile: ProxyProfile, format: ProxyTextFormat): string =>
  profile.useSameProxy
    ? formatEndpoint(profile.httpEndpoint, format, profile.checkUrl)
    : [
        '# HTTP/WS targets',
        formatEndpoint(profile.httpEndpoint, format, profile.checkUrl),
        '# HTTPS/WSS targets',
        formatEndpoint(profile.httpsEndpoint, format, profile.checkUrl),
      ].join('\n')

/** Text that the line importer reads back; one record per line, `#` lines are comments. */
export const formatProxyList = (
  profiles: readonly ProxyProfile[],
  format: Exclude<ProxyTextFormat, 'CURL'>,
): string => profiles.map((profile) => `${formatProfile(profile, format)}\n`).join('')
