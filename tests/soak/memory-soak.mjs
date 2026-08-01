import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { chromium } from '@playwright/test'

const MEBIBYTE = 1_024 * 1_024
const durationMs = Number(process.env.PROXYLOOM_SOAK_DURATION_MS ?? 300_000)
const sampleIntervalMs = Number(process.env.PROXYLOOM_SOAK_SAMPLE_INTERVAL_MS ?? 30_000)
const warmupMs = Number(process.env.PROXYLOOM_SOAK_WARMUP_MS ?? 60_000)
if (
  !Number.isSafeInteger(durationMs) ||
  durationMs < 30_000 ||
  durationMs > 3_600_000 ||
  !Number.isSafeInteger(sampleIntervalMs) ||
  sampleIntervalMs < 5_000 ||
  sampleIntervalMs > durationMs ||
  !Number.isSafeInteger(warmupMs) ||
  warmupMs < 10_000 ||
  warmupMs > 600_000
) {
  throw new Error('Invalid soak duration, sample interval, or warm-up duration')
}

const extensionPath = resolve('.output/chrome-mv3')
const userDataDirectory = await mkdtemp(join(tmpdir(), 'proxyloom-memory-soak-'))

const readBrowserProcessMemory = async () => {
  const processes = []
  for (const entry of await readdir('/proc', { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^\d+$/u.test(entry.name)) continue
    const root = join('/proc', entry.name)
    try {
      const commandLine = await readFile(join(root, 'cmdline'), 'utf8')
      if (!commandLine.includes(userDataDirectory)) continue
      const [status, smaps] = await Promise.all([
        readFile(join(root, 'status'), 'utf8'),
        readFile(join(root, 'smaps_rollup'), 'utf8'),
      ])
      const rssKb = Number(status.match(/^VmRSS:\s+(\d+)\s+kB$/mu)?.[1] ?? 0)
      const pssKb = Number(smaps.match(/^Pss:\s+(\d+)\s+kB$/mu)?.[1] ?? 0)
      processes.push({ pssKb, rssKb })
    } catch {
      // A Chromium process can exit between the /proc listing and file reads.
    }
  }
  return {
    processCount: processes.length,
    pssBytes: processes.reduce((sum, process) => sum + process.pssKb * 1_024, 0),
    rssBytes: processes.reduce((sum, process) => sum + process.rssKb * 1_024, 0),
  }
}

const context = await chromium.launchPersistentContext(userDataDirectory, {
  args: [
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
    '--disable-component-update',
    '--disable-dev-shm-usage',
    '--no-default-browser-check',
    '--no-first-run',
  ],
  channel: 'chromium',
  headless: true,
})

try {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
  const extensionId = new URL(worker.url()).host
  const options = await context.newPage()
  await options.goto(`chrome-extension://${extensionId}/options.html`)
  await options.getByRole('heading', { name: 'General', exact: true }).waitFor()
  const cdp = await context.newCDPSession(options)
  await Promise.all([cdp.send('HeapProfiler.enable'), cdp.send('Performance.enable')])

  const sectionNames = [
    /^General/,
    /^Proxies/,
    /^Rules/,
    /^Logs/,
    /^Import & Export/,
    /^Appearance/,
    /^About \/ Diagnostics/,
  ]
  const exercise = async (iteration) => {
    for (const name of sectionNames) {
      await options.getByRole('button', { name }).click()
    }
    const popup = await context.newPage()
    await popup.goto(`chrome-extension://${extensionId}/popup.html?soak=${String(iteration)}`)
    await popup.getByRole('button', { name: 'Open Settings' }).waitFor()
    await popup.close()
  }
  const sample = async (elapsedMs, iteration) => {
    await cdp.send('HeapProfiler.collectGarbage')
    await options.waitForTimeout(100)
    const [heap, performanceResult, processMemory] = await Promise.all([
      cdp.send('Runtime.getHeapUsage'),
      cdp.send('Performance.getMetrics'),
      readBrowserProcessMemory(),
    ])
    const metrics = new Map(performanceResult.metrics.map((metric) => [metric.name, metric.value]))
    return {
      documents: metrics.get('Documents') ?? -1,
      elapsedMs,
      eventListeners: metrics.get('JSEventListeners') ?? -1,
      frames: metrics.get('Frames') ?? -1,
      heapUsedBytes: heap.usedSize,
      iteration,
      nodes: metrics.get('Nodes') ?? -1,
      ...processMemory,
    }
  }

  let iteration = 0
  const warmupStartedAt = Date.now()
  while (Date.now() - warmupStartedAt < warmupMs) {
    await exercise(iteration)
    iteration += 1
  }
  const actualWarmupMs = Date.now() - warmupStartedAt
  const warmupIterations = iteration
  const samples = [await sample(0, iteration)]
  process.stdout.write(`${JSON.stringify(samples[0])}\n`)

  const startedAt = Date.now()
  let nextSampleAt = sampleIntervalMs
  while (Date.now() - startedAt < durationMs) {
    await exercise(iteration)
    iteration += 1
    const elapsedMs = Date.now() - startedAt
    if (elapsedMs >= nextSampleAt) {
      const current = await sample(elapsedMs, iteration)
      samples.push(current)
      process.stdout.write(`${JSON.stringify(current)}\n`)
      nextSampleAt += sampleIntervalMs
    }
  }
  const finalElapsedMs = Date.now() - startedAt
  if (samples.at(-1)?.elapsedMs !== finalElapsedMs) {
    const finalSample = await sample(finalElapsedMs, iteration)
    samples.push(finalSample)
    process.stdout.write(`${JSON.stringify(finalSample)}\n`)
  }

  const baseline = samples[0]
  const final = samples.at(-1)
  if (baseline === undefined || final === undefined) throw new Error('Missing soak samples')
  const growth = {
    documents: final.documents - baseline.documents,
    eventListeners: final.eventListeners - baseline.eventListeners,
    heapUsedBytes: final.heapUsedBytes - baseline.heapUsedBytes,
    nodes: final.nodes - baseline.nodes,
    processCount: final.processCount - baseline.processCount,
    pssBytes: final.pssBytes - baseline.pssBytes,
    rssBytes: final.rssBytes - baseline.rssBytes,
  }
  const limits = {
    documents: 2,
    eventListeners: 100,
    heapUsedBytes: 8 * MEBIBYTE,
    nodes: 250,
    processCount: 2,
    pssBytes: 64 * MEBIBYTE,
  }
  process.stdout.write(
    `${JSON.stringify({
      durationMs: finalElapsedMs,
      growth,
      iterations: iteration - warmupIterations,
      limits,
      warmupIterations,
      warmupMs: actualWarmupMs,
    })}\n`,
  )
  for (const [metric, limit] of Object.entries(limits)) {
    if (growth[metric] > limit) {
      throw new Error(`Memory soak exceeded ${metric}: ${growth[metric]} > ${limit}`)
    }
  }
} finally {
  await context.close()
  await rm(userDataDirectory, { force: true, recursive: true })
}
