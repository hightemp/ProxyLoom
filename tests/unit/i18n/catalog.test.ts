import { describe, expect, it } from 'vitest'

import catalog from '../../../public/_locales/en/messages.json'

describe('English message catalog', () => {
  it('contains non-empty messages with no legacy terminal-null wording', () => {
    expect(Object.keys(catalog).length).toBeGreaterThan(150)
    for (const [key, entry] of Object.entries(catalog)) {
      expect(key, 'message key').toMatch(/^[a-z][A-Za-z0-9]*$/)
      expect(entry.message.trim(), key).not.toBe('')
      expect(entry.message, key).not.toMatch(/terminal null|\[proxy,\s*null\]/i)
    }
  })

  it('covers every extension surface and high-risk disclosure', () => {
    expect(catalog.credentialExportWarning.message).toContain('plaintext')
    expect(catalog.credentialsStorageNotice.message).toContain('master password')
    expect(catalog.errorTitle.message).toBe('Proxy connection failed')
    expect(catalog.incognitoPermissionDescription.message).toContain('Private logs')
    expect(catalog.settingsTitle.message).toBe('ProxyLoom Settings')
    expect(catalog.temporaryOverrideWarning.message).toContain('other tabs')
  })
})
