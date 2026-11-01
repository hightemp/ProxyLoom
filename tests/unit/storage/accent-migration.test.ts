import { describe, expect, it } from 'vitest'

import { NativeImportService } from '../../../src/application/import-export/import'
import { serializeNativeExport } from '../../../src/application/import-export/export'
import { CURRENT_SCHEMA_VERSION, migrateConfig } from '../../../src/storage/migrations/runner'
import {
  CONFIG_BACKUP_KEY,
  CONFIG_KEY,
  CONFIG_MIGRATION_MARKER_KEY,
  ConfigRepository,
} from '../../../src/storage/config/config-repository'
import { MemoryStorageArea } from '../../../src/storage/config/storage-area'
import { createDefaultConfig } from '../../../src/storage/seed/create-default-config'
import { config } from '../domain/fixtures'

const versionThree = () => {
  const current = createDefaultConfig() as unknown as Record<string, unknown>
  return { ...current, appearance: { theme: 'DARK' }, schemaVersion: 3 }
}

describe('schema v4 accent migration', () => {
  it('is the current schema and the default accent is Indigo', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(4)
    expect(createDefaultConfig().appearance).toEqual({ accent: 'INDIGO', theme: 'SYSTEM' })
  })

  it('adds the default accent to a v3 config and keeps the theme', () => {
    const result = migrateConfig(versionThree())
    if (!result.ok) throw new Error(result.error.code)
    expect(result.value.schemaVersion).toBe(4)
    expect(result.value.appearance).toEqual({ accent: 'INDIGO', theme: 'DARK' })
  })

  it('is idempotent and preserves a chosen accent', () => {
    const once = migrateConfig(versionThree())
    if (!once.ok) throw new Error(once.error.code)
    const chosen = { ...once.value, appearance: { ...once.value.appearance, accent: 'TEAL' } }
    const again = migrateConfig(chosen)
    if (!again.ok) throw new Error(again.error.code)
    expect(again.value).toEqual(chosen)
  })

  it('rejects an unknown accent instead of storing it', () => {
    const result = migrateConfig({
      ...createDefaultConfig(),
      appearance: { accent: 'NEON', theme: 'SYSTEM' },
    })
    expect(result.ok).toBe(false)
  })

  it('imports a v3 native export and migrates it to v4', () => {
    const exported = JSON.parse(
      serializeNativeExport(config(), { includeCredentials: false, now: new Date() }),
    ) as { config: Record<string, unknown> }
    exported.config.schemaVersion = 3
    exported.config.appearance = { theme: 'LIGHT' }
    const preview = new NativeImportService({ next: () => 'id' }).preview(
      JSON.stringify(exported),
      config(),
    )
    if (!preview.ok) throw new Error(preview.error.code)
    expect(preview.value.document.config.schemaVersion).toBe(4)
    expect(preview.value.document.config.appearance).toEqual({ accent: 'INDIGO', theme: 'LIGHT' })
  })
})

describe('stored v3 configuration', () => {
  const now = new Date('2026-11-01T00:00:00.000Z')

  it('is upgraded to v4 on startup with a backup of the v3 document', async () => {
    const stored = versionThree()
    const storage = new MemoryStorageArea({ [CONFIG_KEY]: stored })
    const result = await new ConfigRepository(storage, () => now).initialize()
    if (!result.ok) throw new Error(result.error.code)
    expect(result.value.appearance.accent).toBe('INDIGO')
    const values = await storage.get([CONFIG_KEY, CONFIG_BACKUP_KEY, CONFIG_MIGRATION_MARKER_KEY])
    expect((values[CONFIG_KEY] as { schemaVersion: number }).schemaVersion).toBe(4)
    expect(values[CONFIG_BACKUP_KEY]).toEqual(stored)
    expect(values[CONFIG_MIGRATION_MARKER_KEY]).toBeUndefined()
  })

  it('restores the v3 backup when the v4 write was interrupted', async () => {
    const stored = versionThree()
    const storage = new MemoryStorageArea({
      [CONFIG_BACKUP_KEY]: stored,
      [CONFIG_KEY]: { corrupt: true },
      [CONFIG_MIGRATION_MARKER_KEY]: {
        fromRevision: 0,
        startedAt: now.toISOString(),
        toRevision: 0,
      },
    })
    const repository = new ConfigRepository(storage, () => now)
    expect(await repository.recover()).toEqual({ ok: true, value: null })
    const reloaded = await repository.initialize()
    if (!reloaded.ok) throw new Error(reloaded.error.code)
    expect(reloaded.value.schemaVersion).toBe(4)
    expect(reloaded.value.appearance).toEqual({ accent: 'INDIGO', theme: 'DARK' })
  })
})
