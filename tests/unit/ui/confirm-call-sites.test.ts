import { message, runtimeState } from './support'

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

import { confirmController } from '../../../src/ui/confirm/confirm-controller'
import GeneralSection from '../../../src/ui/options/GeneralSection.vue'
import ProfilesSection from '../../../src/ui/options/ProfilesSection.vue'
import RulesSection from '../../../src/ui/options/RulesSection.vue'
import { profile, rule } from '../domain/fixtures'
import { asProxyProfileId } from '../../../src/domain/types/brand'

const sourceFiles = (directory: string): string[] =>
  readdirSync(directory).flatMap((name) => {
    const path = join(directory, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(?:vue|ts)$/u.test(name) ? [path] : []
  })

const buttonByText = (wrapper: VueWrapper, text: string) => {
  const button = wrapper.findAll('button').find((candidate) => candidate.text() === text)
  if (button === undefined) throw new Error(`Button not found: ${text}`)
  return button
}

afterEach(() => {
  if (confirmController.pending.value !== null) confirmController.answer(false)
})

describe('confirmation call sites', () => {
  it('never uses blocking browser dialogs in extension UI', () => {
    const offenders = [...sourceFiles('entrypoints'), ...sourceFiles('src/ui')].filter((path) =>
      /(?:\bwindow\.|(?<![.\w]))(?:confirm|alert|prompt)\s*\(/u.test(readFileSync(path, 'utf8')),
    )
    expect(offenders).toEqual([])
  })

  it('asks before deleting a profile used by rules and deletes after acceptance', async () => {
    const used = profile('p1', { name: 'Office' })
    const wrapper = mount(ProfilesSection, {
      props: {
        busy: false,
        state: runtimeState({
          profiles: [used],
          rules: [rule('r1', 0, { action: { targetProxyProfileId: used.id, type: 'PROXY' } })],
        }),
      },
    })

    await buttonByText(wrapper, message('delete')).trigger('click')
    expect(confirmController.pending.value?.tone).toBe('danger')
    expect(confirmController.pending.value?.message).toContain('Office')
    expect(wrapper.emitted('command')).toBeUndefined()

    confirmController.answer(true)
    await flushPromises()
    expect(wrapper.emitted('command')?.[0]?.[0]).toMatchObject({
      profileId: used.id,
      type: 'DELETE_PROFILE',
    })
  })

  it('deletes without asking when destructive confirmations are disabled', async () => {
    const used = profile('p1')
    const state = runtimeState({
      profiles: [used],
      rules: [rule('r1', 0, { action: { targetProxyProfileId: used.id, type: 'PROXY' } })],
    })
    const wrapper = mount(ProfilesSection, {
      props: {
        busy: false,
        state: {
          ...state,
          config: {
            ...state.config,
            general: { ...state.config.general, confirmDangerousActions: false },
          },
        },
      },
    })

    await buttonByText(wrapper, message('delete')).trigger('click')
    await flushPromises()
    expect(confirmController.pending.value).toBeNull()
    expect(wrapper.emitted('command')?.[0]?.[0]).toMatchObject({ type: 'DELETE_PROFILE' })
  })

  it('always discloses the external request before a manual proxy check', async () => {
    const checked = profile('p1')
    const state = runtimeState({ profiles: [checked] })
    const wrapper = mount(ProfilesSection, {
      props: {
        busy: false,
        state: {
          ...state,
          config: {
            ...state.config,
            general: { ...state.config.general, confirmDangerousActions: false },
          },
        },
      },
    })

    await buttonByText(wrapper, message('check')).trigger('click')
    expect(confirmController.pending.value?.message).toContain(checked.checkUrl)
    confirmController.answer(false)
    await flushPromises()
    expect(wrapper.emitted('command')).toBeUndefined()
  })

  it('asks before deleting a rule', async () => {
    const wrapper = mount(RulesSection, {
      props: {
        busy: false,
        state: runtimeState({
          profiles: [profile('p1')],
          rules: [
            rule('r1', 0, {
              action: { targetProxyProfileId: asProxyProfileId('p1'), type: 'PROXY' },
              name: 'Work',
            }),
          ],
        }),
      },
    })

    await buttonByText(wrapper, message('delete')).trigger('click')
    expect(confirmController.pending.value?.message).toContain('Work')
    expect(wrapper.emitted('command')).toBeUndefined()
    confirmController.answer(true)
    await flushPromises()
    expect(wrapper.emitted('command')?.[0]?.[0]).toMatchObject({ type: 'DELETE_RULE' })
  })

  it('exposes the destructive-confirmation preference in General settings', async () => {
    const wrapper = mount(GeneralSection, { props: { busy: false, state: runtimeState() } })
    const toggle = wrapper
      .findAll('label.check-row')
      .find((row) => row.text().includes(message('confirmDangerousActions')))
    expect(toggle).toBeDefined()
    await toggle!.get('input').setValue(false)
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('command')?.[0]?.[0]).toMatchObject({
      settings: { confirmDangerousActions: false },
      type: 'UPDATE_GENERAL',
    })
  })
})
