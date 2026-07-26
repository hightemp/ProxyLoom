import { readFile } from 'node:fs/promises'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME ?? ''
const expected = `v${packageJson.version}`

if (!/^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(tag)) {
  process.stderr.write(
    `Release tag must be stable SemVer in vMAJOR.MINOR.PATCH form; got “${tag}”.\n`,
  )
  process.exit(1)
}
if (tag !== expected) {
  process.stderr.write(`Release tag ${tag} does not match package version ${expected}.\n`)
  process.exit(1)
}

process.stdout.write(`Release version validated: ${expected}\n`)
