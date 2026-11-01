import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

import english from '../../../public/_locales/en/messages.json'

type Entry = {
  readonly message: string
  readonly placeholders?: Record<string, { readonly content: string }>
}
type Catalog = Record<string, Entry>

const russian = JSON.parse(await readFile('public/_locales/ru/messages.json', 'utf8')) as Catalog
const source = english as Catalog
const tokens = (text: string): string[] =>
  [...text.matchAll(/\$[A-Za-z0-9_]+\$|\$\d/gu)].map(([token]) => token).sort()

describe('Russian message catalog', () => {
  it('translates exactly the English keys', () => {
    expect(Object.keys(russian).sort()).toEqual(Object.keys(source).sort())
  })

  it('keeps placeholders and substitution tokens intact', () => {
    for (const [key, entry] of Object.entries(source)) {
      const translated = russian[key]!
      expect(translated.message.trim(), key).not.toBe('')
      expect(tokens(translated.message), key).toEqual(tokens(entry.message))
      expect(translated.placeholders, key).toEqual(entry.placeholders)
    }
  })

  it('is actually Russian for prose and keeps the safety disclosures', () => {
    const cyrillic = Object.entries(russian).filter(([, entry]) =>
      /[А-Яа-яЁё]/u.test(entry.message),
    )
    expect(cyrillic.length / Object.keys(russian).length).toBeGreaterThan(0.9)
    expect(russian.credentialsStorageNotice!.message).toMatch(/мастер-парол/u)
    expect(russian.credentialExportWarning!.message).toMatch(/открыт|незашифр/u)
    expect(russian.temporaryOverrideWarning!.message).toMatch(/вкладк/u)
  })
})
