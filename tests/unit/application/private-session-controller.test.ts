import { describe, expect, it, vi } from 'vitest'

import {
  PrivateSessionController,
  type PrivateSessionWindowApi,
} from '../../../src/platform/runtime/private-session-controller'

const fixture = (windows: readonly { readonly incognito: boolean }[]) => {
  let removedListener: (() => void) | null = null
  const getAll = vi.fn().mockResolvedValue(windows)
  const api: PrivateSessionWindowApi = {
    getAll,
    onRemoved: {
      addListener: (listener) => {
        removedListener = listener
      },
      removeListener: (listener) => {
        if (removedListener === listener) removedListener = null
      },
    },
  }
  return {
    api,
    getAll,
    removed: () => removedListener?.(),
    registered: () => removedListener !== null,
  }
}

describe('private session controller', () => {
  it('clears private state after the last private window closes and unregisters', async () => {
    const windows = fixture([{ incognito: false }])
    const ended = vi.fn().mockResolvedValue(undefined)
    const unregister = new PrivateSessionController({
      onPrivateSessionEnded: ended,
      windows: windows.api,
    }).register()

    windows.removed()
    await vi.waitFor(() => expect(ended).toHaveBeenCalledOnce())
    unregister()
    expect(windows.registered()).toBe(false)
  })

  it('keeps private state while another private window remains', async () => {
    const windows = fixture([{ incognito: false }, { incognito: true }])
    const ended = vi.fn()
    new PrivateSessionController({
      onPrivateSessionEnded: ended,
      windows: windows.api,
    }).register()

    windows.removed()
    await vi.waitFor(() => expect(windows.getAll).toHaveBeenCalledOnce())
    expect(ended).not.toHaveBeenCalled()
  })
})
