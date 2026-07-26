import { readFile } from 'node:fs/promises'

const taskSource = await readFile('TASKS.md', 'utf8')
const requirementSource = await readFile('PRD.md', 'utf8')
const traceability = await readFile('docs/traceability.md', 'utf8')
const identifierPattern = /\b(?:PL|FR|NFR|COMPAT|SEC|PRIV|REL)-\d{3}\b/gu
const covered = new Set(traceability.match(identifierPattern) ?? [])
const rangePattern = /\b(PL|FR|NFR|COMPAT|SEC|PRIV|REL)-(\d{3})…\1-(\d{3})\b/gu

for (const match of traceability.matchAll(rangePattern)) {
  const prefix = match[1]
  const first = Number(match[2])
  const last = Number(match[3])
  if (prefix === undefined || first > last) continue
  for (let value = first; value <= last; value += 1) {
    covered.add(`${prefix}-${String(value).padStart(3, '0')}`)
  }
}

const taskIds = new Set(taskSource.match(/\bPL-\d{3}\b/gu) ?? [])
const requirementIds = new Set(
  requirementSource.match(/\b(?:FR|NFR|COMPAT|SEC|PRIV|REL)-\d{3}\b/gu) ?? [],
)
const missing = [...taskIds, ...requirementIds].filter((identifier) => !covered.has(identifier))

if (missing.length > 0) {
  throw new Error(`Traceability is missing: ${missing.sort().join(', ')}`)
}

const taskDisposition = new Map()
const dispositionRows = traceability.matchAll(
  /^\|\s*(PL-\d{3}(?:…PL-\d{3})?)\s*\|\s*([ABM])\s*\|/gmu,
)
for (const match of dispositionRows) {
  const specification = match[1]
  const status = match[2]
  if (specification === undefined || status === undefined) continue
  const bounds = specification.split('…')
  const first = Number(bounds[0]?.slice(3))
  const last = Number((bounds[1] ?? bounds[0])?.slice(3))
  for (let value = first; value <= last; value += 1) {
    const identifier = `PL-${String(value).padStart(3, '0')}`
    if (taskDisposition.has(identifier)) {
      throw new Error(`Task disposition is duplicated: ${identifier}`)
    }
    taskDisposition.set(identifier, status)
  }
}

const undisposed = [...taskIds].filter((identifier) => !taskDisposition.has(identifier))
const unexpectedDisposition = [...taskDisposition.keys()].filter(
  (identifier) => !taskIds.has(identifier),
)
if (undisposed.length > 0 || unexpectedDisposition.length > 0) {
  throw new Error(
    `Task disposition mismatch; missing: ${undisposed.sort().join(', ') || 'none'}; unexpected: ${
      unexpectedDisposition.sort().join(', ') || 'none'
    }`,
  )
}

const taskCheckboxes = new Map(
  [...taskSource.matchAll(/^- \[([ x])\] \*\*(PL-\d{3})\b/gmu)].map((match) => [
    match[2],
    match[1] === 'x',
  ]),
)
const invalidCheckboxes = [...taskDisposition].filter(
  ([identifier, status]) => taskCheckboxes.get(identifier) !== (status === 'A'),
)
if (invalidCheckboxes.length > 0) {
  throw new Error(
    `Task checkbox/disposition mismatch: ${invalidCheckboxes
      .map(([identifier, status]) => `${identifier}:${status}`)
      .join(', ')}`,
  )
}

const acceptedTasks = [...taskDisposition.values()].filter((status) => status === 'A').length
process.stdout.write(
  `Traceability validated: ${taskIds.size} tasks (${acceptedTasks} accepted) and ${
    requirementIds.size
  } requirements.\n`,
)
