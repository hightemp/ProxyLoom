import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

export interface SpikeObservation {
  readonly scenario: string
  readonly expectation: string
  readonly observed: unknown
  readonly pass: boolean
}

export interface SpikeTrace {
  readonly browser: string
  readonly version: string
  readonly api: string
  readonly observations: SpikeObservation[]
}

/**
 * Replaces ephemeral ports with stable placeholders and fails loudly if a synthetic secret leaks
 * into the trace, so committed evidence is deterministic and sanitized.
 */
export const sanitize = (
  value: unknown,
  ports: Readonly<Record<string, number>>,
  secrets: readonly string[],
): unknown => {
  let text = JSON.stringify(value)
  for (const [name, port] of Object.entries(ports)) {
    text = text.replace(new RegExp(`(?<=[:"])${port}(?=\\D)`, 'g'), `<${name}>`)
  }
  for (const secret of secrets) {
    if (text.includes(secret)) throw new Error('Spike trace contains a synthetic secret.')
  }
  return JSON.parse(text) as unknown
}

export const writeTrace = async (name: string, trace: SpikeTrace): Promise<string> => {
  const directory = resolve('spikes/socks5/evidence')
  await mkdir(directory, { recursive: true })
  const path = join(directory, `${name}.json`)
  await writeFile(path, `${JSON.stringify(trace, null, 2)}\n`)
  return path
}
