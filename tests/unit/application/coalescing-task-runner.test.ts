import { describe, expect, it, vi } from 'vitest'

import { CoalescingTaskRunner } from '../../../src/application/config/coalescing-task-runner'

describe('CoalescingTaskRunner', () => {
  it('coalesces a burst and runs once more when a request arrives during an active task', async () => {
    const releases: (() => void)[] = []
    let calls = 0
    const runner = new CoalescingTaskRunner(async () => {
      calls += 1
      await new Promise<void>((resolve) => {
        releases.push(resolve)
      })
    })

    const first = runner.request()
    const second = runner.request()
    const third = runner.request()
    expect(calls).toBe(1)

    releases.shift()!()
    await vi.waitFor(() => {
      expect(calls).toBe(2)
    })
    releases.shift()!()
    await Promise.all([first, second, third])
    expect(calls).toBe(2)

    const afterIdle = runner.request()
    expect(calls).toBe(3)
    releases.shift()!()
    await afterIdle
  })
})
