import { shallowRef, type ShallowRef } from 'vue'

export interface Toast {
  readonly id: number
  readonly message: string
  readonly error: boolean
}

export interface ToastController {
  readonly current: Readonly<ShallowRef<Toast | null>>
  /** Success toasts disappear after a few seconds; errors stay until dismissed. */
  show(message: string, error?: boolean): void
  dismiss(): void
}

export const SUCCESS_TOAST_MS = 6_000

export const createToastController = (): ToastController => {
  const current = shallowRef<Toast | null>(null)
  let nextId = 1
  let timer: ReturnType<typeof setTimeout> | undefined

  const dismiss = (): void => {
    clearTimeout(timer)
    current.value = null
  }

  return {
    current,
    dismiss,
    show: (message, error = false) => {
      clearTimeout(timer)
      const toast = { error, id: nextId++, message }
      current.value = toast
      if (!error) {
        timer = setTimeout(() => {
          if (current.value?.id === toast.id) current.value = null
        }, SUCCESS_TOAST_MS)
      }
    },
  }
}

export const toastController = createToastController()
