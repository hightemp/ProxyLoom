import { shallowRef, type ShallowRef } from 'vue'

export type ConfirmTone = 'default' | 'danger'

export interface ConfirmRequest {
  readonly title: string
  readonly message: string
  readonly confirmLabel: string
  readonly details?: readonly string[]
  /** Monospace preview such as a generated pattern; rendered as text, never as HTML. */
  readonly code?: string
  readonly tone?: ConfirmTone
}

export interface PendingConfirm extends ConfirmRequest {
  readonly tone: ConfirmTone
}

export interface ConfirmController {
  readonly pending: Readonly<ShallowRef<PendingConfirm | null>>
  /** Always asks: previews and privacy disclosures. */
  request(request: ConfirmRequest): Promise<boolean>
  /** Asks only when the user keeps destructive confirmations enabled (FR-026). */
  destructive(request: ConfirmRequest, confirmationsEnabled: boolean): Promise<boolean>
  answer(accepted: boolean): void
}

export const createConfirmController = (): ConfirmController => {
  const pending = shallowRef<PendingConfirm | null>(null)
  let resolveCurrent: ((accepted: boolean) => void) | null = null

  const answer = (accepted: boolean): void => {
    const resolve = resolveCurrent
    resolveCurrent = null
    pending.value = null
    resolve?.(accepted)
  }

  const request = (input: ConfirmRequest): Promise<boolean> => {
    if (resolveCurrent !== null) answer(false)
    return new Promise<boolean>((resolve) => {
      resolveCurrent = resolve
      pending.value = { ...input, tone: input.tone ?? 'default' }
    })
  }

  return {
    answer,
    destructive: (input, confirmationsEnabled) =>
      confirmationsEnabled ? request({ ...input, tone: 'danger' }) : Promise.resolve(true),
    pending,
    request,
  }
}

/** Page-wide controller shared by sections and the single mounted ConfirmDialog. */
export const confirmController = createConfirmController()
