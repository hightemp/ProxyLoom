import { generateShortName, validateProxyProfile } from '../../../domain/profiles/profile'
import type { FoxyProxyCandidate } from '../../../domain/import-export/foxyproxy/contracts'
import { asIsoTimestamp, asProxyProfileId, type IdGenerator } from '../../../domain/types/brand'
import type { AppConfig, Clock, ProxyEndpoint, ProxyProfile } from '../../../domain/types/entities'
import { err, ok, type Result } from '../../../domain/types/result'

export interface FoxyProxyImportReport {
  readonly config: AppConfig
  readonly imported: readonly ProxyProfile[]
  readonly skippedSourceIndexes: readonly number[]
}

export type FoxyProxyImportError =
  | { readonly code: 'NO_SELECTION' }
  | {
      readonly code: 'PROFILE_INVALID'
      readonly sourceIndex: number
      readonly field: string
    }

const uniqueName = (name: string, used: Set<string>): string => {
  const normalized = (value: string): string => value.trim().toLocaleLowerCase('en-US')
  let candidate = name
  let suffix = 1
  while (used.has(normalized(candidate))) {
    suffix += 1
    candidate = `${name} imported ${suffix}`
  }
  used.add(normalized(candidate))
  return candidate
}

const endpoint = (candidate: FoxyProxyCandidate): ProxyEndpoint => ({
  host: candidate.hostname,
  password: candidate.password,
  port: candidate.port,
  transport: candidate.transport,
  username: candidate.username,
})

export class FoxyProxyImporter {
  constructor(
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  import(
    config: AppConfig,
    candidates: readonly FoxyProxyCandidate[],
    selectedSourceIndexes: ReadonlySet<number>,
  ): Result<FoxyProxyImportReport, FoxyProxyImportError> {
    const selected = candidates.filter(({ sourceIndex }) => selectedSourceIndexes.has(sourceIndex))
    if (selected.length === 0) {
      return err({ code: 'NO_SELECTION' })
    }
    const timestamp = asIsoTimestamp(this.clock.now().toISOString())
    const usedNames = new Set(
      config.profiles.map(({ name }) => name.trim().toLocaleLowerCase('en-US')),
    )
    const usedShortNames = new Set(
      config.profiles.map((profile) => profile.shortName ?? profile.generatedShortName),
    )
    const imported: ProxyProfile[] = []
    for (const candidate of selected) {
      const name = uniqueName(candidate.title, usedNames)
      const generatedShortName = generateShortName(name, usedShortNames)
      usedShortNames.add(generatedShortName)
      const importedProfile: ProxyProfile = {
        checkUrl: config.general.ipGeoProviderEndpoint,
        color: candidate.color,
        createdAt: timestamp,
        generatedShortName,
        httpEndpoint: endpoint(candidate),
        httpsEndpoint: endpoint(candidate),
        id: asProxyProfileId(this.ids.next()),
        lastCheck: null,
        name,
        note: 'Imported from FoxyProxy. Patterns and subscriptions were not imported.',
        shortName: null,
        updatedAt: timestamp,
        useSameProxy: true,
      }
      const validated = validateProxyProfile(importedProfile)
      if (!validated.ok) {
        return err({
          code: 'PROFILE_INVALID',
          field: validated.error.field,
          sourceIndex: candidate.sourceIndex,
        })
      }
      imported.push(importedProfile)
    }
    return ok({
      config: {
        ...config,
        profiles: [...config.profiles, ...imported],
      },
      imported,
      skippedSourceIndexes: candidates
        .filter(({ sourceIndex }) => !selectedSourceIndexes.has(sourceIndex))
        .map(({ sourceIndex }) => sourceIndex),
    })
  }
}
