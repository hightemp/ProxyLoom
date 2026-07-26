import { parseAppConfig, type ConfigSchemaError } from '../../domain/config/schema'
import type { AppConfig } from '../../domain/types/entities'
import { err, ok, type Result } from '../../domain/types/result'
import { createDefaultConfig } from '../seed/create-default-config'
import { migrateConfig } from '../migrations/runner'
import type { StorageArea } from './storage-area'

export const CONFIG_KEY = 'config.v1'
export const CONFIG_BACKUP_KEY = 'config.backup'
export const CONFIG_MIGRATION_MARKER_KEY = 'config.migration'

interface MigrationMarker {
  readonly fromRevision: number
  readonly toRevision: number
  readonly startedAt: string
}

export type ConfigRepositoryError =
  | ConfigSchemaError
  | {
      readonly code: 'UNSUPPORTED_SCHEMA_VERSION' | 'INVALID_LEGACY_CONFIG'
      readonly version: number | null
      readonly issues: ConfigSchemaError['issues']
    }
  | {
      readonly code: 'REVISION_CONFLICT'
      readonly expected: number
      readonly actual: number
    }
  | {
      readonly code: 'STORAGE_ERROR'
      readonly operation: 'GET' | 'SET' | 'REMOVE'
      readonly message: string
    }

const storageError = (
  operation: 'GET' | 'SET' | 'REMOVE',
  error: unknown,
): ConfigRepositoryError => ({
  code: 'STORAGE_ERROR',
  message: error instanceof Error ? error.message : String(error),
  operation,
})

export class ConfigRepository {
  #writeQueue: Promise<void> = Promise.resolve()

  constructor(
    private readonly storage: StorageArea,
    private readonly now: () => Date,
  ) {}

  async initialize(): Promise<Result<AppConfig, ConfigRepositoryError>> {
    const recovered = await this.recover()
    if (!recovered.ok) {
      return recovered
    }
    let values: Readonly<Record<string, unknown>>
    try {
      values = await this.storage.get([CONFIG_KEY])
    } catch (error) {
      return err(storageError('GET', error))
    }
    const stored = values[CONFIG_KEY]
    if (stored === undefined) {
      const initial = createDefaultConfig(this.now())
      try {
        await this.storage.set({ [CONFIG_KEY]: initial })
        return ok(initial)
      } catch (error) {
        return err(storageError('SET', error))
      }
    }

    const current = parseAppConfig(stored)
    if (current.ok) {
      return current
    }
    const migrated = migrateConfig(stored, this.now())
    if (!migrated.ok) {
      return migrated
    }
    const marker: MigrationMarker = {
      fromRevision:
        typeof stored === 'object' &&
        stored !== null &&
        typeof (stored as { revision?: unknown }).revision === 'number'
          ? (stored as { revision: number }).revision
          : 0,
      startedAt: this.now().toISOString(),
      toRevision: migrated.value.revision,
    }
    try {
      await this.storage.set({
        [CONFIG_BACKUP_KEY]: stored,
        [CONFIG_MIGRATION_MARKER_KEY]: marker,
      })
      await this.storage.set({ [CONFIG_KEY]: migrated.value })
      await this.storage.remove([CONFIG_MIGRATION_MARKER_KEY])
      return migrated
    } catch (error) {
      return err(storageError('SET', error))
    }
  }

  async read(): Promise<Result<AppConfig, ConfigRepositoryError>> {
    let values: Readonly<Record<string, unknown>>
    try {
      values = await this.storage.get([CONFIG_KEY])
    } catch (error) {
      return err(storageError('GET', error))
    }
    return parseAppConfig(values[CONFIG_KEY])
  }

  async update(
    expectedRevision: number,
    mutate: (current: AppConfig) => AppConfig,
  ): Promise<Result<AppConfig, ConfigRepositoryError>> {
    const operation = this.#writeQueue.then(() => this.updateSerialized(expectedRevision, mutate))
    this.#writeQueue = operation.then(
      () => undefined,
      () => undefined,
    )
    return operation
  }

  async replace(
    expectedRevision: number,
    replacement: AppConfig,
  ): Promise<Result<AppConfig, ConfigRepositoryError>> {
    return this.update(expectedRevision, () => replacement)
  }

  private async updateSerialized(
    expectedRevision: number,
    mutate: (current: AppConfig) => AppConfig,
  ): Promise<Result<AppConfig, ConfigRepositoryError>> {
    const current = await this.read()
    if (!current.ok) {
      return current
    }
    if (current.value.revision !== expectedRevision) {
      return err({
        actual: current.value.revision,
        code: 'REVISION_CONFLICT',
        expected: expectedRevision,
      })
    }

    const candidate = mutate(structuredClone(current.value))
    const revised = {
      ...candidate,
      revision: expectedRevision + 1,
    }
    const parsed = parseAppConfig(revised)
    if (!parsed.ok) {
      return parsed
    }
    const marker: MigrationMarker = {
      fromRevision: current.value.revision,
      startedAt: this.now().toISOString(),
      toRevision: parsed.value.revision,
    }

    try {
      await this.storage.set({
        [CONFIG_BACKUP_KEY]: current.value,
        [CONFIG_MIGRATION_MARKER_KEY]: marker,
      })
      await this.storage.set({ [CONFIG_KEY]: parsed.value })
      await this.storage.remove([CONFIG_MIGRATION_MARKER_KEY])
      return parsed
    } catch (error) {
      return err(storageError('SET', error))
    }
  }

  async recover(): Promise<Result<null, ConfigRepositoryError>> {
    let values: Readonly<Record<string, unknown>>
    try {
      values = await this.storage.get([CONFIG_KEY, CONFIG_BACKUP_KEY, CONFIG_MIGRATION_MARKER_KEY])
    } catch (error) {
      return err(storageError('GET', error))
    }
    if (values[CONFIG_MIGRATION_MARKER_KEY] === undefined) {
      return ok(null)
    }

    const current = parseAppConfig(values[CONFIG_KEY])
    if (current.ok) {
      try {
        await this.storage.remove([CONFIG_MIGRATION_MARKER_KEY])
        return ok(null)
      } catch (error) {
        return err(storageError('REMOVE', error))
      }
    }

    const backup = parseAppConfig(values[CONFIG_BACKUP_KEY])
    if (!backup.ok) {
      return backup
    }
    try {
      await this.storage.set({ [CONFIG_KEY]: backup.value })
      await this.storage.remove([CONFIG_MIGRATION_MARKER_KEY])
      return ok(null)
    } catch (error) {
      return err(storageError('SET', error))
    }
  }
}
