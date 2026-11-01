import { message } from './support'

import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import { asIsoTimestamp } from '../../../src/domain/types/brand'
import type { ProxyCheckResult } from '../../../src/domain/types/entities'
import CheckSummary from '../../../src/ui/components/CheckSummary.vue'
import { countryDisplay, loadFlagSrc } from '../../../src/ui/flags/country'

const result = (overrides: Partial<ProxyCheckResult> = {}): ProxyCheckResult => ({
  availability: true,
  checkedAt: asIsoTimestamp('2026-11-01T10:00:00.000Z'),
  connectDurationMs: null,
  country: 'DE',
  errorCode: null,
  externalIp: '203.0.113.7',
  httpStatus: 200,
  totalDurationMs: 709.6,
  ...overrides,
})

describe('country display', () => {
  it('maps ISO codes to an English name and a bundled SVG flag', async () => {
    expect(countryDisplay('de')).toEqual({ code: 'DE', name: 'Germany' })
    expect(await loadFlagSrc('DE')).toMatch(/^data:image\/svg\+xml,/)
  })

  it('keeps free-text countries without inventing a flag', () => {
    expect(countryDisplay('Atlantis')).toEqual({ code: null, name: 'Atlantis' })
    expect(countryDisplay('ZZ')).toEqual({ code: null, name: 'ZZ' })
  })
})

describe('check summary', () => {
  it('shows status, latency, IP and the country with its flag without truncation', async () => {
    const wrapper = mount(CheckSummary, { props: { result: result() } })
    await vi.waitFor(() => expect(wrapper.find('img.flag').exists()).toBe(true))
    expect(wrapper.get('.badge').text()).toBe(message('available'))
    expect(wrapper.get('.check-latency').text()).toBe(`710 ${message('millisecondsShort')}`)
    expect(wrapper.get('.check-ip').text()).toBe('203.0.113.7')
    const flag = wrapper.get('img.flag')
    expect(flag.attributes('alt')).toBe('')
    expect(wrapper.get('.check-country').text()).toBe('Germany')
    expect(wrapper.get('.check-country').attributes('title')).toBe('Germany (DE)')
    expect(wrapper.find('.truncate').exists()).toBe(false)
  })

  it('explains a failure instead of showing an IP', () => {
    const wrapper = mount(CheckSummary, {
      props: {
        result: result({
          availability: false,
          country: null,
          errorCode: 'TIMEOUT',
          externalIp: null,
        }),
      },
    })
    expect(wrapper.get('.badge').text()).toBe(message('unavailable'))
    expect(wrapper.get('.badge').classes()).toContain('danger')
    expect(wrapper.find('.check-ip').exists()).toBe(false)
    expect(wrapper.find('img.flag').exists()).toBe(false)
    expect(wrapper.get('.check-error').text()).not.toBe('')
  })
})
