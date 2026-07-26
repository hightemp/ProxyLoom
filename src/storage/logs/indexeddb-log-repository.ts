import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

import type { LogEntry, LogQuery } from '../../application/logging/log-types'
import type { LogStorePort } from '../../application/ports/log-store'

const STORE_NAME = 'entries'
export const MAX_LOG_ENTRIES = 1_000

interface LogDatabase extends DBSchema {
  entries: {
    key: number
    value: LogEntry
    indexes: {
      'by-timestamp': string
    }
  }
}

export class IndexedDbLogRepository implements LogStorePort {
  #database: Promise<IDBPDatabase<LogDatabase>> | null = null

  constructor(private readonly databaseName = 'proxyloom-logs') {}

  async appendBatch(entries: readonly LogEntry[]): Promise<void> {
    if (entries.length === 0) {
      return
    }
    const database = await this.open()
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    for (const entry of entries) {
      await transaction.store.add(entry)
    }
    const count = await transaction.store.count()
    let overflow = count - MAX_LOG_ENTRIES
    if (overflow > 0) {
      let cursor = await transaction.store.index('by-timestamp').openCursor()
      while (cursor !== null && overflow > 0) {
        await cursor.delete()
        overflow -= 1
        cursor = await cursor.continue()
      }
    }
    await transaction.done
  }

  async page(query: LogQuery): Promise<readonly LogEntry[]> {
    const database = await this.open()
    const transaction = database.transaction(STORE_NAME, 'readonly')
    const results: LogEntry[] = []
    const hostname = query.hostname.trim().toLocaleLowerCase('en')
    let skipped = 0
    let cursor = await transaction.store.index('by-timestamp').openCursor(null, 'prev')
    while (cursor !== null && results.length < query.limit) {
      const entry = { ...cursor.value, id: cursor.primaryKey }
      const matches =
        (hostname.length === 0 || entry.hostname.toLocaleLowerCase('en').includes(hostname)) &&
        (query.platform === null || entry.platform === query.platform) &&
        (!query.errorsOnly || entry.errorCode !== null || entry.authFailure)
      if (matches) {
        if (skipped < query.offset) {
          skipped += 1
        } else {
          results.push(entry)
        }
      }
      cursor = await cursor.continue()
    }
    await transaction.done
    return results
  }

  async count(): Promise<number> {
    return (await this.open()).count(STORE_NAME)
  }

  async clear(): Promise<void> {
    await (await this.open()).clear(STORE_NAME)
  }

  private open(): Promise<IDBPDatabase<LogDatabase>> {
    this.#database ??= openDB<LogDatabase>(this.databaseName, 1, {
      upgrade: (database) => {
        const store = database.createObjectStore(STORE_NAME, {
          autoIncrement: true,
        })
        store.createIndex('by-timestamp', 'timestamp')
      },
    })
    return this.#database
  }
}
