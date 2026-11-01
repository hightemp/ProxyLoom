import { describe, expect, it } from 'vitest'

import { serializeNativeExport } from '../../../src/application/import-export/export'
import { NativeImportService } from '../../../src/application/import-export/import'
import { DEFAULT_SPEED_TEST_ENDPOINT } from '../../../src/config/defaults'
import {
  CONFIG_BACKUP_KEY,
  CONFIG_KEY,
  CONFIG_MIGRATION_MARKER_KEY,
  ConfigRepository,
} from '../../../src/storage/config/config-repository'
import { MemoryStorageArea } from '../../../src/storage/config/storage-area'
import { CURRENT_SCHEMA_VERSION, migrateConfig } from '../../../src/storage/migrations/runner'
import { createDefaultConfig } from '../../../src/storage/seed/create-default-config'
import { config, profile } from '../domain/fixtures'

const oldCheck = {
  availability: true,
  checkedAt: '2026-10-01T00:00:00.000Z',
  connectDurationMs: null,
  country: 'DE',
  errorCode: null,
  externalIp: '192.0.2.1',
  httpStatus: 200,
  totalDurationMs: 300,
}

/** A v4 document: no speed endpoint and check results without speed fields. */
const versionFour = () => {
  const current = createDefaultConfig() as unknown as {
    general: Record<string, unknown>
    profiles: unknown[]
  }
  const general = { ...current.general }
  delete general.speedTestEndpoint
  const checked = profile('checked', { name: 'Checked' }) as unknown as Record<string, unknown>
  const unchecked = profile('unchecked', { name: 'Unchecked' })
  return {
    ...current,
    general,
    profiles: [{ ...checked, lastCheck: oldCheck }, unchecked],
    schemaVersion: 4,
  }
}

describe('schema v5 speed test migration', () => {
  it('is the current schema and defaults to the Cloudflare download endpoint', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(5)
    expect(DEFAULT_SPEED_TEST_ENDPOINT).toBe('https://speed.cloudflare.com/__down?bytes=5000000')
    expect(createDefaultConfig().general.speedTestEndpoint).toBe(DEFAULT_SPEED_TEST_ENDPOINT)
  })

  it('adds the endpoint and empty speed fields to stored check results', () => {
    const result = migrateConfig(versionFour())
    if (!result.ok) throw new Error(result.error.code)
    expect(result.value.schemaVersion).toBe(5)
    expect(result.value.general.speedTestEndpoint).toBe(DEFAULT_SPEED_TEST_ENDPOINT)
    expect(result.value.profiles[0]?.lastCheck).toEqual({
      ...oldCheck,
      downloadMbps: null,
      speedErrorCode: null,
    })
    expect(result.value.profiles[1]?.lastCheck).toBeNull()
  })

  it('is idempotent and keeps a custom endpoint and measured speed', () => {
    const once = migrateConfig(versionFour())
    if (!once.ok) throw new Error(once.error.code)
    const custom = {
      ...once.value,
      general: { ...once.value.general, speedTestEndpoint: 'https://speed.example/100mb.bin' },
      profiles: once.value.profiles.map((entry) =>
        entry.lastCheck === null
          ? entry
          : { ...entry, lastCheck: { ...entry.lastCheck, downloadMbps: 42.5 } },
      ),
    }
    const again = migrateConfig(custom)
    if (!again.ok) throw new Error(again.error.code)
    expect(again.value).toEqual(custom)
  })

  it('rejects a speed endpoint that is not a URL', () => {
    const current = createDefaultConfig()
    const result = migrateConfig({
      ...current,
      general: { ...current.general, speedTestEndpoint: 'not a url' },
    })
    expect(result.ok).toBe(false)
  })

  it('imports a v4 native export as v5', () => {
    const exported = JSON.parse(
      serializeNativeExport(config(), { includeCredentials: false, now: new Date() }),
    ) as { config: Record<string, unknown> }
    const legacy = versionFour()
    exported.config.schemaVersion = 4
    exported.config.general = legacy.general
    const preview = new NativeImportService({ next: () => 'id' }).preview(
      JSON.stringify(exported),
      config(),
    )
    if (!preview.ok) throw new Error(preview.error.code)
    expect(preview.value.document.config.schemaVersion).toBe(5)
    expect(preview.value.document.config.general.speedTestEndpoint).toBe(
      DEFAULT_SPEED_TEST_ENDPOINT,
    )
  })

  it('upgrades stored v4 config with a backup and recovers from an interrupted write', async () => {
    const now = new Date('2026-11-01T00:00:00.000Z')
    const stored = versionFour()
    const storage = new MemoryStorageArea({ [CONFIG_KEY]: stored })
    const result = await new ConfigRepository(storage, () => now).initialize()
    if (!result.ok) throw new Error(result.error.code)
    expect(result.value.schemaVersion).toBe(5)
    expect((await storage.get([CONFIG_BACKUP_KEY]))[CONFIG_BACKUP_KEY]).toEqual(stored)

    const interrupted = new MemoryStorageArea({
      [CONFIG_BACKUP_KEY]: stored,
      [CONFIG_KEY]: { corrupt: true },
      [CONFIG_MIGRATION_MARKER_KEY]: {
        fromRevision: 0,
        startedAt: now.toISOString(),
        toRevision: 0,
      },
    })
    const repository = new ConfigRepository(interrupted, () => now)
    expect(await repository.recover()).toEqual({ ok: true, value: null })
    const reloaded = await repository.initialize()
    if (!reloaded.ok) throw new Error(reloaded.error.code)
    expect(reloaded.value.general.speedTestEndpoint).toBe(DEFAULT_SPEED_TEST_ENDPOINT)
  })
})
