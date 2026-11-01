import { describe, expect, it } from 'vitest'

import { MemoryStorageArea } from '../../../src/storage/config/storage-area'
import {
  OVERRIDES_SCHEMA_VERSION,
  SessionRepository,
} from '../../../src/storage/session/session-repository'
import { override } from '../domain/fixtures'

const legacy = (options: Record<string, unknown> = {}) => {
  const rest: Record<string, unknown> = { ...override(options) }
  delete rest.sourceHostname
  return rest
}

describe('session overrides envelope', () => {
  it('writes a versioned envelope', async () => {
    const storage = new MemoryStorageArea()
    await new SessionRepository(storage).setOverrides([override({ sourceHostname: 'a.example' })])
    const stored = (await storage.get(['session.overrides']))['session.overrides']
    expect(stored).toMatchObject({
      overrides: [{ sourceHostname: 'a.example' }],
      schemaVersion: OVERRIDES_SCHEMA_VERSION,
    })
    expect(OVERRIDES_SCHEMA_VERSION).toBe(2)
  })

  it('migrates a legacy bare array by deriving sourceHostname from originKey, idempotently', async () => {
    const storage = new MemoryStorageArea({
      'session.overrides': [
        legacy({ originKey: 'www.example.com', scope: 'EXACT_HOSTNAME' }),
        legacy({ id: 'o2', originKey: 'example.co.uk', scope: 'REGISTRABLE_DOMAIN' }),
      ],
    })
    const repository = new SessionRepository(storage)
    const first = await repository.getOverrides()
    expect(first.map((entry) => entry.sourceHostname)).toEqual(['www.example.com', 'example.co.uk'])

    await repository.setOverrides(first)
    expect(await repository.getOverrides()).toEqual(first)
  })

  it('fails safe on malformed or future envelopes instead of activating stale overrides', async () => {
    for (const payload of [
      { overrides: [override()], schemaVersion: 3 },
      { overrides: 'nope', schemaVersion: 2 },
      [{ ...legacy(), originKey: 42 }],
    ]) {
      const repository = new SessionRepository(
        new MemoryStorageArea({ 'session.overrides': payload }),
      )
      expect(await repository.getOverrides()).toEqual([])
    }
  })
})
