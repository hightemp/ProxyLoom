import { describe, expect, it } from 'vitest'

import { createDefaultConfig } from '../../../src/storage/seed/create-default-config'
import {
  CONFIG_BACKUP_KEY,
  CONFIG_KEY,
  CONFIG_MIGRATION_MARKER_KEY,
  ConfigRepository,
} from '../../../src/storage/config/config-repository'
import {
  FallbackStorageArea,
  MemoryStorageArea,
  type StorageArea,
} from '../../../src/storage/config/storage-area'
import { migrateConfig } from '../../../src/storage/migrations/runner'
import { rule } from '../domain/fixtures'

const now = new Date('2026-01-01T00:00:00.000Z')

describe('default configuration', () => {
  it('starts with a clean empty rule list', () => {
    const value = createDefaultConfig()
    expect(value.rules).toEqual([])
    expect(value).not.toHaveProperty('groups')
    expect(value.schemaVersion).toBe(2)
    expect(value.general.mode).toBe('DIRECT')
  })
})

describe('configuration repository', () => {
  it('initializes empty storage and remains idempotent', async () => {
    const storage = new MemoryStorageArea()
    const repository = new ConfigRepository(storage, () => now)
    const first = await repository.initialize()
    const second = await repository.initialize()
    expect(first).toEqual(second)
    expect(first.ok && first.value.rules).toHaveLength(0)
  })

  it('validates, increments, and persists an atomic update', async () => {
    const initial = createDefaultConfig()
    const storage = new MemoryStorageArea({ [CONFIG_KEY]: initial })
    const repository = new ConfigRepository(storage, () => now)
    const result = await repository.update(0, (current) => ({
      ...current,
      appearance: { theme: 'DARK' },
    }))
    expect(result.ok).toBe(true)
    expect(result.ok && result.value.revision).toBe(1)
    expect((await repository.read()).ok).toBe(true)
  })

  it('rejects a stale revision without changing storage', async () => {
    const initial = createDefaultConfig()
    const repository = new ConfigRepository(
      new MemoryStorageArea({ [CONFIG_KEY]: initial }),
      () => now,
    )
    const result = await repository.update(9, (current) => current)
    expect(result).toEqual({
      error: { actual: 0, code: 'REVISION_CONFLICT', expected: 9 },
      ok: false,
    })
    expect((await repository.read()).ok && (await repository.read())).toBeTruthy()
  })

  it('rejects invalid mutation and retains the prior revision', async () => {
    const initial = createDefaultConfig()
    const repository = new ConfigRepository(
      new MemoryStorageArea({ [CONFIG_KEY]: initial }),
      () => now,
    )
    const result = await repository.update(0, (current) => ({
      ...current,
      general: { ...current.general, proxyCheckTimeoutMs: -1 },
    }))
    expect(result.ok).toBe(false)
    const current = await repository.read()
    expect(current.ok && current.value.revision).toBe(0)
  })

  it('restores a backup after an interrupted corrupt write', async () => {
    const initial = createDefaultConfig()
    const storage = new MemoryStorageArea({
      [CONFIG_BACKUP_KEY]: initial,
      [CONFIG_KEY]: { corrupt: true },
      [CONFIG_MIGRATION_MARKER_KEY]: {
        fromRevision: 0,
        startedAt: now.toISOString(),
        toRevision: 1,
      },
    })
    const repository = new ConfigRepository(storage, () => now)
    expect(await repository.recover()).toEqual({ ok: true, value: null })
    const restored = await repository.read()
    expect(restored.ok && restored.value).toEqual(initial)
  })

  it('does not silently overwrite corrupt existing storage with defaults', async () => {
    const repository = new ConfigRepository(
      new MemoryStorageArea({ [CONFIG_KEY]: { schemaVersion: 1 } }),
      () => now,
    )
    const result = await repository.initialize()
    expect(result.ok).toBe(false)
  })

  it('serializes concurrent writes so one stale revision loses deterministically', async () => {
    const initial = createDefaultConfig()
    const repository = new ConfigRepository(
      new MemoryStorageArea({ [CONFIG_KEY]: initial }),
      () => now,
    )

    const [first, second] = await Promise.all([
      repository.update(0, (current) => ({
        ...current,
        appearance: { theme: 'DARK' },
      })),
      repository.update(0, (current) => ({
        ...current,
        appearance: { theme: 'LIGHT' },
      })),
    ])

    expect(first).toMatchObject({ ok: true, value: { revision: 1 } })
    expect(second).toEqual({
      error: { actual: 1, code: 'REVISION_CONFLICT', expected: 0 },
      ok: false,
    })
    expect(await repository.read()).toMatchObject({
      ok: true,
      value: { appearance: { theme: 'DARK' }, revision: 1 },
    })
  })

  it('uses an empty in-memory session fallback when the primary area is unavailable', async () => {
    const unavailable: StorageArea = {
      get: () => Promise.reject(new Error('unavailable')),
      remove: () => Promise.reject(new Error('unavailable')),
      set: () => Promise.reject(new Error('unavailable')),
    }
    const storage = new FallbackStorageArea(unavailable)

    await storage.set({ session: { safe: true } })

    expect(storage.usingFallback).toBe(true)
    expect(await storage.get(['session'])).toEqual({ session: { safe: true } })
  })
})

describe('configuration migrations', () => {
  it('migrates version zero through the current schema', () => {
    const current = createDefaultConfig()
    const legacy = {
      general: {
        mode: 'DIRECT',
      },
      groups: [],
      profiles: current.profiles,
      revision: 4,
      rules: current.rules,
      schemaVersion: 0,
    }
    const result = migrateConfig(legacy)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.schemaVersion).toBe(2)
      expect(result.value.revision).toBe(4)
      expect(result.value.appearance.theme).toBe('SYSTEM')
      expect(result.value.general.loggingEnabled).toBe(true)
    }
  })

  it('removes untouched preset demos while preserving edited and user rules in global order', () => {
    const legacyRule = { ...rule('legacy-rule', 3), groupId: 'legacy-group' }
    const untouchedDemo = {
      ...rule('demo-work', 0),
      description: 'Disabled example for the Work group. You can edit or delete it.',
      enabled: false,
      groupId: 'work',
      name: 'Work example',
      pattern: '^https://work\\.example/$',
    }
    const editedDemo = {
      ...rule('demo-russian-sites', 1),
      description: 'Disabled example for the Russian Sites group. You can edit or delete it.',
      enabled: true,
      groupId: 'russian-sites',
      name: 'Russian Sites example',
      pattern: '^https://russian\\.example/$',
    }
    const result = migrateConfig({
      ...createDefaultConfig(),
      groups: [
        { id: 'work', isPreset: true, name: 'Work', position: 0 },
        { id: 'russian-sites', isPreset: true, name: 'Russian Sites', position: 1 },
        { id: 'legacy-group', isPreset: false, name: 'Legacy', position: 2 },
      ],
      rules: [legacyRule, untouchedDemo, editedDemo],
      schemaVersion: 1,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).not.toHaveProperty('groups')
    expect(result.value.rules.map(({ id, position }) => ({ id, position }))).toEqual([
      { id: 'demo-russian-sites', position: 0 },
      { id: 'legacy-rule', position: 1 },
    ])
    expect(result.value.rules.every((candidate) => !('groupId' in candidate))).toBe(true)
  })

  it('rejects unknown future versions', () => {
    expect(migrateConfig({ schemaVersion: 99 })).toEqual({
      error: {
        code: 'UNSUPPORTED_SCHEMA_VERSION',
        issues: [],
        version: 99,
      },
      ok: false,
    })
  })
})
