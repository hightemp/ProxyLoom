import { spawn, type ChildProcess } from 'node:child_process'
import { access, rm } from 'node:fs/promises'
import { firefox } from '@playwright/test'

// Shared Firefox launcher for integration tests and spikes: geckodriver + WebDriver BiDi
// temporary extension install (ADR-011).

export const FIREFOX_BINARY = process.env.PROXYLOOM_FIREFOX_BINARY ?? firefox.executablePath()
const SNAP_GECKODRIVER_BINARY = '/snap/firefox/current/usr/lib/firefox/geckodriver'

const children: ChildProcess[] = []

export const stopProcessGroup = async (child: ChildProcess): Promise<void> => {
  if (child.exitCode !== null || child.pid === undefined) {
    return
  }
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'EACCES') {
      child.kill('SIGTERM')
    } else if (code !== 'ESRCH') {
      throw error
    }
  }
  await new Promise<void>((resolvePromise) => {
    const timeout = setTimeout(() => {
      if (child.pid !== undefined) {
        try {
          process.kill(-child.pid, 'SIGKILL')
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'EACCES') {
            child.kill('SIGKILL')
          }
        }
      }
      resolvePromise()
    }, 3_000)
    child.once('exit', () => {
      clearTimeout(timeout)
      resolvePromise()
    })
  })
}

/** Stops every Firefox started through launchPreparedFirefox. */
export const stopAllFirefox = async (): Promise<void> => {
  await Promise.all(children.splice(0).map(stopProcessGroup))
}

export const waitFor = async (predicate: () => boolean, timeoutMs: number): Promise<void> => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) {
      return
    }
    await new Promise((resolvePromise) => {
      setTimeout(resolvePromise, 50)
    })
  }
  throw new Error(
    `Firefox spike did not produce the expected local traffic within ${timeoutMs} ms.`,
  )
}

