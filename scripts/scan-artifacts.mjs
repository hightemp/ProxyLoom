import { Buffer } from 'node:buffer'
import { execFileSync } from 'node:child_process'
import { readdir, readFile, stat } from 'node:fs/promises'
import { extname, join } from 'node:path'

const inspectArchives = process.argv.includes('--inspect-archives')
const roots = process.argv
  .slice(2)
  .filter((argument) => argument !== '--' && argument !== '--inspect-archives')
const scanRoots = roots.length === 0 ? ['.output'] : roots
const forbidden = [
  ['proxyloom-secret', 'canary'].join('-'),
  ['user:password@example.com', 'private', 'path'].join('/'),
  ['token=canary', 'fragment'].join('#'),
]
const textExtensions = new Set(['.css', '.html', '.js', '.json', '.md', '.svg', '.txt'])
const findings = []

const inspectArchive = (path) => {
  const names = execFileSync('unzip', ['-Z1', path], { encoding: 'utf8' })
    .split(/\r?\n/u)
    .filter(Boolean)
  for (const name of names) {
    const contents = execFileSync('unzip', ['-p', path, name], {
      encoding: 'buffer',
      maxBuffer: 100 * 1024 * 1024,
    })
    for (const canary of forbidden) {
      if (contents.includes(Buffer.from(canary))) findings.push(`${path}:${name}: ${canary}`)
    }
  }
}

const visit = async (path) => {
  let info
  try {
    info = await stat(path)
  } catch (error) {
    if (error?.code === 'ENOENT') return
    throw error
  }
  if (info.isDirectory()) {
    for (const entry of await readdir(path)) await visit(join(path, entry))
    return
  }
  if (inspectArchives && extname(path).toLowerCase() === '.zip') {
    inspectArchive(path)
    return
  }
  if (!textExtensions.has(extname(path).toLowerCase())) return
  const text = await readFile(path, 'utf8')
  for (const canary of forbidden) {
    if (text.includes(canary)) findings.push(`${path}: ${canary}`)
  }
  if (/\beval\s*\(|\bnew\s+Function\s*\(/u.test(text)) findings.push(`${path}: dynamic code`)
}

for (const root of scanRoots) await visit(root)
if (findings.length > 0) {
  process.stderr.write(`Artifact security scan failed:\n${findings.join('\n')}\n`)
  process.exit(1)
}
process.stdout.write(`Artifact security scan passed for ${scanRoots.join(', ')}.\n`)
