import { copyFile, readFile } from 'node:fs/promises'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const manifest = JSON.parse(
  await readFile(new URL('../.output/chrome-mv3/manifest.json', import.meta.url), 'utf8'),
)
const product = String(manifest.name).replaceAll(/[^A-Za-z0-9._-]/g, '-')
const version = packageJson.version
const mappings = [
  [
    `.output/${packageJson.name}-${version}-chrome.zip`,
    `.output/${product}-${version}-chromium.zip`,
  ],
  [
    `.output/${packageJson.name}-${version}-firefox.zip`,
    `.output/${product}-${version}-firefox.zip`,
  ],
  [
    `.output/${packageJson.name}-${version}-sources.zip`,
    `.output/${product}-${version}-firefox-sources.zip`,
  ],
]

for (const [source, destination] of mappings) {
  await copyFile(source, destination)
  process.stdout.write(`${destination}\n`)
}
