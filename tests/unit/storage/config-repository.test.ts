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

const now = new Date('2026-01-01T00:00:00.000Z')

describe('default configuration', () => {
  it('creates five safe disabled demonstration rules once', () => {
    const value = createDefaultConfig(now)
    expect(value.groups.map((group) => group.name)).toEqual([
      'Work',
      'Russian Sites',
      'International Sites',
      'Social Networks',
      'Local Network',
    ])
    expect(value.rules).toHaveLength(5)
    expect(value.rules.every((rule) => !rule.enabled)).toBe(true)
    expect(value.rules.every((rule) => rule.pattern.includes('example'))).toBe(true)
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
    expect(first.ok && first.value.groups).toHaveLength(5)
  })

  it('validates, increments, and persists an atomic update', async () => {
    const initial = createDefaultConfig(now)
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
    const initial = createDefaultConfig(now)
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
    const initial = createDefaultConfig(now)
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
    const initial = createDefaultConfig(now)
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
    const initial = createDefaultConfig(now)
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
  it('migrates version zero by adding version one defaults', () => {
    const current = createDefaultConfig(now)
    const legacy = {
      general: {
        mode: 'DIRECT',
      },
      groups: current.groups,
      profiles: current.profiles,
      revision: 4,
      rules: current.rules,
      schemaVersion: 0,
    }
    const result = migrateConfig(legacy, now)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.schemaVersion).toBe(1)
      expect(result.value.revision).toBe(4)
      expect(result.value.appearance.theme).toBe('SYSTEM')
      expect(result.value.general.loggingEnabled).toBe(true)
    }
  })

  it('rejects unknown future versions', () => {
    expect(migrateConfig({ schemaVersion: 99 }, now)).toEqual({
      error: {
        code: 'UNSUPPORTED_SCHEMA_VERSION',
        issues: [],
        version: 99,
      },
      ok: false,
    })
  })
})
