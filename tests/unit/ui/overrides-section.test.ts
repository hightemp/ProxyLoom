import { message, runtimeState } from './support'

import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

import { asTemporaryOverrideId } from '../../../src/domain/types/brand'
import { confirmController } from '../../../src/ui/confirm/confirm-controller'
import OverridesSection from '../../../src/ui/options/OverridesSection.vue'
import { override, profile } from '../domain/fixtures'

const office = profile('office', { name: 'Office', shortName: 'OF' })
const once = override({
  generatedPattern: '^(?:https?|wss?)://www\\.example\\.co\\.uk(?::\\d+)?/$',
  id: asTemporaryOverrideId('once-1'),
  originKey: 'www.example.co.uk',
  sourceHostname: 'www.example.co.uk',
  sourceTabId: 12,
})

const mountSection = (overrides = [once], platform: 'CHROMIUM' | 'FIREFOX' = 'CHROMIUM') => {
  const state = runtimeState({ profiles: [office] }, { overrides })
  return mount(OverridesSection, {
    attachTo: document.body,
    props: {
      busy: false,
      state: {
        ...state,
        diagnostics: { ...state.diagnostics, platform },
      },
    },
  })
}

const button = (wrapper: VueWrapper, name: string) => {
  const found = wrapper
    .findAll('button')
    .find((candidate) => candidate.text() === name || candidate.attributes('aria-label') === name)
  if (found === undefined) throw new Error(`Button not found: ${name}`)
  return found
}

afterEach(() => {
  if (confirmController.pending.value !== null) confirmController.answer(false)
  document.body.innerHTML = ''
})

describe('Temporary overrides section', () => {
  it('explains how to create a Once override when none are active', () => {
    const wrapper = mountSection([])
    expect(wrapper.text()).toContain(message('noOverrides'))
    expect(wrapper.find('table').exists()).toBe(false)
  })

  it('lists site, scope, route by name and short name, and the Chromium tab scope', () => {
    const wrapper = mountSection([
      once,
      override({
        action: { targetProxyProfileId: office.id, type: 'PROXY' },
        id: asTemporaryOverrideId('once-2'),
        originKey: 'example.org',
        scope: 'REGISTRABLE_DOMAIN',
        sourceHostname: 'a.example.org',
      }),
    ])
    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.text()).toContain('www.example.co.uk')
    expect(rows[0]!.text()).toContain(message('exactHostname'))
    expect(rows[0]!.text()).toContain(message('decisionDirect'))
    expect(rows[0]!.text()).toContain(message('overrideAllTabsOnSite'))
    expect(rows[1]!.text()).toContain(message('domainSubdomains'))
    expect(rows[1]!.text()).toContain('Office')
    expect(rows[1]!.text()).toContain('OF')
  })

  it('shows Firefox overrides as tab-scoped', () => {
    const wrapper = mountSection([{ ...once, platformScope: 'TAB' }], 'FIREFOX')
    expect(wrapper.get('tbody tr').text()).toContain(message('overrideThisTab'))
  })

  it('edits scope and route with a preview generated from the source hostname', async () => {
    const wrapper = mountSection()
    await button(wrapper, message('editOverrideFor', once.originKey)).trigger('click')
    await wrapper.get('select[name="override-scope"]').setValue('REGISTRABLE_DOMAIN')
    await wrapper.get('select[name="override-route"]').setValue(`PROFILE:${office.id}`)
    expect(wrapper.get('.override-preview code').text()).toBe(
      '^(?:https?|wss?)://(?:[^./]+\\.)*example\\.co\\.uk(?::\\d+)?/$',
    )
    expect(wrapper.find('dialog.modal').exists()).toBe(true)
    await wrapper.get('form.override-editor').trigger('submit')
    expect(wrapper.emitted('command')?.[0]?.[0]).toEqual({
      action: { targetProxyProfileId: office.id, type: 'PROXY' },
      overrideId: once.id,
      scope: 'REGISTRABLE_DOMAIN',
      type: 'UPDATE_OVERRIDE',
    })
  })

  it('returns focus to the Edit button when the editor closes', async () => {
    const wrapper = mountSection()
    const editButton = button(wrapper, message('editOverrideFor', once.originKey))
    ;(editButton.element as HTMLButtonElement).focus()
    await editButton.trigger('click')
    await button(wrapper, message('cancel')).trigger('click')
    await flushPromises()
    expect(document.activeElement).toBe(editButton.element)
  })

  it('removes one override without a confirmation', async () => {
    const wrapper = mountSection()
    await button(wrapper, message('removeOverrideFor', once.originKey)).trigger('click')
    expect(wrapper.emitted('command')?.[0]?.[0]).toEqual({
      overrideId: once.id,
      type: 'REMOVE_OVERRIDE',
    })
  })

  it('previews the rule before making an override permanent', async () => {
    const wrapper = mountSection()
    await button(wrapper, message('makePermanentFor', once.originKey)).trigger('click')
    expect(confirmController.pending.value?.code).toBe(once.generatedPattern)
    confirmController.answer(true)
    await flushPromises()
    expect(wrapper.emitted('command')?.[0]?.[0]).toEqual({
      overrideId: once.id,
      type: 'PROMOTE_OVERRIDE',
    })
  })

  it('asks before clearing all overrides of this session', async () => {
    const wrapper = mountSection()
    await button(wrapper, message('clearAllOverrides')).trigger('click')
    expect(confirmController.pending.value?.tone).toBe('danger')
    confirmController.answer(true)
    await flushPromises()
    expect(wrapper.emitted('command')?.[0]?.[0]).toEqual({ type: 'CLEAR_OVERRIDES' })
  })
})
