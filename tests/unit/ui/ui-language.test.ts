import './support'

import { afterEach, describe, expect, it } from 'vitest'

import { applyDocumentLanguage, formatDecimal, uiLanguage } from '../../../src/i18n/messages'
import { countryDisplay } from '../../../src/ui/flags/country'

const i18n = (globalThis as unknown as { chrome: { i18n: Record<string, unknown> } }).chrome.i18n

afterEach(() => {
  delete i18n.getUILanguage
})

describe('UI language', () => {
  it('follows the browser UI language and falls back to English', () => {
    expect(uiLanguage()).toBe('en')
    i18n.getUILanguage = () => 'ru'
    expect(uiLanguage()).toBe('ru')
  })

  it('marks the document language for assistive technology', () => {
    i18n.getUILanguage = () => 'ru-RU'
    applyDocumentLanguage(document.documentElement)
    expect(document.documentElement.lang).toBe('ru-RU')
  })

  it('names countries in the UI language', () => {
    i18n.getUILanguage = () => 'ru'
    expect(countryDisplay('DE').name).toBe('Германия')
    i18n.getUILanguage = () => 'en'
    expect(countryDisplay('DE').name).toBe('Germany')
  })

  it('formats decimals with the UI language separator', () => {
    i18n.getUILanguage = () => 'ru'
    expect(formatDecimal(92.44, 1)).toBe('92,4')
    i18n.getUILanguage = () => 'en'
    expect(formatDecimal(92.44, 1)).toBe('92.4')
  })
})
