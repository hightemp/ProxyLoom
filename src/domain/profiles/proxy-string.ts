import type { ProxyTransport } from '../types/entities'
import { isValidProxyHost } from './profile'

/** Upper bound for one pasted proxy record. */
export const MAX_PROXY_STRING_LENGTH = 8 * 1024

export type ProxyStringErrorCode =
  | 'EMPTY'
  | 'TOO_LONG'
  | 'CONTROL_CHARACTER'
  | 'FORMAT'
  | 'PORT_REQUIRED'
  | 'PORT_INVALID'
  | 'HOST_REQUIRED'
  | 'HOST_INVALID'
  | 'IPV4_INVALID'
  | 'IPV6_INVALID'
  | 'SCHEME_UNSUPPORTED'
  | 'SOCKS4_UNSUPPORTED'
  | 'SOCKS_AMBIGUOUS'
  | 'PROTOCOL_CONFLICT'
  | 'PROTOCOL_COLUMN_INVALID'
  | 'PATH_NOT_ALLOWED'
  | 'PERCENT_ENCODING_INVALID'
  | 'UTF8_INVALID'
  | 'USERNAME_REQUIRED'
  | 'CREDENTIALS_CONTROL'
  | 'FOUR_FIELDS_INVALID'

/** One proxy record; `transport` is null when the text does not name a protocol. */
export interface ParsedProxyString {
  readonly host: string
  readonly port: number
  readonly transport: ProxyTransport | null
  readonly username: string | null
  readonly password: string | null
}

export type ProxyStringParseResult =
  | { readonly kind: 'SUCCESS'; readonly proxy: ParsedProxyString }
  /** `a:b:c:d` valid both as host:port:user:pass and user:pass:host:port. */
  | {
      readonly kind: 'AMBIGUOUS'
      readonly hostFirst: ParsedProxyString
      readonly credentialsFirst: ParsedProxyString
    }
  | { readonly kind: 'FAILURE'; readonly code: ProxyStringErrorCode }

class ParseFailure extends Error {
  constructor(readonly code: ProxyStringErrorCode) {
    super(code)
  }
}

const fail = (code: ProxyStringErrorCode): never => {
  throw new ParseFailure(code)
}

const success = (proxy: ParsedProxyString): ProxyStringParseResult => ({ kind: 'SUCCESS', proxy })

// Tab separates CSV/TSV columns; every other C0 control or DEL is rejected.
const hasControl = (value: string): boolean =>
  [...value].some((char) => {
    const code = char.charCodeAt(0)
    return (code < 0x20 && code !== 0x09) || code === 0x7f
  })
const isPortText = (value: string): boolean => /^\d+$/u.test(value)

const protocolToken = (value: string): ProxyTransport | null => {
  switch (value.toLowerCase()) {
    case 'http':
      return 'HTTP'
    case 'https':
      return 'HTTPS'
    // Both mean SOCKS5 here: ProxyLoom always resolves names on the proxy (ADR-016).
    case 'socks5':
    case 'socks5h':
      return 'SOCKS5'
    case 'socks4':
    case 'socks4a':
      return fail('SOCKS4_UNSUPPORTED')
    case 'socks':
      return fail('SOCKS_AMBIGUOUS')
    default:
      return null
  }
}

const isIpv4 = (value: string): boolean => {
  const octets = value.split('.')
  return (
    octets.length === 4 && octets.every((octet) => /^\d{1,3}$/u.test(octet) && Number(octet) <= 255)
  )
}

const normalizeHost = (value: string): string => {
  if (value.length === 0) return fail('HOST_REQUIRED')
  if (value.startsWith('[')) {
    if (!/^\[[0-9a-f:.]+\]$/iu.test(value)) return fail('IPV6_INVALID')
    try {
      return new URL(`http://${value}/`).hostname
    } catch {
      return fail('IPV6_INVALID')
    }
  }
  if (value.includes(':')) return fail('IPV6_INVALID')
  if (/^[\d.]+$/u.test(value)) return isIpv4(value) ? value : fail('IPV4_INVALID')
  if (/[^\p{L}\p{N}.-]/u.test(value)) return fail('HOST_INVALID')
  let ascii: string
  try {
    ascii = new URL(`http://${value}/`).hostname.toLowerCase()
  } catch {
    return fail('HOST_INVALID')
  }
  // WHATWG URL turns forms such as `0x7f.1` into IPv4; a proxy host must be written plainly.
  if (/^[\d.]+$/u.test(ascii)) return fail('HOST_INVALID')
  const labels = ascii.replace(/\.$/u, '').split('.')
  const valid =
    ascii.length <= 253 &&
    labels.every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(label))
  return valid && isValidProxyHost(ascii) ? ascii : fail('HOST_INVALID')
}

