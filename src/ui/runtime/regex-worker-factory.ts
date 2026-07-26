import { browser } from 'wxt/browser'

import type { WorkerFactory, WorkerLike } from '../../application/regex-tester/regex-batch-tester'

export const createRegexWorker: WorkerFactory = (): WorkerLike =>
  new Worker(browser.runtime.getURL('/regex-worker.js')) as WorkerLike
