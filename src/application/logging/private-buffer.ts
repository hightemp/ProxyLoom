import type { LogEntry, LogQuery } from './log-types'

export class PrivateLogBuffer {
  readonly #entries: LogEntry[] = []

  constructor(private readonly maximumEntries = 1_000) {}

  append(entry: LogEntry): void {
    this.#entries.push(entry)
    const overflow = this.#entries.length - this.maximumEntries
    if (overflow > 0) {
      this.#entries.splice(0, overflow)
    }
  }

  page(query: LogQuery): readonly LogEntry[] {
    const hostname = query.hostname.trim().toLocaleLowerCase('en')
    return this.#entries
      .filter(
        (entry) =>
          (hostname.length === 0 || entry.hostname.toLocaleLowerCase('en').includes(hostname)) &&
          (query.platform === null || entry.platform === query.platform) &&
          (!query.errorsOnly || entry.errorCode !== null || entry.authFailure),
      )
      .reverse()
      .slice(query.offset, query.offset + query.limit)
  }

  clear(): void {
    this.#entries.splice(0)
  }

  get size(): number {
    return this.#entries.length
  }
}
