export type AuthAttemptResult = 'FIRST_ATTEMPT' | 'REJECTED'

export class AuthAttemptTracker {
  readonly #attempts = new Map<string, number>()

  constructor(
    private readonly timeoutMs: number,
    private readonly now: () => number,
  ) {}

  begin(requestId: string): AuthAttemptResult {
    this.sweep()
    if (this.#attempts.has(requestId)) {
      return 'REJECTED'
    }
    this.#attempts.set(requestId, this.now() + this.timeoutMs)
    return 'FIRST_ATTEMPT'
  }

  complete(requestId: string): void {
    this.#attempts.delete(requestId)
  }

  sweep(): void {
    const now = this.now()
    for (const [requestId, expiresAt] of this.#attempts) {
      if (expiresAt <= now) {
        this.#attempts.delete(requestId)
      }
    }
  }

  clear(): void {
    this.#attempts.clear()
  }

  get size(): number {
    this.sweep()
    return this.#attempts.size
  }
}
