import type { AppConfig } from '../../domain/types/entities'
import { err, type Result } from '../../domain/types/result'
import { removeGroupsFromVersionOne } from '../../domain/config/remove-groups-migration'
import { createDefaultConfig } from '../seed/create-default-config'
import { parseAppConfig, type ConfigSchemaError } from '../../domain/config/schema'

export const CURRENT_SCHEMA_VERSION = 2

export interface MigrationError {
  readonly code: 'UNSUPPORTED_SCHEMA_VERSION' | 'INVALID_LEGACY_CONFIG'
  readonly version: number | null
  readonly issues: ConfigSchemaError['issues']
}

type MutableRecord = Record<string, unknown>

const asRecord = (value: unknown): MutableRecord | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? { ...(value as Readonly<Record<string, unknown>>) }
    : null

const migrateVersionZero = (input: MutableRecord): unknown => {
  const defaults = createDefaultConfig()
  const general = asRecord(input.general)
  const appearance = asRecord(input.appearance)

  return {
    appearance: {
      ...defaults.appearance,
      ...(appearance ?? {}),
    },
    general: {
      ...defaults.general,
      ...(general ?? {}),
    },
    groups: Array.isArray(input.groups) ? input.groups : [],
    profiles: Array.isArray(input.profiles) ? input.profiles : defaults.profiles,
    revision:
      typeof input.revision === 'number' && Number.isInteger(input.revision) ? input.revision : 0,
    rules: Array.isArray(input.rules) ? input.rules : defaults.rules,
    schemaVersion: 1,
  }
}

export const migrateConfig = (
  input: unknown,
): Result<AppConfig, MigrationError | ConfigSchemaError> => {
  const record = asRecord(input)
  if (record === null) {
    return err({
      code: 'INVALID_LEGACY_CONFIG',
      issues: [],
      version: null,
    })
  }
  const rawVersion = record.schemaVersion
  const version = typeof rawVersion === 'number' && Number.isInteger(rawVersion) ? rawVersion : 0

  if (version > CURRENT_SCHEMA_VERSION || version < 0) {
    return err({
      code: 'UNSUPPORTED_SCHEMA_VERSION',
      issues: [],
      version,
    })
  }

  let migrated: unknown = structuredClone(record)
  for (let currentVersion = version; currentVersion < CURRENT_SCHEMA_VERSION; currentVersion += 1) {
    if (currentVersion === 0) {
      const currentRecord = asRecord(migrated)
      if (currentRecord === null) {
        return err({
          code: 'INVALID_LEGACY_CONFIG',
          issues: [],
          version: currentVersion,
        })
      }
      migrated = migrateVersionZero(currentRecord)
    } else if (currentVersion === 1) {
      const currentRecord = asRecord(migrated)
      if (currentRecord === null) {
        return err({
          code: 'INVALID_LEGACY_CONFIG',
          issues: [],
          version: currentVersion,
        })
      }
      migrated = removeGroupsFromVersionOne(currentRecord)
    }
  }

  return parseAppConfig(migrated)
}
