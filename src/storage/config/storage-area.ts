export interface StorageArea {
  get(keys: readonly string[]): Promise<Readonly<Record<string, unknown>>>
  set(items: Readonly<Record<string, unknown>>): Promise<void>
  remove(keys: readonly string[]): Promise<void>
}

export class MemoryStorageArea implements StorageArea {
  readonly #data = new Map<string, unknown>()

  constructor(initial: Readonly<Record<string, unknown>> = {}) {
    for (const [key, value] of Object.entries(initial)) {
      this.#data.set(key, structuredClone(value))
    }
  }

  get(keys: readonly string[]): Promise<Readonly<Record<string, unknown>>> {
    return Promise.resolve(
      Object.fromEntries(
        keys
          .filter((key) => this.#data.has(key))
          .map((key) => [key, structuredClone(this.#data.get(key))]),
      ),
    )
  }

  set(items: Readonly<Record<string, unknown>>): Promise<void> {
    for (const [key, value] of Object.entries(items)) {
      this.#data.set(key, structuredClone(value))
    }
    return Promise.resolve()
  }

  remove(keys: readonly string[]): Promise<void> {
    for (const key of keys) {
      this.#data.delete(key)
    }
    return Promise.resolve()
  }
}

export class FallbackStorageArea implements StorageArea {
  #usingFallback = false

  constructor(
    private readonly primary: StorageArea,
    private readonly fallback: StorageArea = new MemoryStorageArea(),
  ) {}

  async get(keys: readonly string[]): Promise<Readonly<Record<string, unknown>>> {
    if (this.#usingFallback) {
      return this.fallback.get(keys)
    }
    try {
      return await this.primary.get(keys)
    } catch {
      this.#usingFallback = true
      return this.fallback.get(keys)
    }
  }

  async set(items: Readonly<Record<string, unknown>>): Promise<void> {
    if (this.#usingFallback) {
      await this.fallback.set(items)
      return
    }
    try {
      await this.primary.set(items)
    } catch {
      this.#usingFallback = true
      await this.fallback.set(items)
    }
  }

  async remove(keys: readonly string[]): Promise<void> {
    if (this.#usingFallback) {
      await this.fallback.remove(keys)
      return
    }
    try {
      await this.primary.remove(keys)
    } catch {
      this.#usingFallback = true
      await this.fallback.remove(keys)
    }
  }

  get usingFallback(): boolean {
    return this.#usingFallback
  }
}
