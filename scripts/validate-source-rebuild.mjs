import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const workspace = resolve(fileURLToPath(new URL('..', import.meta.url)))
const packageJson = JSON.parse(await readFile(join(workspace, 'package.json'), 'utf8'))
const manifest = JSON.parse(
  await readFile(join(workspace, '.output/chrome-mv3/manifest.json'), 'utf8'),
)
const product = String(manifest.name).replaceAll(/[^A-Za-z0-9._-]/g, '-')
const sourceArchive =
  process.argv[2] ??
  join(workspace, `.output/${product}-${packageJson.version}-firefox-sources.zip`)
const referenceBuild = join(workspace, '.output/firefox-mv3')

const archiveEntries = execFileSync('unzip', ['-Z1', sourceArchive], {
  encoding: 'utf8',
})
  .split(/\r?\n/u)
  .filter(Boolean)

const unsafeEntry = archiveEntries.find(
  (entry) =>
    entry.startsWith('/') || entry.startsWith(`..${sep}`) || entry.split(/[\\/]/u).includes('..'),
)
if (unsafeEntry) throw new Error(`Unsafe source archive entry: ${unsafeEntry}`)

const collectFiles = async (root) => {
  const files = []
  const visit = async (directory) => {
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) await visit(path)
      else if (entry.isFile()) files.push(relative(root, path).split(sep).join('/'))
      else throw new Error(`Unexpected non-file build entry: ${path}`)
    }
  }
  await visit(root)
  return files.sort()
}

const digest = async (path) =>
  createHash('sha256')
    .update(await readFile(path))
    .digest('hex')

const run = (command, arguments_, options) => {
  try {
    execFileSync(command, arguments_, {
      ...options,
      encoding: 'utf8',
      stdio: 'pipe',
    })
  } catch (error) {
    if (error && typeof error === 'object') {
      if ('stdout' in error && error.stdout) process.stderr.write(String(error.stdout))
      if ('stderr' in error && error.stderr) process.stderr.write(String(error.stderr))
    }
    throw error
  }
}

const temporaryRoot = await mkdtemp(join(tmpdir(), 'proxyloom-source-rebuild-'))
try {
  run('unzip', ['-q', sourceArchive, '-d', temporaryRoot])
  run('pnpm', ['install', '--frozen-lockfile'], {
    cwd: temporaryRoot,
    env: { ...process.env, CI: 'true' },
  })
  run('pnpm', ['build:firefox'], {
    cwd: temporaryRoot,
    env: { ...process.env, CI: 'true' },
  })

  const rebuilt = join(temporaryRoot, '.output/firefox-mv3')
  const [expectedFiles, rebuiltFiles] = await Promise.all([
    collectFiles(referenceBuild),
    collectFiles(rebuilt),
  ])
  if (JSON.stringify(expectedFiles) !== JSON.stringify(rebuiltFiles)) {
    const expectedSet = new Set(expectedFiles)
    const rebuiltSet = new Set(rebuiltFiles)
    const missing = expectedFiles.filter((file) => !rebuiltSet.has(file))
    const extra = rebuiltFiles.filter((file) => !expectedSet.has(file))
    throw new Error(
      `Firefox source rebuild paths differ; missing: ${missing.join(', ') || 'none'}; extra: ${
        extra.join(', ') || 'none'
      }`,
    )
  }

  for (const file of expectedFiles) {
    const [expectedHash, rebuiltHash] = await Promise.all([
      digest(join(referenceBuild, file)),
      digest(join(rebuilt, file)),
    ])
    if (expectedHash !== rebuiltHash) {
      throw new Error(`Firefox source rebuild differs at ${file}`)
    }
  }

  process.stdout.write(
    `Firefox source package reproduced ${expectedFiles.length} release-build files exactly.\n`,
  )
} finally {
  await rm(temporaryRoot, { force: true, recursive: true })
}
