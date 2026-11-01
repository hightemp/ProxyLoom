import { message, runtimeState } from './support'

import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

import { confirmController } from '../../../src/ui/confirm/confirm-controller'
import RulesSection from '../../../src/ui/options/RulesSection.vue'
import { profile, rule } from '../domain/fixtures'

const office = profile('office', { name: 'Office', shortName: 'OF', useSameProxy: true })
const viaOffice = rule('via', 0, {
  action: { targetProxyProfileId: office.id, type: 'PROXY' },
  name: 'Work',
  pattern: `^https://${'very-long-'.repeat(12)}example\\.com/$`,
})
const direct = rule('direct', 1, { enabled: false, name: 'Local' })
const firefoxOnly = rule('ff', 2, { matcherType: 'FULL_URL', name: 'Paths' })

const mountRules = () =>
  mount(RulesSection, {
    attachTo: document.body,
    props: {
      busy: false,
      state: runtimeState({ profiles: [office], rules: [viaOffice, direct, firefoxOnly] }),
    },
  })

const row = (wrapper: VueWrapper, name: string) =>
  wrapper.findAll('li.rule-row').find((entry) => entry.get('strong').text() === name)!
const button = (wrapper: VueWrapper, text: string) =>
  wrapper.findAll('button').find((candidate) => candidate.text() === text)!

afterEach(() => {
  if (confirmController.pending.value !== null) confirmController.answer(false)
  document.body.innerHTML = ''
})

describe('rule rows', () => {
  it('shows the route as a chip and a labelled enabled switch', () => {
    const wrapper = mountRules()
    const work = row(wrapper, 'Work')
    expect(work.get('.profile-chip').text()).toContain('OF')
    expect(work.get('.profile-chip').text()).toContain('Office')
    expect(row(wrapper, 'Local').get('.profile-chip').text()).toBe(message('decisionDirect'))

    const toggle = work.get('input[role="switch"]')
    expect(toggle.attributes('aria-label')).toBe(message('enableRule', 'Work'))
    expect(work.get('.switch-text').text()).toBe(message('enabled'))
    expect(row(wrapper, 'Local').get('.switch-text').text()).toBe(message('disabled'))
    expect(row(wrapper, 'Paths').text()).toContain(message('firefoxOnly'))
  })

  it('truncates long patterns until expanded', async () => {
    const wrapper = mountRules()
    const work = row(wrapper, 'Work')
    expect(work.get('code.rule-pattern').classes()).not.toContain('expanded')
    const toggle = work.get('button.pattern-toggle')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    await toggle.trigger('click')
    expect(work.get('code.rule-pattern').classes()).toContain('expanded')
    expect(toggle.attributes('aria-expanded')).toBe('true')
  })

  it('keeps edit, duplicate, temporary disable and delete in a menu next to the move buttons', async () => {
    const wrapper = mountRules()
    const work = row(wrapper, 'Work')
    expect(work.find(`button[aria-label="${message('moveRuleDown', 'Work')}"]`).exists()).toBe(true)
    await work.get('button[aria-haspopup="menu"]').trigger('click')
    await nextTick()
    expect(work.findAll('[role="menuitem"]').map((item) => item.text())).toEqual([
      message('edit'),
      message('duplicate'),
      message('disableFor5Minutes'),
      message('disableFor15Minutes'),
      message('disableFor1Hour'),
      message('disableUntilRestart'),
      message('delete'),
    ])
  })
})

describe('rule filters and bulk actions', () => {
  it('keeps secondary filters behind More filters and reports the count', async () => {
    const wrapper = mountRules()
    expect(wrapper.find('select[name="rule-action-filter"]').exists()).toBe(false)
    await button(wrapper, message('moreFilters')).trigger('click')
    await wrapper.get('select[name="rule-action-filter"]').setValue('PROXY')
    expect(wrapper.text()).toContain(message('showingCount', ['1', '3']))
  })

  it('disables and deletes selected rules', async () => {
    const wrapper = mountRules()
    await button(wrapper, message('selectAllShown')).trigger('click')
    await button(wrapper, message('disableSelected', '3')).trigger('click')
    expect(wrapper.emitted('command')?.[0]?.[0]).toEqual({
      enabled: false,
      ruleIds: ['via', 'direct', 'ff'],
      type: 'SET_RULES_ENABLED',
    })
    await button(wrapper, message('deleteSelected', '3')).trigger('click')
    expect(confirmController.pending.value?.tone).toBe('danger')
    confirmController.answer(true)
    await flushPromises()
    expect(wrapper.emitted('command')?.[1]?.[0]).toEqual({
      ruleIds: ['via', 'direct', 'ff'],
      type: 'DELETE_RULES',
    })
  })

  it('opens the rule editor in a labelled drawer', async () => {
    const wrapper = mountRules()
    await button(wrapper, message('addRule')).trigger('click')
    await nextTick()
    const dialog = wrapper.get('dialog.drawer')
    expect(wrapper.get(`#${dialog.attributes('aria-labelledby')}`).text()).toBe(message('addRule'))
  })
})
