import { describe, expect, it } from 'vitest'

import {
  MAX_IMPORT_RECORDS,
  MAX_IMPORT_TEXT_LENGTH,
  previewProxyLines,
  ProxyLineImportService,
  type ProxyLineImportOptions,
} from '../../../src/application/profiles/proxy-line-import'
import type { IdGenerator } from '../../../src/domain/types/brand'
import type { Clock } from '../../../src/domain/types/entities'
import { config, endpoint, profile } from '../domain/fixtures'

const options: ProxyLineImportOptions = { defaultTransport: 'HTTP', fieldOrder: 'HOST_FIRST' }
const clock: Clock = { now: () => new Date('2026-11-01T00:00:00.000Z') }

class SequentialIds implements IdGenerator {
  #next = 0
  next(): string {
    this.#next += 1
    return `imported-${this.#next}`
  }
}

const existing = profile('existing', {
  httpEndpoint: { ...endpoint('proxy.example', 3128), password: 'old', username: 'alice' },
  httpsEndpoint: { ...endpoint('proxy.example', 3128), password: 'old', username: 'alice' },
  name: 'Office',
  useSameProxy: true,
})

const preview = (text: string, appConfig = config({ profiles: [existing] }), opts = options) => {
  const result = previewProxyLines(text, opts, appConfig)
  if (!result.ok) throw new Error(result.error.code)
  return result.value
}

describe('proxy line import preview', () => {
  it('skips blank and comment lines and keeps original line numbers', () => {
    const { lines } = preview('# list\n\n192.0.2.1:8080\n// note\nnot a proxy\n')
    expect(lines.map((line) => [line.lineNumber, line.status, line.errorCode])).toEqual([
      [3, 'NEW', null],
      [5, 'ERROR', 'FORMAT'],
    ])
  })

  it('applies the default transport only to lines without a protocol', () => {
    const { lines } = preview('192.0.2.1:8080\nhttps://192.0.2.2:8443', undefined, {
      ...options,
      defaultTransport: 'HTTPS',
    })
    expect(lines.map((line) => line.transport)).toEqual(['HTTPS', 'HTTPS'])
    expect(preview('https://192.0.2.2:8443').lines[0]?.transport).toBe('HTTPS')
  })

  it('marks earlier repeats in the batch as duplicates so the last line wins', () => {
    const { lines } = preview('192.0.2.1:8080:u:one\n192.0.2.1:8080:u:two')
    expect(lines.map((line) => line.status)).toEqual(['DUPLICATE', 'NEW'])
  })

  it('updates a matching profile when the password or transport changes', () => {
    const { lines } = preview(
      [
        'alice:old@PROXY.example:3128',
        'alice:new@proxy.example:3128',
        'https://alice:old@proxy.example:3128',
      ].join('\n'),
    )
    expect(lines.map((line) => [line.status, line.existingProfileId])).toEqual([
      ['DUPLICATE', 'existing'],
      ['DUPLICATE', 'existing'],
      ['UPDATE', 'existing'],
    ])
    expect(preview('alice:old@proxy.example:3128').lines[0]?.status).toBe('UNCHANGED')
  })

  it('resolves ambiguous four-field lines with the chosen field order', () => {
    const text = '1.2.3.4:8080:john.doe:12345'
    expect(preview(text).lines[0]).toMatchObject({ ambiguous: true, host: '1.2.3.4', port: 8080 })
    expect(
      preview(text, undefined, { ...options, fieldOrder: 'CREDENTIALS_FIRST' }).lines[0],
    ).toMatchObject({ ambiguous: true, host: 'john.doe', port: 12345 })
  })

  it('caps the batch size and rejects oversized text', () => {
    const many = Array.from({ length: MAX_IMPORT_RECORDS + 3 }, (_, index) => {
      return `10.0.${Math.floor(index / 250)}.${(index % 250) + 1}:8080`
    }).join('\n')
    const result = preview(many)
    expect(result.lines).toHaveLength(MAX_IMPORT_RECORDS)
    expect(result.droppedCount).toBe(3)
    expect(previewProxyLines('x'.repeat(MAX_IMPORT_TEXT_LENGTH + 1), options, config())).toEqual({
      error: { code: 'INPUT_TOO_LARGE' },
      ok: false,
    })
  })

  it('never exposes passwords in the preview', () => {
    const view = preview('http://user:TopSecret@192.0.2.1:8080\n192.0.2.2:1:u:AlsoSecret')
    expect(JSON.stringify(view)).not.toMatch(/TopSecret|AlsoSecret/u)
  })
})

describe('proxy line import apply', () => {
  const service = new ProxyLineImportService(new SequentialIds(), clock)

  it('creates profiles named host:port and updates matches in one config', () => {
    const appConfig = config({
      profiles: [existing, profile('taken', { name: '192.0.2.1:8080' })],
    })
    const result = service.apply(
      appConfig,
      'https://bob:pw@192.0.2.1:8080\nalice:new@proxy.example:3128\nbroken',
      options,
    )
    if (!result.ok) throw new Error(result.error.code)
    expect(result.value).toMatchObject({ created: 1, skipped: 1, updated: 1 })

    const created = result.value.config.profiles.find((entry) => entry.id === 'imported-1')
    expect(created).toMatchObject({
      checkUrl: appConfig.general.ipGeoProviderEndpoint,
      httpEndpoint: {
        host: '192.0.2.1',
        password: 'pw',
        port: 8080,
        transport: 'HTTPS',
        username: 'bob',
      },
      httpsEndpoint: {
        host: '192.0.2.1',
        password: 'pw',
        port: 8080,
        transport: 'HTTPS',
        username: 'bob',
      },
      name: '192.0.2.1:8080 (2)',
      useSameProxy: true,
    })
    const updated = result.value.config.profiles.find((entry) => entry.id === existing.id)
    expect(updated).toMatchObject({
      color: existing.color,
      httpEndpoint: { password: 'new', transport: 'HTTP' },
      httpsEndpoint: { password: 'new' },
      name: 'Office',
    })
  })

  it('reports nothing to import instead of committing an unchanged config', () => {
    expect(service.apply(config({ profiles: [existing] }), '# only a comment', options)).toEqual({
      error: { code: 'NOTHING_TO_IMPORT' },
      ok: false,
    })
  })
})
