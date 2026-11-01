import { generateShortName, validateProxyProfile } from '../../domain/profiles/profile'
import {
  parseProxyString,
  type ParsedProxyString,
  type ProxyStringErrorCode,
} from '../../domain/profiles/proxy-string'
import {
  asIsoTimestamp,
  asProxyProfileId,
  type IdGenerator,
  type ProxyProfileId,
} from '../../domain/types/brand'
import type {
  AppConfig,
  Clock,
  ProxyEndpoint,
  ProxyProfile,
  ProxyTransport,
} from '../../domain/types/entities'
import { err, ok, type Result } from '../../domain/types/result'

export const MAX_IMPORT_RECORDS = 1_000
/** About 1000 long lines; larger pastes or files are rejected before parsing. */
export const MAX_IMPORT_TEXT_LENGTH = 1024 * 1024

export type ProxyFieldOrder = 'HOST_FIRST' | 'CREDENTIALS_FIRST'

export interface ProxyLineImportOptions {
  /** Used for lines that do not name a protocol; the network is never probed. */
  readonly defaultTransport: ProxyTransport
  /** Reading of `a:b:c:d` lines that are valid both ways. */
  readonly fieldOrder: ProxyFieldOrder
}

export type ProxyImportStatus = 'NEW' | 'UPDATE' | 'UNCHANGED' | 'DUPLICATE' | 'ERROR'

/** One previewed line. Passwords are never part of the view. */
export interface ProxyImportLineView {
  readonly lineNumber: number
  readonly status: ProxyImportStatus
  readonly host: string | null
  readonly port: number | null
  readonly transport: ProxyTransport | null
  readonly username: string | null
  readonly ambiguous: boolean
  readonly errorCode: ProxyStringErrorCode | null
  readonly existingProfileId: ProxyProfileId | null
}

export interface ProxyImportPreview {
  readonly lines: readonly ProxyImportLineView[]
  readonly droppedCount: number
  readonly hasAmbiguous: boolean
}

export type ProxyLineImportError =
  | { readonly code: 'INPUT_TOO_LARGE' | 'NOTHING_TO_IMPORT' }
  | { readonly code: 'PROFILE_INVALID'; readonly lineNumber: number; readonly field: string }

interface PlannedLine {
  readonly view: ProxyImportLineView
  readonly proxy: (ParsedProxyString & { readonly transport: ProxyTransport }) | null
  readonly existing: ProxyProfile | null
}

const PROFILE_COLORS = ['#405CF5', '#1C9363', '#C93448', '#955D10', '#7A5AF8', '#0E7490'] as const

const recordKey = (host: string, port: number, username: string | null): string =>
  `${host.toLowerCase()}:${port}:${username ?? ''}`

const profileKey = (profile: ProxyProfile): string | null =>
  profile.useSameProxy
    ? recordKey(
        profile.httpEndpoint.host,
        profile.httpEndpoint.port,
        profile.httpEndpoint.username === '' ? null : profile.httpEndpoint.username,
      )
    : null

const isUnchanged = (
  existing: ProxyProfile,
  proxy: ParsedProxyString & { readonly transport: ProxyTransport },
): boolean =>
  existing.httpEndpoint.transport === proxy.transport &&
  existing.httpEndpoint.password === (proxy.password ?? '')

const planLines = (
  text: string,
  options: ProxyLineImportOptions,
  config: AppConfig,
): Result<
  { readonly lines: readonly PlannedLine[]; readonly droppedCount: number },
  ProxyLineImportError
> => {
  if (text.length > MAX_IMPORT_TEXT_LENGTH) return err({ code: 'INPUT_TOO_LARGE' })
  const records = text
    .split(/\r?\n/u)
    .map((line, index) => ({ line: line.trim(), lineNumber: index + 1 }))
    .filter(({ line }) => line !== '' && !line.startsWith('#') && !line.startsWith('//'))
  const existingByKey = new Map<string, ProxyProfile>()
  for (const profile of config.profiles) {
    const key = profileKey(profile)
    if (key !== null && !existingByKey.has(key)) existingByKey.set(key, profile)
  }

  const planned = records.slice(0, MAX_IMPORT_RECORDS).map(({ line, lineNumber }): PlannedLine => {
    const parsed = parseProxyString(line)
    if (parsed.kind === 'FAILURE') {
      return {
        existing: null,
        proxy: null,
        view: {
          ambiguous: false,
          errorCode: parsed.code,
          existingProfileId: null,
          host: null,
          lineNumber,
          port: null,
          status: 'ERROR',
          transport: null,
          username: null,
        },
      }
    }
    const ambiguous = parsed.kind === 'AMBIGUOUS'
    const chosen =
      parsed.kind === 'SUCCESS'
        ? parsed.proxy
        : options.fieldOrder === 'HOST_FIRST'
          ? parsed.hostFirst
          : parsed.credentialsFirst
    const proxy = { ...chosen, transport: chosen.transport ?? options.defaultTransport }
    const existing = existingByKey.get(recordKey(proxy.host, proxy.port, proxy.username)) ?? null
    return {
      existing,
      proxy,
      view: {
        ambiguous,
        errorCode: null,
        existingProfileId: existing?.id ?? null,
        host: proxy.host,
        lineNumber,
        port: proxy.port,
        status: existing === null ? 'NEW' : isUnchanged(existing, proxy) ? 'UNCHANGED' : 'UPDATE',
        transport: proxy.transport,
        username: proxy.username,
      },
    }
  })

  // The last line for a host/port/username wins; earlier ones become duplicates.
  const lastIndexByKey = new Map<string, number>()
  planned.forEach((line, index) => {
    if (line.proxy !== null) {
      lastIndexByKey.set(recordKey(line.proxy.host, line.proxy.port, line.proxy.username), index)
    }
  })
  const lines = planned.map((line, index) =>
    line.proxy !== null &&
    lastIndexByKey.get(recordKey(line.proxy.host, line.proxy.port, line.proxy.username)) !== index
      ? { ...line, view: { ...line.view, status: 'DUPLICATE' as const } }
      : line,
  )
  return ok({ droppedCount: Math.max(0, records.length - MAX_IMPORT_RECORDS), lines })
}

