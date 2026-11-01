import { message } from './support'

import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

import { asTemporaryOverrideId } from '../../../src/domain/types/brand'
import type { TemporaryOverride } from '../../../src/domain/types/entities'
import { confirmController } from '../../../src/ui/confirm/confirm-controller'
import SiteOverrides from '../../../src/ui/popup/SiteOverrides.vue'
import { override, profile } from '../domain/fixtures'

const office = profile('office', { name: 'Office', shortName: 'OF' })
const own = override({
  id: asTemporaryOverrideId('own'),
  originKey: 'www.example.com',
  sourceTabId: 5,
})
const foreign = override({
  action: { targetProxyProfileId: office.id, type: 'PROXY' },
  id: asTemporaryOverrideId('foreign'),
  originKey: 'example.com',
  scope: 'REGISTRABLE_DOMAIN',
  sourceTabId: 9,
})

const mountBlock = (overrides: readonly TemporaryOverride[] = [own, foreign]) =>
  mount(SiteOverrides, {
    props: {
      activeTabId: 5,
      busy: false,
      hostname: 'www.example.com',
      overrides,
      profiles: [office],
      tabId: 5,
    },
  })

const button = (wrapper: VueWrapper, text: string, index = 0) => {
  const found = wrapper.findAll('button').filter((candidate) => candidate.text() === text)[index]
  if (found === undefined) throw new Error(`Button not found: ${text}`)
  return found
}

afterEach(() => {
  if (confirmController.pending.value !== null) confirmController.answer(false)
})

describe('popup site overrides', () => {
  it('renders nothing when no override covers the site', () => {
    expect(mountBlock([]).find('section').exists()).toBe(false)
  })

  it('lists overrides for the site and marks ones created in another tab', () => {
    const items = mountBlock().findAll('li')
    expect(items).toHaveLength(2)
    expect(items[0]!.text()).not.toContain(message('fromAnotherTab'))
    expect(items[1]!.text()).toContain(message('fromAnotherTab'))
    expect(items[1]!.text()).toContain(message('domainSubdomains'))
  })

  it('changes the route immediately', async () => {
    const wrapper = mountBlock()
    await wrapper.findAll('select')[0]!.setValue(`PROFILE:${office.id}`)
    expect(wrapper.emitted('command')?.[0]?.[0]).toEqual({
      action: { targetProxyProfileId: office.id, type: 'PROXY' },
      overrideId: own.id,
      tabId: 5,
      type: 'UPDATE_OVERRIDE',
    })
  })

  it('removes and promotes with the tab context', async () => {
    const wrapper = mountBlock()
    await button(wrapper, message('remove')).trigger('click')
    expect(wrapper.emitted('command')?.[0]?.[0]).toEqual({
      overrideId: own.id,
      tabId: 5,
      type: 'REMOVE_OVERRIDE',
    })

    await button(wrapper, message('makePermanent')).trigger('click')
    expect(confirmController.pending.value?.code).toBe(own.generatedPattern)
    confirmController.answer(true)
    await flushPromises()
    expect(wrapper.emitted('command')?.[1]?.[0]).toEqual({
      overrideId: own.id,
      tabId: 5,
      type: 'PROMOTE_OVERRIDE',
    })
  })

  it('opens the full list in settings', async () => {
    const wrapper = mountBlock()
    await button(wrapper, message('manageAllOverrides')).trigger('click')
    expect(wrapper.emitted('command')?.[0]?.[0]).toEqual({
      section: 'overrides',
      type: 'OPEN_SETTINGS',
    })
  })
})
