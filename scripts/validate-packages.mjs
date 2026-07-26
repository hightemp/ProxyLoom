import { execFileSync } from 'node:child_process'
import { access, readFile } from 'node:fs/promises'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const manifest = JSON.parse(
  await readFile(new URL('../.output/chrome-mv3/manifest.json', import.meta.url), 'utf8'),
)
const product = String(manifest.name).replaceAll(/[^A-Za-z0-9._-]/g, '-')
const version = packageJson.version
const archives = {
  chromium: `.output/${product}-${version}-chromium.zip`,
  firefox: `.output/${product}-${version}-firefox.zip`,
  sources: `.output/${product}-${version}-firefox-sources.zip`,
}

const entries = (archive) =>
  execFileSync('unzip', ['-Z1', archive], { encoding: 'utf8' }).split(/\r?\n/u).filter(Boolean)

for (const archive of Object.values(archives)) await access(archive)

for (const archive of [archives.chromium, archives.firefox]) {
  const names = new Set(entries(archive))
  for (const required of [
    'manifest.json',
    'background.js',
    'popup.html',
    'options.html',
    'error.html',
    'icon-16.png',
    'icon-32.png',
    'icon-48.png',
    'icon-128.png',
  ]) {
    if (!names.has(required)) throw new Error(`${archive}: missing ${required}`)
  }
  const forbidden = [...names].filter(
    (name) =>
      name.endsWith('.map') ||
      name.startsWith('src/') ||
      name.startsWith('tests/') ||
      name.startsWith('node_modules/'),
  )
  if (forbidden.length > 0) {
    throw new Error(`${archive}: forbidden entries: ${forbidden.join(', ')}`)
  }
}

const sourceNames = entries(archives.sources)
for (const required of [
  'SOURCE_CODE_REVIEW.md',
  'package.json',
  'pnpm-lock.yaml',
  'scripts/validate-source-rebuild.mjs',
  'wxt.config.ts',
]) {
  if (!sourceNames.includes(required)) throw new Error(`${archives.sources}: missing ${required}`)
}
for (const requiredPrefix of ['entrypoints/', 'src/']) {
  if (!sourceNames.some((name) => name.startsWith(requiredPrefix))) {
    throw new Error(`${archives.sources}: missing ${requiredPrefix}`)
  }
}

const forbiddenSource = sourceNames.filter(
  (name) =>
    /^(?:\.output|\.wxt|coverage|node_modules|playwright-report|test-results[^/]*)(?:\/|$)/u.test(
      name,
    ) ||
    /(?:^|\/)\.env(?:\.|$)/u.test(name) ||
    name.endsWith('.log'),
)
if (forbiddenSource.length > 0) {
  throw new Error(`${archives.sources}: forbidden entries: ${forbiddenSource.join(', ')}`)
}

const reviewInstructions = execFileSync(
  'unzip',
  ['-p', archives.sources, 'SOURCE_CODE_REVIEW.md'],
  { encoding: 'utf8' },
)
for (const requiredText of [
  'Node.js 22',
  'pnpm 10.32.1',
  'pnpm install --frozen-lockfile',
  'pnpm build:firefox',
  '.output/firefox-mv3/',
]) {
  if (!reviewInstructions.includes(requiredText)) {
    throw new Error(`${archives.sources}: incomplete review instructions: ${requiredText}`)
  }
}

process.stdout.write('Release package contents validated.\n')
