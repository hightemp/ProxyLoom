import { readFile } from 'node:fs/promises'

import { parseDocument } from 'yaml'

const readWorkflow = async (path) => {
  const source = await readFile(path, 'utf8')
  const document = parseDocument(source, { strict: true, uniqueKeys: true })
  if (document.errors.length > 0) {
    throw new Error(`${path}: ${document.errors.map((error) => error.message).join('; ')}`)
  }
  return { source, value: document.toJS() }
}

const requireValue = (condition, message) => {
  if (!condition) throw new Error(message)
}

const requiredRuns = (workflow, jobName, commands) => {
  const steps = workflow.jobs?.[jobName]?.steps
  requireValue(Array.isArray(steps), `${jobName}: steps are missing`)
  const runs = steps.flatMap((step) => (typeof step.run === 'string' ? [step.run] : []))
  for (const command of commands) {
    requireValue(
      runs.some((run) => run.includes(command)),
      `${jobName}: missing ${command}`,
    )
  }
}

const ci = await readWorkflow('.github/workflows/ci.yml')
requireValue(
  ci.value.permissions?.contents === 'read',
  'CI must have read-only contents permission',
)
requireValue(ci.value.concurrency?.['cancel-in-progress'] === true, 'CI must cancel stale runs')
requireValue(ci.value.on?.pull_request !== undefined, 'CI must run for pull requests')
requireValue(ci.value.on?.push?.['tags-ignore']?.includes('v*'), 'CI must defer release tags')
requireValue(
  JSON.stringify(ci.value.jobs?.packages?.needs) === JSON.stringify(['quality', 'browser-tests']),
  'Package job must depend on quality and browser tests',
)
requiredRuns(ci.value, 'quality', [
  'pnpm install --frozen-lockfile',
  'pnpm validate:docs',
  'pnpm spellcheck',
  'pnpm test:unit',
  'pnpm test:parity',
  'pnpm test:performance',
  'pnpm test:coverage',
  'pnpm audit --audit-level high',
])
requiredRuns(ci.value, 'browser-tests', [
  'pnpm install --frozen-lockfile',
  'pnpm test:integration',
  'pnpm test:e2e',
])
requiredRuns(ci.value, 'packages', [
  'pnpm build',
  'pnpm build:firefox',
  'pnpm validate:build',
  'pnpm validate:packages',
  'sha256sum',
])

const release = await readWorkflow('.github/workflows/release.yml')
const releasePublisher = await readFile('scripts/publish-github-release.mjs', 'utf8')
requireValue(release.value.permissions?.contents === 'write', 'Release needs contents: write only')
requireValue(
  JSON.stringify(release.value.on?.push?.tags) === JSON.stringify(['v*']),
  'Release must run only for v* tags',
)
requiredRuns(release.value, 'release', [
  'pnpm install --frozen-lockfile',
  'pnpm validate:release',
  'pnpm check',
  'pnpm test:coverage',
  'pnpm test:soak',
  'pnpm test:integration',
  'pnpm test:e2e',
  'pnpm validate:permission-warnings',
  'pnpm validate:packages',
  'sha256sum',
  'pnpm publish:github-release',
])
for (const invariant of [
  "'release',\n    'create'",
  "'release', 'upload'",
  "'--clobber'",
  "'release', 'download'",
  'verifyReleaseAssets',
]) {
  requireValue(
    releasePublisher.includes(invariant),
    `Release publisher is missing idempotency invariant: ${invariant}`,
  )
}
requireValue(
  !/(?:chromewebstore|addons\.mozilla|edge\.microsoft|yandex).*(?:publish|upload)/iu.test(
    release.source,
  ),
  'Release workflow must not publish to a browser store',
)

process.stdout.write('GitHub Actions workflow syntax and release invariants validated.\n')
