import { message } from './support'

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  checkErrorLabel,
  controlStatusLabel,
  decisionActionLabel,
  decisionSourceLabel,
  errorText,
  foxyProxySkipLabel,
  inspectionReasonLabel,
  modeLabel,
  platformLabel,
  proxyInfoTypeLabel,
  requestTypeLabel,
  ruleTraceStatusLabel,
  ruleValidityLabel,
} from '../../../src/ui/labels'

const sourceFiles = (directory: string): string[] =>
  readdirSync(directory).flatMap((name) => {
    const path = join(directory, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(?:vue|ts)$/u.test(name) ? [path] : []
  })

describe('enum labels', () => {
  it.each([
    ['mode', modeLabel, ['DIRECT', 'PROXY', 'RULES']],
    ['decision action', decisionActionLabel, ['DIRECT', 'PROXY', 'CONFIG_ERROR']],
    ['decision source', decisionSourceLabel, ['MODE', 'OVERRIDE', 'RULE', 'FALLBACK']],
    ['inspection reason', inspectionReasonLabel, ['NO_ACTIVE_TAB', 'UNSUPPORTED_URL']],
    [
      'control status',
      controlStatusLabel,
      [
        'CONTROLLED_BY_THIS_EXTENSION',
        'CONTROLLABLE',
        'CONTROLLED_BY_OTHER_EXTENSION',
        'CONTROLLED_BY_POLICY',
        'NOT_CONTROLLABLE',
      ],
    ],
    ['rule validity', ruleValidityLabel, ['VALID', 'INVALID_REFERENCE', 'INVALID_PATTERN']],
    [
      'trace status',
      ruleTraceStatusLabel,
      [
        'MATCHED',
        'NO_MATCH',
        'DISABLED',
        'TEMPORARILY_DISABLED',
        'INCOMPATIBLE',
        'INVALID_PATTERN',
      ],
    ],
    [
      'request type',
      requestTypeLabel,
      ['MAIN_FRAME', 'SUB_FRAME', 'XMLHTTPREQUEST', 'WEBSOCKET', 'DOWNLOAD', 'OTHER'],
    ],
    ['proxy info type', proxyInfoTypeLabel, ['DIRECT', 'HTTP', 'HTTPS', 'SOCKS', 'UNKNOWN']],
    ['platform', platformLabel, ['CHROMIUM', 'FIREFOX']],
  ] as const)('localizes every %s value without raw enum text', (_, label, values) => {
    for (const value of values) {
      const text = (label as (input: string) => string)(value)
      expect(text, value).not.toBe('')
      if (value.includes('_')) expect(text, value).not.toContain('_')
    }
  })

  it('localizes proxy check failure codes and falls back for unknown ones', () => {
    expect(checkErrorLabel('NETWORK_ERROR')).toBe(message('checkNetworkError'))
    expect(checkErrorLabel('TIMEOUT')).toBe(message('checkTimeout'))
    expect(checkErrorLabel('SOMETHING_NEW')).toBe(message('checkFailed'))
  })

  it('localizes FoxyProxy skip reasons and falls back for unknown ones', () => {
    expect(foxyProxySkipLabel('UNSUPPORTED_SOCKS')).toBe(message('skipUnsupportedSocks'))
    expect(foxyProxySkipLabel('SOMETHING_NEW')).toBe(message('skipOther'))
  })

  it('renders known runtime errors as localized sentences and unknown ones with a code', () => {
    const known = { code: 'ACTIVE_PROFILE_REQUIRED', message: 'raw' }
    expect(errorText(known)).toBe(message('errorActiveProfileRequired'))
    const internal = { code: 'SOMETHING_ELSE', message: 'raw internal text' }
    const unknown = errorText(internal)
    expect(unknown).toContain('SOMETHING_ELSE')
    expect(unknown).not.toContain('raw internal text')
  })

  it('keeps raw enum formatting and raw runtime errors out of extension UI', () => {
    const offenders = [...sourceFiles('entrypoints'), ...sourceFiles('src/ui')]
      .filter((path) => !path.endsWith('background.ts'))
      .filter((path) =>
        /replaceAll\('_', ' '\)|error\.code\}: \$\{|\{\{\s*mode\s*\}\}|general\.mode\s*\}\}|decision\.(?:action|source)\s*\}\}/u.test(
          readFileSync(path, 'utf8'),
        ),
      )
    expect(offenders).toEqual([])
  })
})
