import { describe, expect, it } from 'vitest'

import {
  nativeExportFilename,
  serializeNativeExport,
} from '../../../src/application/import-export/export'
import { NativeImportService } from '../../../src/application/import-export/import'
import { MAX_IMPORT_BYTES } from '../../../src/domain/import-export/native-schema'
import { config, profile, rule } from '../domain/fixtures'

const now = new Date('2026-07-26T12:00:00.000Z')

describe('native export', () => {
  it('excludes credential keys and transient state by default', () => {
    const source = config({
      profiles: [
        profile('profile-1', {
          httpEndpoint: {
            host: 'proxy.example',
            password: 'secret-canary',
            port: 8080,
            transport: 'HTTP',
            username: 'alice',
          },
        }),
      ],
    })
    const text = serializeNativeExport(source, {
      includeCredentials: false,
      now,
    })

    expect(text).not.toContain('secret-canary')
    expect(text).not.toContain('"password"')
    expect(text).not.toContain('"username"')
    expect(text).not.toContain('overrides')
    expect(text).not.toContain('logs')
    expect(nativeExportFilename(now)).toBe('proxyloom-2026-07-26.json')
  })

  it('includes credentials only through the explicit option', () => {
    const source = config({
      profiles: [
        profile('profile-1', {
          httpEndpoint: {
            host: 'proxy.example',
            password: 'secret-canary',
            port: 8080,
            transport: 'HTTP',
            username: 'alice',
          },
        }),
      ],
    })
    const text = serializeNativeExport(source, {
      includeCredentials: true,
      now,
    })
    expect(text).toContain('"includesCredentials": true')
    expect(text).toContain('"password": "secret-canary"')
    expect(text).toContain('"username": "alice"')
  })
})

describe('NativeImportService', () => {
  const ids = {
    index: 0,
    next(): string {
      this.index += 1
      return `generated-${this.index}`
    },
  }

  const exported = (source = config()): string =>
    serializeNativeExport(source, { includeCredentials: false, now })

  it('previews and replaces only with explicit confirmation', () => {
    const service = new NativeImportService(ids)
    const current = config({ revision: 9 })
    const incoming = config({
      profiles: [profile('imported-profile')],
      revision: 2,
      rules: [rule('imported-rule', 0)],
    })
    const preview = service.preview(exported(incoming), current)
    expect(preview.ok).toBe(true)
    if (!preview.ok) return
    expect(preview.value).toMatchObject({
      includesCredentials: false,
      profiles: 1,
      rules: 1,
    })
    expect(service.apply(current, preview.value, 'REPLACE', false)).toEqual({
      error: { code: 'REPLACE_CONFIRMATION_REQUIRED' },
      ok: false,
    })
    const replaced = service.apply(current, preview.value, 'REPLACE', true)
    expect(replaced.ok && replaced.value.revision).toBe(9)
    expect(replaced.ok && replaced.value.profiles[0]?.id).toBe('imported-profile')
  })

  it('merges entities atomically, remaps IDs and references, and preserves order', () => {
    const service = new NativeImportService(ids)
    const current = config({
      profiles: [profile('same', { name: 'Office' })],
      rules: [rule('same-rule', 0, { name: 'Office rule' })],
    })
    const incoming = config({
      profiles: [profile('same', { name: 'Office' })],
      rules: [
        rule('same-rule', 0, {
          action: { targetProxyProfileId: profile('same').id, type: 'PROXY' },
          name: 'Office rule',
        }),
      ],
    })
    const preview = service.preview(exported(incoming), current)
    expect(preview.ok).toBe(true)
    if (!preview.ok) return
    expect(preview.value.idConflicts).toBe(2)
    expect(preview.value.nameConflicts).toBe(2)

    const merged = service.apply(current, preview.value, 'MERGE', false)
    expect(merged.ok).toBe(true)
    if (!merged.ok) return
    expect(merged.value.profiles).toHaveLength(2)
    expect(merged.value.rules).toHaveLength(2)
    expect(merged.value.rules.map(({ position }) => position)).toEqual([0, 1])
    const importedProfile = merged.value.profiles[1]!
    const importedRule = merged.value.rules[1]!
    expect(importedProfile.id).not.toBe('same')
    expect(importedProfile.name).toBe('Office imported')
    expect(importedRule.id).not.toBe('same-rule')
    expect(importedRule.name).toBe('Office rule imported')
    expect(importedRule.action.targetProxyProfileId).toBe(importedProfile.id)
  })

  it('rejects malformed, oversized, and dangerous input', () => {
    const service = new NativeImportService(ids)
    expect(service.preview('{', config())).toMatchObject({
      error: { code: 'JSON_INVALID' },
      ok: false,
    })
    expect(service.preview('x'.repeat(MAX_IMPORT_BYTES + 1), config())).toMatchObject({
      error: { code: 'FILE_TOO_LARGE' },
      ok: false,
    })
    const dangerous = exported().replace(
      '"formatVersion": 1',
      '"__proto__": {}, "formatVersion": 1',
    )
    expect(service.preview(dangerous, config())).toMatchObject({
      error: { code: 'DANGEROUS_KEY' },
      ok: false,
    })
  })

  it('imports version one backups by discarding group metadata only', () => {
    const service = new NativeImportService(ids)
    const legacy = JSON.parse(exported(config({ rules: [rule('legacy-rule', 0)] }))) as Record<
      string,
      unknown
    > & {
      config: Record<string, unknown> & { rules: Array<Record<string, unknown>> }
    }
    legacy.config.schemaVersion = 1
    legacy.config.groups = [{ id: 'legacy-group', isPreset: false, name: 'Legacy', position: 0 }]
    legacy.config.rules[0]!.groupId = 'legacy-group'

    const preview = service.preview(JSON.stringify(legacy), config())
    expect(preview.ok).toBe(true)
    if (!preview.ok) return
    expect(preview.value.document.config.schemaVersion).toBe(2)
    expect(preview.value.document.config).not.toHaveProperty('groups')
    expect(preview.value.document.config.rules[0]).not.toHaveProperty('groupId')
    expect(preview.value.document.config.rules[0]?.id).toBe('legacy-rule')
    expect(preview.value.document.config.rules[0]?.position).toBe(0)
  })

  it('round-trips credential-free exports with empty endpoint credentials', () => {
    const service = new NativeImportService(ids)
    const source = config({
      profiles: [
        profile('profile-1', {
          httpEndpoint: {
            host: 'proxy.example',
            password: 'removed',
            port: 8080,
            transport: 'HTTP',
            username: 'removed',
          },
        }),
      ],
    })
    const preview = service.preview(exported(source), config())
    expect(preview.ok).toBe(true)
    if (!preview.ok) return
    expect(preview.value.document.config.profiles[0]?.httpEndpoint).toMatchObject({
      password: '',
      username: '',
    })
  })
})
