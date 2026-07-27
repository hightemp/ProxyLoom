import { createHash } from 'node:crypto'
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  parseChecksumManifest,
  publishGitHubRelease,
  verifyReleaseAssets,
} from '../../../scripts/publish-github-release.mjs'

interface CommandResult {
  readonly status: number
  readonly stdout: string
  readonly stderr: string
}

const temporaryDirectories: string[] = []

const makeFixture = () => {
  const directory = mkdtempSync(join(tmpdir(), 'proxyloom-release-test-'))
  temporaryDirectories.push(directory)
  const archives = ['ProxyLoom-0.1.0-chromium.zip', 'ProxyLoom-0.1.0-firefox.zip'].map(
    (name, index) => {
      const path = join(directory, name)
      writeFileSync(path, `archive-${index}`)
      return path
    },
  )
  const sums = archives
    .map((path, index) => {
      const digest = createHash('sha256').update(`archive-${index}`).digest('hex')
      return `${digest}  ${basename(path)}`
    })
    .join('\n')
  const checksumPath = join(directory, 'SHA256SUMS')
  writeFileSync(checksumPath, `${sums}\n`)
  return { assetPaths: [...archives, checksumPath] }
}

const success = (stdout = ''): CommandResult => ({ status: 0, stderr: '', stdout })

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe('GitHub Release publisher', () => {
  it('requires portable, unique checksum entries', () => {
    const digest = 'a'.repeat(64)
    expect(() => parseChecksumManifest(`${digest}  .output/archive.zip\n`)).toThrow(
      'portable basenames',
    )
    expect(() => parseChecksumManifest(`${digest}  archive.zip\n${digest}  archive.zip\n`)).toThrow(
      'Duplicate',
    )
  })

  it('rejects a local checksum mismatch before contacting GitHub', async () => {
    const fixture = makeFixture()
    writeFileSync(fixture.assetPaths[0]!, 'tampered')
    let contacted = false

    await expect(
      publishGitHubRelease({
        assetPaths: fixture.assetPaths,
        runner: () => {
          contacted = true
          return success()
        },
        tag: 'v0.1.0',
      }),
    ).rejects.toThrow('SHA-256 mismatch')
    expect(contacted).toBe(false)
  })

  it('creates, downloads and verifies a new release', async () => {
    const fixture = makeFixture()
    const calls: string[][] = []
    const runner = (args: readonly string[]): CommandResult => {
      calls.push([...args])
      if (args[1] === 'view') {
        return success(
          JSON.stringify({
            assets: fixture.assetPaths.map((path) => ({ name: basename(path) })),
            isDraft: false,
            isPrerelease: false,
            tagName: 'v0.1.0',
          }),
        )
      }
      if (args[1] === 'download') {
        const destination = args[args.indexOf('--dir') + 1]!
        for (const path of fixture.assetPaths) copyFileSync(path, join(destination, basename(path)))
      }
      return success()
    }
    let output = ''

    await publishGitHubRelease({
      assetPaths: fixture.assetPaths,
      output: { write: (value: string) => (output += value) },
      runner,
      tag: 'v0.1.0',
    })

    expect(calls.map((args) => args.slice(0, 2))).toEqual([
      ['release', 'create'],
      ['release', 'view'],
      ['release', 'download'],
    ])
    expect(output).toContain('Created GitHub Release v0.1.0')
    expect(output).toContain('passed SHA-256 verification')
  })

  it('refreshes the same release on an idempotent retry', async () => {
    const fixture = makeFixture()
    const calls: string[][] = []
    let viewCount = 0
    const runner = (args: readonly string[]): CommandResult => {
      calls.push([...args])
      if (args[1] === 'create') return { status: 1, stderr: 'already exists', stdout: '' }
      if (args[1] === 'view') {
        viewCount += 1
        return success(
          JSON.stringify({
            ...(viewCount > 1
              ? { assets: fixture.assetPaths.map((path) => ({ name: basename(path) })) }
              : {}),
            isDraft: false,
            isPrerelease: false,
            tagName: 'v0.1.0',
          }),
        )
      }
      if (args[1] === 'download') {
        const destination = args[args.indexOf('--dir') + 1]!
        for (const path of fixture.assetPaths) copyFileSync(path, join(destination, basename(path)))
      }
      return success()
    }

    await publishGitHubRelease({
      assetPaths: fixture.assetPaths,
      output: { write: () => true },
      runner,
      tag: 'v0.1.0',
    })

    expect(calls.map((args) => args.slice(0, 2))).toEqual([
      ['release', 'create'],
      ['release', 'view'],
      ['release', 'upload'],
      ['release', 'view'],
      ['release', 'download'],
    ])
    expect(calls.find((args) => args[1] === 'upload')).toContain('--clobber')
  })

  it('rejects an existing draft instead of mutating it', async () => {
    const fixture = makeFixture()
    const calls: string[][] = []
    const runner = (args: readonly string[]): CommandResult => {
      calls.push([...args])
      if (args[1] === 'create') return { status: 1, stderr: 'already exists', stdout: '' }
      return success(
        JSON.stringify({
          isDraft: true,
          isPrerelease: false,
          tagName: 'v0.1.0',
        }),
      )
    }

    await expect(
      publishGitHubRelease({
        assetPaths: fixture.assetPaths,
        runner,
        tag: 'v0.1.0',
      }),
    ).rejects.toThrow('must not be a draft')
    expect(calls.some((args) => args[1] === 'upload')).toBe(false)
  })

  it('requires the checksum manifest to exactly describe every ZIP', async () => {
    const fixture = makeFixture()
    const describedArchive = fixture.assetPaths[0]!
    const checksumPath = fixture.assetPaths.at(-1)!
    const digest = createHash('sha256').update('archive-0').digest('hex')
    writeFileSync(checksumPath, `${digest}  ${basename(describedArchive)}\n`)

    await expect(verifyReleaseAssets(fixture.assetPaths)).rejects.toThrow(
      'do not exactly match release ZIPs',
    )
  })
})
