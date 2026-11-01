import { message, runtimeState } from './support'

import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

import { asIsoTimestamp } from '../../../src/domain/types/brand'
import RulesSection from '../../../src/ui/options/RulesSection.vue'
import { rule } from '../domain/fixtures'

const future = asIsoTimestamp(new Date(Date.now() + 10 * 60_000).toISOString())
const past = asIsoTimestamp(new Date(Date.now() - 60_000).toISOString())
const active = rule('active', 0, { name: 'Active' })
const paused = rule('paused', 1, {
  name: 'Paused',
  temporaryDisable: { kind: 'UNTIL', until: future },
})
const restart = rule('restart', 2, {
  name: 'Restart',
  temporaryDisable: { kind: 'UNTIL_RESTART', until: null },
})
const expired = rule('expired', 3, {
  name: 'Expired',
  temporaryDisable: { kind: 'UNTIL', until: past },
})

const mountRules = () =>
  mount(RulesSection, {
    attachTo: document.body,
    props: { busy: false, state: runtimeState({ rules: [active, paused, restart, expired] }) },
  })

const row = (wrapper: VueWrapper, name: string) =>
  wrapper.findAll('li.rule-row').find((entry) => entry.get('strong').text() === name)!

const menuItems = async (wrapper: VueWrapper, name: string) => {
  await row(wrapper, name).get('button[aria-haspopup="menu"]').trigger('click')
  await nextTick()
  return row(wrapper, name).findAll('[role="menuitem"]')
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('temporary rule disable UI', () => {
  it('offers the FR-036 durations for an active rule', async () => {
    const wrapper = mountRules()
    const items = await menuItems(wrapper, 'Active')
    const texts = items.map((item) => item.text())
    expect(texts).toEqual(
      expect.arrayContaining([
        message('disableFor5Minutes'),
        message('disableFor15Minutes'),
        message('disableFor1Hour'),
        message('disableUntilRestart'),
      ]),
    )
    await items.find((item) => item.text() === message('disableFor15Minutes'))!.trigger('click')
    expect(wrapper.emitted('command')?.[0]?.[0]).toEqual({
      duration: 'MINUTES_15',
      ruleId: active.id,
      type: 'SET_RULE_TEMPORARY_DISABLE',
    })
  })

  it('shows until when a rule is paused and lets it be re-enabled now', async () => {
    const wrapper = mountRules()
    const time = new Date(future).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    expect(row(wrapper, 'Paused').get('.temp-disabled').text()).toBe(
      message('disabledUntilTime', time),
    )
    expect(row(wrapper, 'Restart').get('.temp-disabled').text()).toBe(
      message('disabledUntilRestart'),
    )
    expect(row(wrapper, 'Expired').find('.temp-disabled').exists()).toBe(false)
    expect(row(wrapper, 'Active').find('.temp-disabled').exists()).toBe(false)

    const items = await menuItems(wrapper, 'Paused')
    expect(items.map((item) => item.text())).not.toContain(message('disableFor5Minutes'))
    await items.find((item) => item.text() === message('reenableNow'))!.trigger('click')
    expect(wrapper.emitted('command')?.[0]?.[0]).toEqual({
      ruleId: paused.id,
      type: 'CLEAR_RULE_TEMPORARY_DISABLE',
    })
  })

  it('keeps the permanent Enabled switch independent of a temporary disable', () => {
    const wrapper = mountRules()
    expect(
      (row(wrapper, 'Paused').get('input[role="switch"]').element as HTMLInputElement).checked,
    ).toBe(true)
  })
})
