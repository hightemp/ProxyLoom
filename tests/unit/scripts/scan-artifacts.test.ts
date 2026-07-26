import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

const script = resolve('scripts/scan-artifacts.mjs')
const secretCanary = ['proxyloom-secret', 'canary'].join('-')
const temporaryDirectories: string[] = []

const temporaryDirectory = (): string => {
  const directory = mkdtempSync(join(tmpdir(), 'proxyloom-artifact-scan-'))
  temporaryDirectories.push(directory)
  return directory
}

const scan = (arguments_: readonly string[]) => {
  try {
    return {
      output: execFileSync(process.execPath, [script, ...arguments_], {
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

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe('artifact security scanner', () => {
  it('accepts a clean text artifact', () => {
    const directory = temporaryDirectory()
    writeFileSync(join(directory, 'artifact.js'), 'export const clean = true\n')

    expect(scan([directory])).toEqual({
      output: `Artifact security scan passed for ${directory}.\n`,
      status: 0,
    })
  })

  it('rejects a canary in an ordinary artifact', () => {
    const directory = temporaryDirectory()
    writeFileSync(join(directory, 'artifact.js'), `export const leaked = '${secretCanary}'\n`)

    const result = scan([directory])

    expect(result.status).not.toBe(0)
    expect(result.output).toContain(secretCanary)
  })

  it('inspects ZIP contents and ignores pnpm argument separators', () => {
    const directory = temporaryDirectory()
    const input = join(directory, 'input.txt')
    writeFileSync(input, secretCanary)
    execFileSync('zip', ['-q', '-j', join(directory, 'artifact.zip'), input])

    const result = scan(['--', '--inspect-archives', directory])

    expect(result.status).not.toBe(0)
    expect(result.output).toContain(`artifact.zip:input.txt: ${secretCanary}`)
  })
})
