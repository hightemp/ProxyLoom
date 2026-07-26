import type {
  FoxyProxyAdapterId,
  FoxyProxyCandidate,
  FoxyProxyParseError,
  FoxyProxyParseResult,
  FoxyProxySkipReason,
  FoxyProxySkippedEntry,
} from '../../../domain/import-export/foxyproxy/contracts'
import { parseSafeJson } from '../../../domain/import-export/safe-json'
import { err, ok, type Result } from '../../../domain/types/result'

type RecordValue = Readonly<Record<string, unknown>>

const isRecord = (value: unknown): value is RecordValue =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const stringValue = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback

const normalizePort = (value: unknown): number | null => {
  const port =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d+$/.test(value)
        ? Number(value)
        : Number.NaN
  return Number.isInteger(port) && port >= 1 && port <= 65_535 ? port : null
}

const validHostname = (value: string): boolean =>
  value.length >= 1 && value.length <= 253 && !/[\s/@?#]/.test(value) && !value.includes('..')

const color = (value: unknown): string =>
  typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : '#405CF5'

const classifyType = (
  value: unknown,
  legacy: boolean,
): { transport: 'HTTP' | 'HTTPS' } | { reason: FoxyProxySkipReason } => {
  const legacyTypes: Readonly<Record<string, string | undefined>> = {
    '1': 'http',
    '2': 'https',
    '3': 'socks5',
    '4': 'socks4',
    '5': 'direct',
  }
  const type = legacy
    ? legacyTypes[String(value)]
    : typeof value === 'string'
      ? value.toLocaleLowerCase('en-US')
      : ''
  if (type === 'http') {
    return { transport: 'HTTP' }
  }
  if (type === 'https' || type === 'ssl') {
    return { transport: 'HTTPS' }
  }
  if (type === 'direct') {
    return { reason: 'DIRECT_ENTRY' }
  }
  if (type === 'pac' || type === 'auto') {
    return { reason: 'UNSUPPORTED_PAC' }
  }
  if (type === 'socks' || type === 'socks4' || type === 'socks5') {
    return { reason: 'UNSUPPORTED_SOCKS' }
  }
  return { reason: 'MALFORMED_ENTRY' }
}

const parseCandidate = (
  entry: unknown,
  sourceIndex: number,
  legacy: boolean,
): FoxyProxyCandidate | FoxyProxySkippedEntry => {
  if (!isRecord(entry)) {
    return { reason: 'MALFORMED_ENTRY', sourceIndex, title: '' }
  }
  const title = stringValue(entry.title).trim()
  const type = classifyType(entry.type, legacy)
  if ('reason' in type) {
    return { reason: type.reason, sourceIndex, title }
  }
  const hostname = stringValue(legacy ? entry.address : entry.hostname).trim()
  if (!validHostname(hostname)) {
    return { reason: 'INVALID_HOST', sourceIndex, title }
  }
  const port = normalizePort(entry.port)
  if (port === null) {
    return { reason: 'INVALID_PORT', sourceIndex, title }
  }
  return {
    active: entry.active === true || entry.active === 'true',
    color: color(entry.color),
    hostname,
    password: stringValue(entry.password).slice(0, 4_096),
    port,
    sourceIndex,
    title: title || `${hostname}:${port}`,
    transport: type.transport,
    username: stringValue(entry.username).slice(0, 1_024),
  }
}

const detect = (
  raw: RecordValue,
): { adapter: FoxyProxyAdapterId; entries: readonly unknown[]; legacy: boolean } | null => {
  if (Array.isArray(raw.data)) {
    return {
      adapter: 'FOXYPROXY_8_PLUS',
      entries: raw.data,
      legacy: false,
    }
  }
  const entries = Object.values(raw).filter(
    (value) =>
      isRecord(value) &&
      ('address' in value || ('type' in value && typeof value.type === 'number')),
  )
  return entries.length === 0
    ? null
    : {
        adapter: 'FOXYPROXY_6_7',
        entries,
        legacy: true,
      }
}

export const parseFoxyProxyExport = (
  text: string,
): Result<FoxyProxyParseResult, FoxyProxyParseError> => {
  const parsed = parseSafeJson(text)
  if (!parsed.ok) {
    return parsed
  }
  if (!isRecord(parsed.value)) {
    return err({
      code: 'UNSUPPORTED_FORMAT',
      issues: ['Expected a FoxyProxy settings object.'],
    })
  }
  const detected = detect(parsed.value)
  if (detected === null) {
    return err({
      code: 'UNSUPPORTED_FORMAT',
      issues: ['No supported FoxyProxy 6–9 settings structure was found.'],
    })
  }
  const candidates: FoxyProxyCandidate[] = []
  const skipped: FoxyProxySkippedEntry[] = []
  detected.entries.forEach((entry, sourceIndex) => {
    const result = parseCandidate(entry, sourceIndex, detected.legacy)
    if ('hostname' in result) {
      candidates.push(result)
    } else {
      skipped.push(result)
    }
  })
  if (candidates.length === 0) {
    return err({
      code: 'NO_SUPPORTED_PROFILES',
      issues: ['The file contains no valid HTTP or HTTPS proxy profiles.'],
    })
  }
  return ok({
    adapter: detected.adapter,
    candidates,
    excludedData: [
      'URL patterns and rules',
      'groups and subscriptions',
      'logs and temporary state',
      'SOCKS, PAC, and direct entries',
    ],
    skipped,
  })
}