const buildProxy = (
  hostText: string,
  portText: string,
  username: string | null,
  password: string | null,
  transport: ProxyTransport | null,
): ParsedProxyString => {
  const port = isPortText(portText) ? Number(portText) : Number.NaN
  if (!Number.isInteger(port) || port < 1 || port > 65_535) return fail('PORT_INVALID')
  if ([username, password].some((value) => value !== null && hasControl(value))) {
    return fail('CREDENTIALS_CONTROL')
  }
  if ((username ?? '') === '' && (password ?? '') !== '') return fail('USERNAME_REQUIRED')
  return {
    host: normalizeHost(hostText),
    password: password === '' ? null : password,
    port,
    transport,
    username: username === '' ? null : username,
  }
}

const tryBuild = (
  host: string,
  port: string,
  username: string,
  password: string,
  transport: ProxyTransport | null,
): ParsedProxyString | null => {
  try {
    return buildProxy(host, port, username, password, transport)
  } catch (error) {
    if (error instanceof ParseFailure) return null
    throw error
  }
}

const isDottedHost = (value: string): boolean => {
  if (!value.includes('.')) return false
  try {
    normalizeHost(value)
    return true
  } catch (error) {
    if (error instanceof ParseFailure) return false
    throw error
  }
}

const splitUserInfo = (
  userInfo: string,
  allowAt: boolean,
): readonly [string | null, string | null] => {
  if (/\s/u.test(userInfo) || (!allowAt && userInfo.includes('@'))) return fail('FORMAT')
  const separator = userInfo.indexOf(':')
  const username = separator === -1 ? userInfo : userInfo.slice(0, separator)
  const password = separator === -1 ? null : userInfo.slice(separator + 1)
  return [username === '' ? null : username, password === '' ? null : password]
}

/** `[v6]:port[:user:pass]` with the host kept in brackets. */
const splitBracketed = (record: string): readonly string[] => {
  const end = record.indexOf(']')
  if (end === -1) return fail('IPV6_INVALID')
  const host = record.slice(0, end + 1)
  const rest = record.slice(end + 1)
  if (rest === '') return fail('PORT_REQUIRED')
  if (!rest.startsWith(':')) return fail('FORMAT')
  return [host, ...rest.slice(1).split(':')]
}

const splitHostPort = (value: string): readonly [string, string] => {
  const parts = value.startsWith('[') ? splitBracketed(value) : value.split(':')
  if (parts.length === 1) return fail('PORT_REQUIRED')
  if (parts.length !== 2) return fail('FORMAT')
  return [parts[0]!, parts[1]!]
}

const percentDecode = (value: string): string => {
  if (/%(?![0-9a-f]{2})/iu.test(value)) return fail('PERCENT_ENCODING_INVALID')
  try {
    return decodeURIComponent(value)
  } catch {
    return fail('UTF8_INVALID')
  }
}

