import type { LogEntry, LogQuery } from '../logging/log-types'

export interface LogStorePort {
  appendBatch(entries: readonly LogEntry[]): Promise<void>
  page(query: LogQuery): Promise<readonly LogEntry[]>
  count(): Promise<number>
  clear(): Promise<void>
}
