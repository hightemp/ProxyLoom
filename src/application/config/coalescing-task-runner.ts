export class CoalescingTaskRunner {
  #requested = false
  #running: Promise<void> | null = null

  constructor(private readonly task: () => Promise<void>) {}

  request(): Promise<void> {
    this.#requested = true
    this.#running ??= this.drain().finally(() => {
      this.#running = null
    })
    return this.#running
  }

  private async drain(): Promise<void> {
    while (this.#requested) {
      this.#requested = false
      await this.task()
    }
  }
}
