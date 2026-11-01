import type messageCatalog from '../../public/_locales/en/messages.json'
import { browser } from 'wxt/browser'

export type MessageKey = keyof typeof messageCatalog
export type MessageSubstitutions = string | string[]

export const t = (key: MessageKey, substitutions?: MessageSubstitutions): string =>
  substitutions === undefined
    ? browser.i18n.getMessage(key)
    : browser.i18n.getMessage(key, substitutions)

export const requireMessage = (key: MessageKey, substitutions?: MessageSubstitutions): string => {
  const message = t(key, substitutions)
  if (message.length === 0) {
    throw new Error(`Missing localized message: ${key}`)
  }
  return message
}

/** Browser UI language (e.g. `ru`, `en-US`); the extension shows its matching catalog. */
export const uiLanguage = (): string => {
  try {
    const language = browser.i18n.getUILanguage()
    return typeof language === 'string' && language.length > 0 ? language : 'en'
  } catch {
    return 'en'
  }
}

/** Keeps `<html lang>` in step with the catalog the browser chose, for screen readers. */
export const applyDocumentLanguage = (root: HTMLElement): void => {
  root.lang = uiLanguage()
}

/** A number with fixed decimals and the UI language's separator (92.4 / 92,4). */
export const formatDecimal = (value: number, fractionDigits: number): string =>
  new Intl.NumberFormat([uiLanguage(), 'en'], {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  }).format(value)
