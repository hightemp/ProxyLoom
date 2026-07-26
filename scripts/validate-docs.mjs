import { readdir, readFile, stat } from 'node:fs/promises'
import { dirname, extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const workspace = resolve(fileURLToPath(new URL('..', import.meta.url)))
const packageJson = JSON.parse(await readFile(join(workspace, 'package.json'), 'utf8'))
const roots = ['README.md', 'docs', 'store']
const markdownFiles = []

const visit = async (relativePath) => {
  const absolutePath = join(workspace, relativePath)
  const info = await stat(absolutePath)
  if (info.isDirectory()) {
    for (const entry of await readdir(absolutePath)) {
      await visit(join(relativePath, entry))
    }
    return
  }
  if (extname(relativePath) === '.md') markdownFiles.push(relativePath)
}

for (const root of roots) await visit(root)

const failures = []
const pnpmCommands = new Set()
const linkPattern = /\[[^\]]*\]\(([^)]+)\)/gu
const commandPattern = /(?:^|`|\n)pnpm (?:run )?([a-z][\w:-]*)/gu

for (const relativePath of markdownFiles) {
  const contents = await readFile(join(workspace, relativePath), 'utf8')
  for (const match of contents.matchAll(linkPattern)) {
    const rawTarget = match[1]?.trim() ?? ''
    if (
      rawTarget.length === 0 ||
      rawTarget.startsWith('#') ||
      /^(?:https?:|mailto:)/u.test(rawTarget)
    ) {
      continue
    }
    const withoutFragment = rawTarget.split('#', 1)[0]
    if (withoutFragment === undefined || withoutFragment.length === 0) continue
    const target = normalize(
      join(workspace, dirname(relativePath), decodeURIComponent(withoutFragment)),
    )
    if (!target.startsWith(`${workspace}/`) && target !== workspace) {
      failures.push(`${relativePath}: link escapes the workspace: ${rawTarget}`)
      continue
    }
    try {
      await stat(target)
    } catch {
      failures.push(`${relativePath}: broken local link: ${rawTarget}`)
    }
  }
  for (const match of contents.matchAll(commandPattern)) {
    const command = match[1]
    if (command !== undefined) pnpmCommands.add(command)
  }
}

const builtinPnpmCommands = new Set(['add', 'audit', 'exec', 'install'])
for (const command of pnpmCommands) {
  if (!(command in packageJson.scripts) && !builtinPnpmCommands.has(command)) {
    failures.push(`Documentation references unknown pnpm command: ${command}`)
  }
}

if (failures.length > 0) {
  process.stderr.write(`Documentation validation failed:\n${failures.join('\n')}\n`)
  process.exit(1)
}

process.stdout.write(
  `Documentation validation passed: ${markdownFiles.length} Markdown files, ${pnpmCommands.size} pnpm commands.\n`,
)