/** Pure preview for the UI; the background re-plans from the same text when applying. */
export const previewProxyLines = (
  text: string,
  options: ProxyLineImportOptions,
  config: AppConfig,
): Result<ProxyImportPreview, ProxyLineImportError> => {
  const planned = planLines(text, options, config)
  if (!planned.ok) return planned
  const lines = planned.value.lines.map((line) => line.view)
  return ok({
    droppedCount: planned.value.droppedCount,
    hasAmbiguous: lines.some((line) => line.ambiguous),
    lines,
  })
}

const endpointFor = (
  proxy: ParsedProxyString & { readonly transport: ProxyTransport },
): ProxyEndpoint => ({
  host: proxy.host,
  password: proxy.password ?? '',
  port: proxy.port,
  transport: proxy.transport,
  username: proxy.username ?? '',
})

const uniqueName = (base: string, taken: Set<string>): string => {
  let name = base
  for (let suffix = 2; taken.has(name); suffix += 1) name = `${base} (${suffix})`
  taken.add(name)
  return name
}

export class ProxyLineImportService {
  constructor(
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  /** Creates and updates every importable line in one config, or nothing at all. */
  apply(
    config: AppConfig,
    text: string,
    options: ProxyLineImportOptions,
  ): Result<
    {
      readonly config: AppConfig
      readonly created: number
      readonly updated: number
      readonly skipped: number
    },
    ProxyLineImportError
  > {
    const planned = planLines(text, options, config)
    if (!planned.ok) return planned
    const importable = planned.value.lines.filter(
      (line) => line.view.status === 'NEW' || line.view.status === 'UPDATE',
    )
    if (importable.length === 0) return err({ code: 'NOTHING_TO_IMPORT' })

    const timestamp = asIsoTimestamp(this.clock.now().toISOString())
    const takenNames = new Set(config.profiles.map((profile) => profile.name))
    const shortNames = new Set(
      config.profiles.map((profile) => profile.shortName ?? profile.generatedShortName),
    )
    const updates = new Map<ProxyProfileId, ProxyProfile>()
    const created: ProxyProfile[] = []

    for (const line of importable) {
      const proxy = line.proxy!
      const candidate: ProxyProfile =
        line.existing === null
          ? (() => {
              const name = uniqueName(`${proxy.host}:${proxy.port}`, takenNames)
              const generatedShortName = generateShortName(name, shortNames)
              shortNames.add(generatedShortName)
              return {
                checkUrl: config.general.ipGeoProviderEndpoint,
                color: PROFILE_COLORS[created.length % PROFILE_COLORS.length]!,
                createdAt: timestamp,
                generatedShortName,
                httpEndpoint: endpointFor(proxy),
                httpsEndpoint: endpointFor(proxy),
                id: asProxyProfileId(this.ids.next()),
                lastCheck: null,
                name,
                note: '',
                shortName: null,
                updatedAt: timestamp,
                useSameProxy: true,
              }
            })()
          : {
              ...line.existing,
              httpEndpoint: endpointFor(proxy),
              httpsEndpoint: endpointFor(proxy),
              updatedAt: timestamp,
            }
      const validated = validateProxyProfile(candidate)
      if (!validated.ok) {
        return err({
          code: 'PROFILE_INVALID',
          field: validated.error.field,
          lineNumber: line.view.lineNumber,
        })
      }
      if (line.existing === null) created.push(candidate)
      else updates.set(candidate.id, candidate)
    }

    return ok({
      config: {
        ...config,
        profiles: [
          ...config.profiles.map((profile) => updates.get(profile.id) ?? profile),
          ...created,
        ],
      },
      created: created.length,
      skipped: planned.value.lines.length - importable.length,
      updated: updates.size,
    })
  }
}
