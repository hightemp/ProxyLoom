import { validateRegex } from '../../domain/regex/validate'
import { normalizeUrl } from '../../domain/url/normalize'
import { err, ok, type Result } from '../../domain/types/result'

export const MAX_REGEX_TEST_LINES = 1_000
export const MAX_REGEX_TEST_INPUT_CHARS = 100_000
export const DEFAULT_REGEX_TEST_BUDGET_MS = 250

export interface RegexWorkerRequest {
  readonly pattern: string
  readonly flags: string
  readonly targets: readonly {
    readonly index: number
    readonly value: string
  }[]
}

export interface RegexWorkerResponse {
  readonly results: readonly {
    readonly index: number
    readonly matched: boolean
  }[]
}

export interface WorkerLike {
  onmessage: ((event: MessageEvent<RegexWorkerResponse>) => void) | null
  onerror: (() => void) | null
  postMessage(message: RegexWorkerRequest): void
  terminate(): void
}

export type WorkerFactory = () => WorkerLike

export interface RegexTestRow {
  readonly input: string
  readonly normalizedTarget: string | null
  readonly matched: boolean | null
  readonly errorCode: string | null
}

export interface RegexBatchResult {
  readonly rows: readonly RegexTestRow[]
  readonly matcherType: 'ORIGIN' | 'FULL_URL'
  readonly elapsedMs: number
}

export type RegexBatchError =
  | { readonly code: 'ALREADY_RUNNING' | 'CANCELLED' | 'TIME_BUDGET_EXCEEDED' | 'WORKER_FAILED' }
  | { readonly code: 'TOO_MANY_LINES'; readonly maximum: number }
  | { readonly code: 'INPUT_TOO_LARGE'; readonly maximum: number }
  | { readonly code: 'PATTERN_INVALID'; readonly validationCode: string }

export class RegexBatchTester {
  #worker: WorkerLike | null = null
  #cancelActive: (() => void) | null = null

  constructor(
    private readonly workers: WorkerFactory,
    private readonly budgetMs = DEFAULT_REGEX_TEST_BUDGET_MS,
  ) {}

  async test(input: {
    readonly pattern: string
    readonly flags: string
    readonly matcherType: 'ORIGIN' | 'FULL_URL'
    readonly lines: readonly string[]
  }): Promise<Result<RegexBatchResult, RegexBatchError>> {
    if (this.#worker !== null) {
      return err({ code: 'ALREADY_RUNNING' })
    }
    if (input.lines.length > MAX_REGEX_TEST_LINES) {
      return err({ code: 'TOO_MANY_LINES', maximum: MAX_REGEX_TEST_LINES })
    }
    if (input.lines.reduce((sum, line) => sum + line.length, 0) > MAX_REGEX_TEST_INPUT_CHARS) {
      return err({
        code: 'INPUT_TOO_LARGE',
        maximum: MAX_REGEX_TEST_INPUT_CHARS,
      })
    }
    const validated = validateRegex(input.pattern, input.flags)
    if (!validated.ok) {
      return err({
        code: 'PATTERN_INVALID',
        validationCode: validated.error.code,
      })
    }
    const rows: RegexTestRow[] = []
    const targets: RegexWorkerRequest['targets'][number][] = []
    input.lines.forEach((line, index) => {
      const normalized = normalizeUrl(line)
      if (!normalized.ok) {
        rows.push({
          errorCode: normalized.error.code,
          input: line,
          matched: null,
          normalizedTarget: null,
        })
        return
      }
      const target =
        input.matcherType === 'ORIGIN'
          ? normalized.value.originTarget
          : normalized.value.fullUrlTarget
      targets.push({ index, value: target })
      rows.push({
        errorCode: null,
        input: line,
        matched: null,
        normalizedTarget: target,
      })
    })
    if (targets.length === 0) {
      return ok({ elapsedMs: 0, matcherType: input.matcherType, rows })
    }

    const worker = this.workers()
    this.#worker = worker
    const startedAt = performance.now()
    return await new Promise((resolve) => {
      let settled = false
      const finish = (result: Result<RegexBatchResult, RegexBatchError>): void => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        worker.terminate()
        if (this.#worker === worker) {
          this.#worker = null
          this.#cancelActive = null
        }
        resolve(result)
      }
      const timeout = setTimeout(() => {
        finish(err({ code: 'TIME_BUDGET_EXCEEDED' }))
      }, this.budgetMs)
      this.#cancelActive = () => finish(err({ code: 'CANCELLED' }))
      worker.onerror = () => finish(err({ code: 'WORKER_FAILED' }))
      worker.onmessage = (event) => {
        const matchedByIndex = new Map(
          event.data.results.map((result) => [result.index, result.matched]),
        )
        finish(
          ok({
            elapsedMs: Math.max(0, performance.now() - startedAt),
            matcherType: input.matcherType,
            rows: rows.map((row, index) => ({
              ...row,
              matched: matchedByIndex.get(index) ?? row.matched,
            })),
          }),
        )
      }
      worker.postMessage({
        flags: validated.value.flags,
        pattern: validated.value.pattern,
        targets,
      })
    })
  }

  cancel(): void {
    this.#cancelActive?.()
  }

  get running(): boolean {
    return this.#worker !== null
  }
}
