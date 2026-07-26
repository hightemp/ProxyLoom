import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const script = resolve('scripts/validate-release.mjs')
const version = (
  JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as { readonly version: string }
).version
const tag = `v${version}`

const validate = (tag: string) => {
  try {
    return {
      output: execFileSync(process.execPath, [script, tag], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
      status: 0,
    }
  } catch (error) {
    const failure = error as { readonly status?: number; readonly stderr?: Buffer | string }
    return {
      output: String(failure.stderr ?? ''),
      status: failure.status ?? 1,
    }
  }
}

describe('release tag validation script', () => {
  it('accepts the authoritative stable version', () => {
    expect(validate(tag)).toEqual({
      output: `Release version validated: ${tag}\n`,
      status: 0,
    })
  })

  it.each([version, 'v01.1.0', `${tag}-beta.1`])('rejects invalid stable tag %s', (candidate) => {
    const result = validate(candidate)
    expect(result.status).not.toBe(0)
    expect(result.output).toContain('stable SemVer')
  })

  it('rejects a valid tag that differs from package.json', () => {
    const [major = '0', minor = '0', patch = '0'] = version.split('.')
    const mismatch = `v${major}.${minor}.${String(Number(patch) + 1)}`
    const result = validate(mismatch)
    expect(result.status).not.toBe(0)
    expect(result.output).toContain(`does not match package version ${tag}`)
  })
})
