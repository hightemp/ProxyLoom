import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { FoxyProxyImporter } from '../../../src/application/import-export/foxyproxy/importer'
import { parseFoxyProxyExport } from '../../../src/application/import-export/foxyproxy/parser'
import { config, profile } from '../domain/fixtures'

const fixture = (name: string): string =>
  readFileSync(resolve(process.cwd(), 'tests', 'fixtures', 'foxyproxy', name), 'utf8')

describe('FoxyProxy parser adapters', () => {
  it('parses the modern data-array variant and reports unsupported entries', () => {
    const result = parseFoxyProxyExport(fixture('v8-redacted.json'))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.adapter).toBe('FOXYPROXY_8_PLUS')
    expect(result.value.candidates).toEqual([
      expect.objectContaining({
        hostname: 'proxy.example',
        port: 8080,
        title: 'Office HTTP',
        transport: 'HTTP',
      }),
      expect.objectContaining({
        hostname: 'secure-proxy.example',
        port: 8443,
        transport: 'HTTPS',
      }),
    ])
    expect(result.value.skipped).toEqual([
      {
        reason: 'UNSUPPORTED_SOCKS',
        sourceIndex: 2,
        title: 'Unsupported SOCKS',
      },
    ])
    expect(result.value.excludedData).toContain('URL patterns and rules')
  })

  it('parses the Firefox 6–7 object variant', () => {
    const result = parseFoxyProxyExport(fixture('v7-redacted.json'))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.adapter).toBe('FOXYPROXY_6_7')
    expect(result.value.candidates[0]).toMatchObject({
      hostname: 'legacy.example',
      port: 3128,
      transport: 'HTTP',
    })
    expect(result.value.skipped[0]?.reason).toBe('DIRECT_ENTRY')
  })

  it('rejects unsupported, zero-profile, malformed and dangerous exports', () => {
    expect(parseFoxyProxyExport('{}')).toMatchObject({
      error: { code: 'UNSUPPORTED_FORMAT' },
      ok: false,
    })
    expect(
      parseFoxyProxyExport(
        JSON.stringify({
          data: [{ hostname: 'socks.example', port: 1080, type: 'socks5' }],
        }),
      ),
    ).toMatchObject({
      error: { code: 'NO_SUPPORTED_PROFILES' },
      ok: false,
    })
    expect(
      parseFoxyProxyExport('{"data":[{"type":"http","hostname":"bad host","port":8080}]}'),
    ).toMatchObject({
      error: { code: 'NO_SUPPORTED_PROFILES' },
      ok: false,
    })
    expect(parseFoxyProxyExport('{"data":[],"constructor":{"prototype":{}}}')).toMatchObject({
      error: { code: 'DANGEROUS_KEY' },
      ok: false,
    })
  })
})

describe('FoxyProxyImporter', () => {
  it('imports only selected profiles through normal validation', () => {
    const parsed = parseFoxyProxyExport(fixture('v8-redacted.json'))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    let index = 0
    const importer = new FoxyProxyImporter(
      { next: () => `foxy-${++index}` },
      { now: () => new Date('2026-07-26T12:00:00.000Z') },
    )
    const current = config({
      profiles: [profile('existing', { name: 'Office HTTP' })],
    })
    const imported = importer.import(current, parsed.value.candidates, new Set([0]))
    expect(imported.ok).toBe(true)
    if (!imported.ok) return
    expect(imported.value.imported).toHaveLength(1)
    expect(imported.value.imported[0]).toMatchObject({
      id: 'foxy-1',
      name: 'Office HTTP imported 2',
      useSameProxy: true,
    })
    expect(imported.value.imported[0]?.note).toContain('Patterns')
    expect(imported.value.config.rules).toEqual(current.rules)
    expect(imported.value.skippedSourceIndexes).toEqual([1])
  })

  it('rejects an empty selection', () => {
    const importer = new FoxyProxyImporter({ next: () => 'unused' }, { now: () => new Date() })
    expect(importer.import(config(), [], new Set())).toEqual({
      error: { code: 'NO_SELECTION' },
      ok: false,
    })
  })
})
