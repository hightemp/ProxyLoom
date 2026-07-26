import type { LogStorePort } from '../ports/log-store'
import type { LogEntry, LogQuery } from './log-types'

interface PendingEntry {
  readonly entry: LogEntry
  readonly ticket: PendingTicket
}

interface PendingTicket {
  remaining: number
  readonly resolve: () => void
  readonly reject: (error: unknown) => void
}

export class BatchedLogStore implements LogStorePort {
  readonly #pending: PendingEntry[] = []
  #timer: ReturnType<typeof setTimeout> | null = null
  #flushing: Promise<void> | null = null

  constructor(
    private readonly store: LogStorePort,
    private readonly maximumBatchSize = 50,
    private readonly maximumDelayMs = 250,
  ) {
    if (!Number.isInteger(maximumBatchSize) || maximumBatchSize < 1) {
      throw new Error('maximumBatchSize must be a positive integer')
    }
    if (!Number.isFinite(maximumDelayMs) || maximumDelayMs < 0) {
      throw new Error('maximumDelayMs must be non-negative')
    }
  }

  appendBatch(entries: readonly LogEntry[]): Promise<void> {
    if (entries.length === 0) return Promise.resolve()
    const promise = new Promise<void>((resolve, reject) => {
      const ticket: PendingTicket = { reject, remaining: entries.length, resolve }
      this.#pending.push(...entries.map((entry) => ({ entry, ticket })))
    })
    if (this.#pending.length >= this.maximumBatchSize) {
      void this.flush()
    } else {
      this.schedule()
    }
    return promise
  }

  async page(query: LogQuery): Promise<readonly LogEntry[]> {
    await this.flushAll()
    return this.store.page(query)
  }

  async count(): Promise<number> {
    await this.flushAll()
    return this.store.count()
  }

  async clear(): Promise<void> {
    await this.flushAll()
    await this.store.clear()
  }

  async flushAll(): Promise<void> {
    while (this.#pending.length > 0 || this.#flushing !== null) {
      await this.flush()
    }
  }

  private schedule(): void {
    if (this.#timer !== null) return
    this.#timer = setTimeout(() => {
      this.#timer = null
      void this.flush()
    }, this.maximumDelayMs)
  }

  private async flush(): Promise<void> {
    if (this.#flushing !== null) {
      await this.#flushing
      return
    }
    if (this.#timer !== null) {
      clearTimeout(this.#timer)
      this.#timer = null
    }
    const batch = this.#pending.splice(0, this.maximumBatchSize)
    if (batch.length === 0) return
    this.#flushing = this.store
      .appendBatch(batch.map(({ entry }) => entry))
      .then(
        () => {
          for (const { ticket } of batch) {
            ticket.remaining -= 1
            if (ticket.remaining === 0) ticket.resolve()
          }
        },
        (error: unknown) => {
          for (const { ticket } of batch) ticket.reject(error)
        },
      )
      .finally(() => {
        this.#flushing = null
      })
    await this.#flushing
    if (this.#pending.length >= this.maximumBatchSize) {
      await this.flush()
    } else if (this.#pending.length > 0) {
      this.schedule()
    }
  }
}
