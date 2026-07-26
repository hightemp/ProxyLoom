import { describe, expect, it } from 'vitest'

import {
  RegexBatchTester,
  type RegexWorkerRequest,
  type RegexWorkerResponse,
  type WorkerLike,
} from '../../../src/application/regex-tester/regex-batch-tester'

class FakeWorker implements WorkerLike {
  onmessage: ((event: MessageEvent<RegexWorkerResponse>) => void) | null = null
  onerror: (() => void) | null = null
  terminated = false
  mode: 'SUCCESS' | 'HANG' | 'FAIL' = 'SUCCESS'

  postMessage(message: RegexWorkerRequest): void {
    if (this.mode === 'HANG') return
    if (this.mode === 'FAIL') {
      queueMicrotask(() => this.onerror?.())
      return
    }
    const expression = new RegExp(message.pattern, message.flags)
    queueMicrotask(() =>
      this.onmessage?.(
        new MessageEvent('message', {
          data: {
            results: message.targets.map(({ index, value }) => ({
              index,
              matched: expression.test(value),
            })),
          },
        }),
      ),
    )
  }

  terminate(): void {
    this.terminated = true
  }
}

describe('RegexBatchTester', () => {
  it('normalizes every line and executes in the worker', async () => {
    const worker = new FakeWorker()
    const tester = new RegexBatchTester(() => worker)
    const result = await tester.test({
      flags: 'i',
      lines: ['https://Example.com/path?q=1#fragment', 'not a url'],
      matcherType: 'ORIGIN',
      pattern: '^https://example\\.com/$',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.rows).toEqual([
      {
        errorCode: null,
        input: 'https://Example.com/path?q=1#fragment',
        matched: true,
        normalizedTarget: 'https://example.com/',
      },
      {
        errorCode: 'INVALID_URL',
        input: 'not a url',
        matched: null,
        normalizedTarget: null,
      },
    ])
    expect(worker.terminated).toBe(true)
  })

  it('rejects unsafe patterns and input limits before creating a worker', async () => {
    let created = 0
    const tester = new RegexBatchTester(() => {
      created += 1
      return new FakeWorker()
    })
    await expect(
      tester.test({
        flags: 'i',
        lines: ['https://example.com'],
        matcherType: 'ORIGIN',
        pattern: '(a+)+',
      }),
    ).resolves.toMatchObject({
      error: { code: 'PATTERN_INVALID', validationCode: 'UNSAFE_PATTERN' },
      ok: false,
    })
    await expect(
      tester.test({
        flags: 'i',
        lines: Array.from({ length: 1_001 }, () => 'https://example.com'),
        matcherType: 'ORIGIN',
        pattern: '.',
      }),
    ).resolves.toMatchObject({
      error: { code: 'TOO_MANY_LINES' },
      ok: false,
    })
    expect(created).toBe(0)
  })

  it('terminates a hanging worker on its time budget', async () => {
    const worker = new FakeWorker()
    worker.mode = 'HANG'
    const tester = new RegexBatchTester(() => worker, 1)
    await expect(
      tester.test({
        flags: '',
        lines: ['https://example.com'],
        matcherType: 'ORIGIN',
        pattern: '.',
      }),
    ).resolves.toEqual({
      error: { code: 'TIME_BUDGET_EXCEEDED' },
      ok: false,
    })
    expect(worker.terminated).toBe(true)
  })

  it('reports worker failure', async () => {
    const worker = new FakeWorker()
    worker.mode = 'FAIL'
    const tester = new RegexBatchTester(() => worker)
    await expect(
      tester.test({
        flags: '',
        lines: ['https://example.com'],
        matcherType: 'FULL_URL',
        pattern: '.',
      }),
    ).resolves.toEqual({
      error: { code: 'WORKER_FAILED' },
      ok: false,
    })
  })

  it('settles immediately when a hanging worker is cancelled', async () => {
    const worker = new FakeWorker()
    worker.mode = 'HANG'
    const tester = new RegexBatchTester(() => worker, 60_000)
    const pending = tester.test({
      flags: '',
      lines: ['https://example.com'],
      matcherType: 'ORIGIN',
      pattern: '.',
    })

    expect(tester.running).toBe(true)
    tester.cancel()

    await expect(pending).resolves.toEqual({
      error: { code: 'CANCELLED' },
      ok: false,
    })
    expect(tester.running).toBe(false)
    expect(worker.terminated).toBe(true)
  })
})
