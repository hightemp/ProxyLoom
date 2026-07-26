import type { StorageArea } from '../../storage/config/storage-area'

interface BrowserStorageArea {
  get(keys: string[]): Promise<Record<string, unknown>>
  set(items: Readonly<Record<string, unknown>>): Promise<void>
  remove(keys: string[]): Promise<void>
}

export class BrowserStorageAreaAdapter implements StorageArea {
  constructor(private readonly area: BrowserStorageArea) {}

  async get(keys: readonly string[]): Promise<Readonly<Record<string, unknown>>> {
    return this.area.get([...keys])
  }

  async set(items: Readonly<Record<string, unknown>>): Promise<void> {
    await this.area.set(items)
  }

  async remove(keys: readonly string[]): Promise<void> {
    await this.area.remove([...keys])
  }
}
