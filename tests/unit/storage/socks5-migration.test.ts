import { describe, expect, it } from 'vitest'

import { serializeNativeExport } from '../../../src/application/import-export/export'
import { NativeImportService } from '../../../src/application/import-export/import'
import {
  CONFIG_BACKUP_KEY,
  CONFIG_KEY,
  CONFIG_MIGRATION_MARKER_KEY,
  ConfigRepository,
} from '../../../src/storage/config/config-repository'
import { MemoryStorageArea } from '../../../src/storage/config/storage-area'
import { CURRENT_SCHEMA_VERSION, migrateConfig } from '../../../src/storage/migrations/runner'
import { createDefaultConfig } from '../../../src/storage/seed/create-default-config'
import { config, endpoint, profile } from '../domain/fixtures'

/** A v5 document: HTTP/HTTPS transports only. */
const versionFive = () => ({
  ...createDefaultConfig(),
  profiles: [profile('http-profile', { name: 'HTTP profile' })],
  schemaVersion: 5,
})

const socksProfile = () =>
  profile('socks-profile', {
    httpEndpoint: { ...endpoint('192.0.2.5', 1080, 'SOCKS5'), password: 'p', username: 'u' },
    name: 'SOCKS profile',
    useSameProxy: true,
  })

describe('schema v6 SOCKS5 transport migration (PL-145)', () => {
  it('is the current schema', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(6)
    expect(createDefaultConfig().schemaVersion).toBe(6)
  })

  it('upgrades a v5 config without changing its profiles', () => {
    const source = versionFive()
    const result = migrateConfig(source)
    if (!result.ok) throw new Error(result.error.code)
    expect(result.value.schemaVersion).toBe(6)
    expect(result.value.profiles).toEqual(source.profiles)
  })

  it('accepts SOCKS5 endpoints at v6 and is idempotent', () => {
    const current = { ...createDefaultConfig(), profiles: [socksProfile()] }
    const once = migrateConfig(current)
    if (!once.ok) throw new Error(once.error.code)
    const again = migrateConfig(once.value)
    if (!again.ok) throw new Error(again.error.code)
    expect(again.value).toEqual(once.value)
    expect(again.value.profiles[0]?.httpEndpoint).toMatchObject({
      password: 'p',
      transport: 'SOCKS5',
      username: 'u',
    })
  })

  it('rejects an unknown transport', () => {
    const current = createDefaultConfig()
    const result = migrateConfig({
      ...current,
      profiles: [
        { ...socksProfile(), httpEndpoint: endpoint('192.0.2.5', 1080, 'SOCKS4' as never) },
      ],
    })
    expect(result.ok).toBe(false)
  })

  it('imports a v5 native export as v6 and round-trips a SOCKS5 profile with credentials', () => {
    const legacy = JSON.parse(
      serializeNativeExport(config(), { includeCredentials: false, now: new Date() }),
    ) as { config: Record<string, unknown> }
    legacy.config.schemaVersion = 5
    const service = new NativeImportService({ next: () => 'id' })
    const legacyPreview = service.preview(JSON.stringify(legacy), config())
    if (!legacyPreview.ok) throw new Error(legacyPreview.error.code)
    expect(legacyPreview.value.document.config.schemaVersion).toBe(6)

    const exported = serializeNativeExport(config({ profiles: [socksProfile()] }), {
      includeCredentials: true,
      now: new Date(),
    })
    const preview = service.preview(exported, config())
    if (!preview.ok) throw new Error(preview.error.code)
    expect(preview.value.document.config.profiles[0]?.httpEndpoint).toMatchObject({
      password: 'p',
      transport: 'SOCKS5',
      username: 'u',
    })
  })

  it('upgrades stored v5 config with a backup and recovers from an interrupted write', async () => {
    const now = new Date('2026-11-04T00:00:00.000Z')
    const stored = versionFive()
    const storage = new MemoryStorageArea({ [CONFIG_KEY]: stored })
    const result = await new ConfigRepository(storage, () => now).initialize()
    if (!result.ok) throw new Error(result.error.code)
    expect(result.value.schemaVersion).toBe(6)
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
    expect(reloaded.value.schemaVersion).toBe(6)
    expect(reloaded.value.profiles).toEqual(stored.profiles)
  })
})
