interface WindowSummary {
  readonly incognito?: boolean
}

interface WindowRemovedEvent {
  addListener(listener: () => void): void
  removeListener(listener: () => void): void
}

export interface PrivateSessionWindowApi {
  readonly onRemoved: WindowRemovedEvent
  getAll(): Promise<readonly WindowSummary[]>
}

export interface PrivateSessionControllerOptions {
  readonly windows: PrivateSessionWindowApi
  readonly onPrivateSessionEnded: () => Promise<void> | void
}

export class PrivateSessionController {
  constructor(private readonly options: PrivateSessionControllerOptions) {}

  register(): () => void {
    const onRemoved = (): void => {
      void this.clearIfLastPrivateWindowClosed()
    }
    this.options.windows.onRemoved.addListener(onRemoved)
    return () => {
      this.options.windows.onRemoved.removeListener(onRemoved)
    }
  }

  private async clearIfLastPrivateWindowClosed(): Promise<void> {
    const windows = await this.options.windows.getAll()
    if (!windows.some((window) => window.incognito === true)) {
      await this.options.onPrivateSessionEnded()
    }
  }
}
