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
