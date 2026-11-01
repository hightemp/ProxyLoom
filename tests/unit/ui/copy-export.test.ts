import { message, runtimeMessages, runtimeState, setRuntimeResponder } from './support'

import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import { confirmController } from '../../../src/ui/confirm/confirm-controller'
import ImportExportSection from '../../../src/ui/options/ImportExportSection.vue'
import ProfilesSection from '../../../src/ui/options/ProfilesSection.vue'
import { endpoint, profile } from '../domain/fixtures'

const office = profile('office', {
  httpEndpoint: { ...endpoint('192.0.2.1', 8080), password: 'pw', username: 'bob' },
  name: 'Office',
  useSameProxy: true,
})
const open = profile('open', {
  httpEndpoint: endpoint('192.0.2.2', 3128),
  name: 'Open',
  useSameProxy: true,
})

const writeText = vi.fn<(text: string) => Promise<void>>()
const downloads: { name: string; text: Promise<string> }[] = []

beforeEach(() => {
  writeText.mockReset().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  downloads.splice(0)
  URL.createObjectURL = (blob: Blob) => {
    downloads.push({ name: '', text: blob.text() })
    return 'blob:test'
  }
  URL.revokeObjectURL = () => undefined
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloads.at(-1)!.name = this.download
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  runtimeMessages.splice(0)
  setRuntimeResponder(() => ({ ok: true, value: null }))
  if (confirmController.pending.value !== null) confirmController.answer(false)
})

const menuItem = async (wrapper: VueWrapper, cardIndex: number, text: string) => {
  const card = wrapper.findAll('li.proxy-row')[cardIndex]!
  await card.get('button[aria-haspopup="menu"]').trigger('click')
  await nextTick()
  const item = card.findAll('[role="menuitem"]').find((candidate) => candidate.text() === text)
  if (item === undefined) throw new Error(`Menu item not found: ${text}`)
  return item
}

const button = (wrapper: VueWrapper, text: string, index = 0) => {
  const found = wrapper.findAll('button').filter((candidate) => candidate.text() === text)[index]
  if (found === undefined) throw new Error(`Button not found: ${text}`)
  return found
}

describe('copy profile as text', () => {
  const mountProfiles = () =>
    mount(ProfilesSection, {
      props: { busy: false, state: runtimeState({ profiles: [office, open] }) },
    })

  it('copies a URL with credentials and says that it contains a password', async () => {
    const wrapper = mountProfiles()
    await (await menuItem(wrapper, 0, message('copyUrl'))).trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith('http://bob:pw@192.0.2.1:8080')
    expect(wrapper.emitted('status')?.[0]).toEqual([message('copiedWithPassword')])
  })

  it('copies curl and compact forms', async () => {
    const wrapper = mountProfiles()
    await (await menuItem(wrapper, 0, message('copyCurl'))).trigger('click')
    await (await menuItem(wrapper, 0, message('copyCompact'))).trigger('click')
    await flushPromises()
    expect(writeText.mock.calls.map(([text]) => text)).toEqual([
      `curl -x 'http://bob:pw@192.0.2.1:8080' '${office.checkUrl}'`,
      '192.0.2.1:8080:bob:pw',
    ])
  })

  it('reports plain Copied for a profile without credentials and copies all as URLs', async () => {
    const wrapper = mountProfiles()
    await (await menuItem(wrapper, 1, message('copyUrl'))).trigger('click')
    await flushPromises()
    expect(wrapper.emitted('status')?.[0]).toEqual([message('copied')])

    await button(wrapper, message('copyAllAsUrls')).trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenLastCalledWith(
      'http://bob:pw@192.0.2.1:8080\nhttp://192.0.2.2:3128\n',
    )
  })

  it('reports a failed clipboard write as an error', async () => {
    writeText.mockRejectedValueOnce(new Error('denied'))
    const wrapper = mountProfiles()
    await (await menuItem(wrapper, 0, message('copyUrl'))).trigger('click')
    await flushPromises()
    expect(wrapper.emitted('status')?.[0]).toEqual([message('copyFailed'), true])
  })
})

describe('export with credentials and as text', () => {
  const mountExport = () =>
    mount(ImportExportSection, {
      props: { busy: false, state: runtimeState({ profiles: [office, open] }) },
    })

  it('includes credentials by default with a visible warning and no blocking confirm', async () => {
    setRuntimeResponder(() => ({ ok: true, value: { filename: 'backup.json', text: '{}' } }))
    const wrapper = mountExport()
    const checkbox = wrapper
      .findAll('label.check-row')
      .find((row) => row.text().includes(message('includeProxyCredentials')))!
      .get('input')
    expect((checkbox.element as HTMLInputElement).checked).toBe(true)
    expect(wrapper.text()).toContain(message('credentialExportWarning'))

    await button(wrapper, message('downloadJsonExport')).trigger('click')
    await flushPromises()
    expect(confirmController.pending.value).toBeNull()
    expect(runtimeMessages.at(-1)).toEqual({ includeCredentials: true, type: 'EXPORT_NATIVE' })

    await checkbox.setValue(false)
    expect(wrapper.text()).not.toContain(message('credentialExportWarning'))
  })

  it('exports proxies as a text file in the chosen format', async () => {
    const wrapper = mountExport()
    await wrapper.get('select[name="text-export-format"]').setValue('COMPACT')
    await button(wrapper, message('exportProxiesAsText')).trigger('click')
    await flushPromises()
    expect(downloads).toHaveLength(1)
    expect(downloads[0]!.name).toMatch(/^proxyloom-proxies-\d{4}-\d{2}-\d{2}\.txt$/u)
    expect(await downloads[0]!.text).toBe('192.0.2.1:8080:bob:pw\n192.0.2.2:3128\n')
  })
})