export const launchPreparedFirefox = async ({
  acceptInsecureCerts = false,
  directory,
  environment = {},
  extensionDirectories,
  prefs,
}: {
  acceptInsecureCerts?: boolean
  directory: string
  environment?: Readonly<Record<string, string>>
  extensionDirectories: readonly string[]
  prefs: Readonly<Record<string, boolean | number | string>>
}): Promise<{
  bidi: BidiConnection
  child: ChildProcess
  output: () => string
  webSocketUrl: string
}> => {
  await access(FIREFOX_BINARY)
  await Promise.all(extensionDirectories.map((extensionDirectory) => access(extensionDirectory)))
  const geckodriverBinary = await access(SNAP_GECKODRIVER_BINARY)
    .then(() => SNAP_GECKODRIVER_BINARY)
    .catch(() => 'geckodriver')
  let output = ''
  const child = spawn(
    geckodriverBinary,
    ['--allow-system-access', '--port', '0', '--profile-root', directory],
    {
      detached: true,
      env: { ...process.env, ...environment },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  child.stdout?.on('data', (chunk: Buffer) => {
    output += chunk.toString('utf8')
  })
  child.stderr?.on('data', (chunk: Buffer) => {
    output += chunk.toString('utf8')
  })
  children.push(child)
  let sessionSocketUrl: string | undefined
  let bidiSocket: WebSocket | undefined
  try {
    await waitFor(() => /Listening on 127\.0\.0\.1:\d+/.test(output), 5_000)
    const port = Number(/Listening on 127\.0\.0\.1:(\d+)/.exec(output)?.[1])
    const sessionResponse = await fetch(`http://127.0.0.1:${port}/session`, {
      body: JSON.stringify({
        capabilities: {
          alwaysMatch: {
            acceptInsecureCerts,
            browserName: 'firefox',
            webSocketUrl: true,
            'moz:firefoxOptions': {
              // geckodriver --allow-system-access passes -remote-allow-system-access itself; Firefox
              // 153+ rejects it when also requested through capabilities.
              args: ['-headless'],
              binary: FIREFOX_BINARY,
              prefs,
            },
          },
        },
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    const sessionPayload = (await sessionResponse.json()) as {
      value?: {
        capabilities?: { webSocketUrl?: string }
        error?: string
        message?: string
      }
    }
    const webSocketUrl = sessionPayload.value?.capabilities?.webSocketUrl
    if (!sessionResponse.ok || !webSocketUrl) {
      throw new Error(`Could not create Firefox BiDi session: ${JSON.stringify(sessionPayload)}`)
    }
    sessionSocketUrl = webSocketUrl
    const socket = new WebSocket(webSocketUrl)
    bidiSocket = socket
    await new Promise<void>((resolvePromise, rejectPromise) => {
      let extensionIndex = 0
      let settled = false
      const complete = (error?: Error) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        if (error !== undefined) socket.close()
        if (error === undefined) resolvePromise()
        else rejectPromise(error)
      }
      const installNext = () => {
        socket.send(
          JSON.stringify({
            id: extensionIndex + 1,
            method: 'webExtension.install',
            params: {
              extensionData: {
                path: extensionDirectories[extensionIndex],
                type: 'path',
              },
              'moz:allowPrivateBrowsing': true,
            },
          }),
        )
      }
      const timeout = setTimeout(() => {
        complete(new Error('Timed out installing the Firefox spikes through WebDriver BiDi.'))
      }, 15_000)
      socket.addEventListener('open', installNext)
      socket.addEventListener('message', (event) => {
        const message = JSON.parse(String(event.data)) as {
          error?: string
          id?: number
          message?: string
          type?: string
        }
        if (message.id !== extensionIndex + 1) return
        if (message.type === 'success') {
          output += `\nInstalled Firefox spike through WebDriver BiDi: ${
            extensionDirectories[extensionIndex]
          }\n`
          extensionIndex += 1
          if (extensionIndex === extensionDirectories.length) complete()
          else installNext()
        } else {
          complete(new Error(`Could not install Firefox spike: ${JSON.stringify(message)}`))
        }
      })
      socket.addEventListener('error', () => {
        complete(new Error('Firefox BiDi connection failed.'))
      })
    })
  } catch (error) {
    await stopProcessGroup(child)
    await rm(directory, { force: true, recursive: true })
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}
geckodriver output:
${output}`,
      { cause: error },
    )
  }
  if (bidiSocket === undefined || sessionSocketUrl === undefined) {
    throw new Error('Firefox BiDi session missing.')
  }
  // The installing connection stays open: geckodriver answers only on it.
  return {
    bidi: wrapBidiSocket(bidiSocket),
    child,
    output: () => output,
    webSocketUrl: sessionSocketUrl,
  }
}

export interface BidiConnection {
  send<T = unknown>(method: string, params: Readonly<Record<string, unknown>>): Promise<T>
  close(): void
}

/** Request/response client over an open WebDriver BiDi socket. */
const wrapBidiSocket = (socket: WebSocket): BidiConnection => {
  let nextId = 1_000
  const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>()
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data)) as {
      id?: number
      type?: string
      result?: unknown
      error?: string
      message?: string
    }
    if (message.id === undefined) return
    const entry = pending.get(message.id)
    if (entry === undefined) return
    pending.delete(message.id)
    if (message.type === 'success') entry.resolve(message.result)
    else entry.reject(new Error(`${message.error ?? 'error'}: ${message.message ?? ''}`))
  })
  return {
    close: () => socket.close(),
    send: <T>(method: string, params: Readonly<Record<string, unknown>>) =>
      new Promise<T>((resolvePromise, rejectPromise) => {
        nextId += 1
        const id = nextId
        const timer = setTimeout(() => {
          pending.delete(id)
          rejectPromise(new Error(`BiDi ${method} timed out.`))
        }, 10_000)
        pending.set(id, {
          reject: (error) => {
            clearTimeout(timer)
            rejectPromise(error)
          },
          resolve: (value) => {
            clearTimeout(timer)
            resolvePromise(value as T)
          },
        })
        socket.send(JSON.stringify({ id, method, params }))
      }),
  }
}
