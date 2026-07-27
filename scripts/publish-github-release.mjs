import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const checksumFilename = 'SHA256SUMS'

const defaultRunner = (args) => {
  const result = spawnSync('gh', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return {
    status: result.status ?? 1,
    stderr: result.stderr || result.error?.message || '',
    stdout: result.stdout ?? '',
  }
}

const fail = (message) => {
  throw new Error(message)
}

const requireSuccess = (result, description) => {
  if (result.status === 0) return
  const detail = result.stderr.trim() || result.stdout.trim() || `exit ${result.status}`
  fail(`${description}: ${detail}`)
}

export const parseChecksumManifest = (source) => {
  const entries = new Map()
  const lines = source.split(/\r?\n/u).filter((line) => line.length > 0)
  if (lines.length === 0) fail(`${checksumFilename} is empty`)

  for (const line of lines) {
    const match = /^([a-f\d]{64}) [ *](.+)$/iu.exec(line)
    if (!match) fail(`Invalid ${checksumFilename} line: ${line}`)
    const [, digest = '', filename = ''] = match
    if (filename !== basename(filename) || filename === '.' || filename === '..') {
      fail(`${checksumFilename} must contain portable basenames, got: ${filename}`)
    }
    if (entries.has(filename)) fail(`Duplicate ${checksumFilename} entry: ${filename}`)
    entries.set(filename, digest.toLowerCase())
  }

  return entries
}

const sha256 = async (path) =>
  createHash('sha256')
    .update(await readFile(path))
    .digest('hex')

export const verifyReleaseAssets = async (assetPaths) => {
  const basenames = assetPaths.map((path) => basename(path))
  if (new Set(basenames).size !== basenames.length) fail('Release asset basenames must be unique')

  const checksumIndexes = basenames.flatMap((name, index) =>
    name === checksumFilename ? [index] : [],
  )
  if (checksumIndexes.length !== 1) {
    fail(`Release assets must contain exactly one ${checksumFilename}`)
  }

  const checksumIndex = checksumIndexes[0]
  const checksumPath = assetPaths[checksumIndex]
  const archivePaths = assetPaths.filter((_, index) => index !== checksumIndex)
  if (archivePaths.length === 0 || archivePaths.some((path) => !path.endsWith('.zip'))) {
    fail('Release assets must contain ZIP archives plus SHA256SUMS')
  }

  for (const path of assetPaths) {
    const metadata = await stat(path)
    if (!metadata.isFile() || metadata.size === 0) fail(`Release asset is empty: ${path}`)
  }

  const entries = parseChecksumManifest(await readFile(checksumPath, 'utf8'))
  const expectedNames = archivePaths.map((path) => basename(path)).sort()
  const manifestNames = [...entries.keys()].sort()
  if (JSON.stringify(expectedNames) !== JSON.stringify(manifestNames)) {
    fail(
      `${checksumFilename} entries do not exactly match release ZIPs: ` +
        `${manifestNames.join(', ')}`,
    )
  }

  for (const path of archivePaths) {
    const name = basename(path)
    const actual = await sha256(path)
    if (entries.get(name) !== actual) fail(`SHA-256 mismatch for ${name}`)
  }

  return basenames
}

const parseRelease = (result, tag, expectedAssets) => {
  requireSuccess(result, `Cannot inspect GitHub Release ${tag}`)
  let release
  try {
    release = JSON.parse(result.stdout)
  } catch {
    fail(`GitHub Release ${tag} returned invalid JSON`)
  }

  if (release.tagName !== tag) fail(`GitHub Release tag mismatch: ${String(release.tagName)}`)
  if (release.isDraft === true) fail(`GitHub Release ${tag} must not be a draft`)
  if (release.isPrerelease === true) fail(`GitHub Release ${tag} must not be a prerelease`)

  if (expectedAssets) {
    const actualAssets = Array.isArray(release.assets)
      ? release.assets.map((asset) => asset?.name).filter((name) => typeof name === 'string')
      : []
    const missing = expectedAssets.filter((name) => !actualAssets.includes(name))
    if (missing.length > 0) {
      fail(`GitHub Release ${tag} is missing assets: ${missing.join(', ')}`)
    }
  }
}

export const publishGitHubRelease = async ({
  tag,
  assetPaths,
  runner = defaultRunner,
  output = process.stdout,
}) => {
  if (!/^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u.test(tag)) {
    fail(`Expected a stable vMAJOR.MINOR.PATCH tag, got: ${tag}`)
  }

  const resolvedAssets = assetPaths.map((path) => resolve(path))
  const expectedAssets = await verifyReleaseAssets(resolvedAssets)
  const createResult = runner([
    'release',
    'create',
    tag,
    ...resolvedAssets,
    '--verify-tag',
    '--generate-notes',
  ])

  if (createResult.status === 0) {
    output.write(`Created GitHub Release ${tag}.\n`)
  } else {
    const existingResult = runner([
      'release',
      'view',
      tag,
      '--json',
      'tagName,isDraft,isPrerelease',
    ])
    if (existingResult.status !== 0) {
      const createDetail =
        createResult.stderr.trim() || createResult.stdout.trim() || `exit ${createResult.status}`
      fail(`Cannot create GitHub Release ${tag}: ${createDetail}`)
    }
    parseRelease(existingResult, tag)

    const uploadResult = runner(['release', 'upload', tag, ...resolvedAssets, '--clobber'])
    requireSuccess(uploadResult, `Cannot refresh GitHub Release ${tag} assets`)
    output.write(`Refreshed existing GitHub Release ${tag} assets.\n`)
  }

  const publishedResult = runner([
    'release',
    'view',
    tag,
    '--json',
    'tagName,isDraft,isPrerelease,assets',
  ])
  parseRelease(publishedResult, tag, expectedAssets)

  const downloadDirectory = await mkdtemp(join(tmpdir(), 'proxyloom-release-'))
  try {
    const downloadArgs = ['release', 'download', tag, '--dir', downloadDirectory]
    for (const name of expectedAssets) downloadArgs.push('--pattern', name)
    const downloadResult = runner(downloadArgs)
    requireSuccess(downloadResult, `Cannot download GitHub Release ${tag} for verification`)
    await verifyReleaseAssets(expectedAssets.map((name) => join(downloadDirectory, name)))
  } finally {
    await rm(downloadDirectory, { recursive: true, force: true })
  }

  output.write(`Downloaded GitHub Release ${tag} assets passed SHA-256 verification.\n`)
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const [tag = '', ...assetPaths] = process.argv.slice(2)
  publishGitHubRelease({ tag, assetPaths }).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