const parseUri = (record: string): ParsedProxyString => {
  const schemeEnd = record.indexOf('://')
  const transport = protocolToken(record.slice(0, schemeEnd)) ?? fail('SCHEME_UNSUPPORTED')
  let authority = record.slice(schemeEnd + 3).replace(/\/$/u, '')
  if (/[/?#]/u.test(authority)) return fail('PATH_NOT_ALLOWED')
  let username: string | null = null
  let password: string | null = null
  const at = authority.lastIndexOf('@')
  if (at !== -1) {
    const [rawUsername, rawPassword] = splitUserInfo(authority.slice(0, at), true)
    username = rawUsername === null ? null : percentDecode(rawUsername)
    password = rawPassword === null ? null : percentDecode(rawPassword)
    authority = authority.slice(at + 1)
  }
  const [host, port] = splitHostPort(authority)
  return buildProxy(host, port, username, password, transport)
}

const resolveFourFields = (
  parts: readonly string[],
  transport: ProxyTransport | null,
): ProxyStringParseResult => {
  const [first, second, third, fourth] = parts as [string, string, string, string]
  const hostFirst = isDottedHost(first) ? tryBuild(first, second, third, fourth, transport) : null
  const credentialsFirst = isDottedHost(third)
    ? tryBuild(third, fourth, first, second, transport)
    : null
  if (hostFirst !== null && credentialsFirst !== null) {
    return { credentialsFirst, hostFirst, kind: 'AMBIGUOUS' }
  }
  if (hostFirst !== null) return success(hostFirst)
  if (credentialsFirst !== null) return success(credentialsFirst)
  return fail('FOUR_FIELDS_INVALID')
}

const parseRecord = (
  record: string,
  tokenTransport: ProxyTransport | null,
): ProxyStringParseResult => {
  if (record.includes('://')) {
    const proxy = parseUri(record)
    if (tokenTransport !== null && tokenTransport !== proxy.transport) {
      return fail('PROTOCOL_CONFLICT')
    }
    return success(proxy)
  }
  const atCount = record.split('@').length - 1
  if (atCount > 1) return fail('FORMAT')
  if (atCount === 1) {
    const at = record.indexOf('@')
    const [username, password] = splitUserInfo(record.slice(0, at), false)
    const [host, port] = splitHostPort(record.slice(at + 1))
    return success(buildProxy(host, port, username, password, tokenTransport))
  }
  const parts = record.startsWith('[') ? splitBracketed(record) : record.split(':')
  if (parts.length === 1) return fail('PORT_REQUIRED')
  if (parts.length === 2) {
    return success(buildProxy(parts[0]!, parts[1]!, null, null, tokenTransport))
  }
  if (parts.length === 4) {
    return record.startsWith('[')
      ? success(buildProxy(parts[0]!, parts[1]!, parts[2]!, parts[3]!, tokenTransport))
      : resolveFourFields(parts, tokenTransport)
  }
  return fail('FORMAT')
}

const parseCsvRow = (text: string): ProxyStringParseResult | null => {
  if (text.includes('://')) return null
  const delimiter = ['\t', ';', ','].find((candidate) => text.includes(candidate))
  if (delimiter === undefined) return null
  const fields = text.split(delimiter).map((field) => field.trim())
  if (fields.length < 2 || fields.length > 5 || !isPortText(fields[1]!)) return null
  const transport =
    fields.length === 3 || fields.length === 5
      ? (protocolToken(fields.at(-1)!) ?? fail('PROTOCOL_COLUMN_INVALID'))
      : null
  const username = fields.length >= 4 ? fields[2]! : null
  const password = fields.length >= 4 ? fields[3]! : null
  return success(buildProxy(fields[0]!, fields[1]!, username, password, transport))
}

const parseTokens = (text: string): ProxyStringParseResult => {
  const tokens = text.split(/\s+/u)
  switch (tokens.length) {
    case 1:
      return parseRecord(tokens[0]!, null)
    case 2: {
      const leading = protocolToken(tokens[0]!)
      if (leading !== null) return parseRecord(tokens[1]!, leading)
      const trailing = protocolToken(tokens[1]!)
      if (trailing !== null) return parseRecord(tokens[0]!, trailing)
      if (isPortText(tokens[1]!))
        return success(buildProxy(tokens[0]!, tokens[1]!, null, null, null))
      return fail('FORMAT')
    }
    case 3: {
      const transport = protocolToken(tokens[2]!)
      if (transport === null || !isPortText(tokens[1]!)) return fail('FORMAT')
      return success(buildProxy(tokens[0]!, tokens[1]!, null, null, transport))
    }
    case 4:
    case 5: {
      const transport = tokens.length === 5 ? (protocolToken(tokens[4]!) ?? fail('FORMAT')) : null
      if (!isPortText(tokens[1]!)) return fail('FORMAT')
      return success(buildProxy(tokens[0]!, tokens[1]!, tokens[2]!, tokens[3]!, transport))
    }
    default:
      return fail('FORMAT')
  }
}

/**
 * Parses one proxy record in the formats accepted by proxy_switcher_vpn, limited to transports
 * ProxyLoom supports. Failures carry only a code and never echo the input or credentials.
 */
export const parseProxyString = (input: string): ProxyStringParseResult => {
  const text = input.trim()
  try {
    if (text.length === 0) return fail('EMPTY')
    if (text.length > MAX_PROXY_STRING_LENGTH) return fail('TOO_LONG')
    if (hasControl(text)) return fail('CONTROL_CHARACTER')
    return parseCsvRow(text) ?? parseTokens(text)
  } catch (error) {
    if (error instanceof ParseFailure) return { code: error.code, kind: 'FAILURE' }
    throw error
  }
}
