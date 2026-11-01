<script setup lang="ts">
import { ChevronLeft, ChevronRight, Filter, Trash2 } from '@lucide/vue'
import { shallowRef } from 'vue'

import type { AppRuntimeState, RuntimeRequest } from '../../application/runtime/contracts'
import type { LogQuery } from '../../application/logging/log-types'
import { t } from '../../i18n/messages'
import { decisionActionLabel, proxyInfoTypeLabel, requestTypeLabel } from '../labels'
import { confirmController } from '../confirm/confirm-controller'

const props = defineProps<{
  state: AppRuntimeState
  busy: boolean
}>()
const emit = defineEmits<{
  command: [request: RuntimeRequest]
  reloadLogs: [query: LogQuery]
}>()

const hostname = shallowRef('')
const errorsOnly = shallowRef(false)
const platform = shallowRef<'' | 'CHROMIUM' | 'FIREFOX'>('')
const offset = shallowRef(0)

const load = (): void => {
  emit('reloadLogs', {
    errorsOnly: errorsOnly.value,
    hostname: hostname.value,
    limit: 100,
    offset: offset.value,
    platform: platform.value === '' ? null : platform.value,
  })
}

const applyFilters = (): void => {
  offset.value = 0
  load()
}

const newer = (): void => {
  offset.value = Math.max(0, offset.value - 100)
  load()
}

const older = (): void => {
  offset.value += 100
  load()
}

const clear = async (): Promise<void> => {
  const confirmed = await confirmController.destructive(
    { confirmLabel: t('clearLogs'), message: t('clearLogsWarning'), title: t('clearLogsTitle') },
    props.state.config.general.confirmDangerousActions,
  )
  if (confirmed) emit('command', { includePrivate: true, type: 'CLEAR_LOGS' })
}
</script>

<template>
  <div class="stack">
    <div class="section-heading">
      <div>
        <h2>{{ t('routingLogs') }}</h2>
        <p>{{ t('routingLogsDescription') }}</p>
      </div>
      <button class="danger-text" type="button" :disabled="busy" @click="void clear()">
        <Trash2 :size="16" aria-hidden="true" />
        {{ t('clearLogs') }}
      </button>
    </div>

    <article class="surface card stack">
      <div class="filter-grid">
        <label>
          {{ t('hostnameContains') }}
          <input
            v-model="hostname"
            type="search"
            :placeholder="t('exampleHostname')"
            @keyup.enter="load"
          />
        </label>
        <label>
          {{ t('platform') }}
          <select v-model="platform">
            <option value="">{{ t('all') }}</option>
            <option value="CHROMIUM">{{ t('chromium') }}</option>
            <option value="FIREFOX">{{ t('firefox') }}</option>
          </select>
        </label>
        <label class="check-row compact">
          <input v-model="errorsOnly" type="checkbox" />
          <span>{{ t('errorsAuthOnly') }}</span>
        </label>
        <button type="button" @click="applyFilters">
          <Filter :size="16" aria-hidden="true" />
          {{ t('applyFilters') }}
        </button>
      </div>
      <p v-if="state.privateLogCount > 0" class="notice">
        {{ state.privateLogCount }} {{ t('privateEntriesPrefix') }}
      </p>
    </article>

    <div v-if="state.logs.length === 0" class="surface empty-state">
      <strong>{{ t('noLogEntries') }}</strong>
      <p>{{ t('noLogEntriesDescription') }}</p>
    </div>
    <div v-else class="log-table-wrap surface">
      <table>
        <caption class="sr-only">
          {{
            t('localRoutingLog')
          }}
        </caption>
        <thead>
          <tr>
            <th>{{ t('time') }}</th>
            <th>{{ t('request') }}</th>
            <th>{{ t('hostname') }}</th>
            <th>{{ t('plannedRoute') }}</th>
            <th>{{ t('rule') }}</th>
            <th>{{ t('status') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="entry in state.logs" :key="`${entry.id ?? 0}-${entry.timestamp}`">
            <td>{{ new Date(entry.timestamp).toLocaleString() }}</td>
            <td>{{ requestTypeLabel(entry.requestType) }}</td>
            <td>
              <code>{{ entry.scheme }}://{{ entry.hostname }}</code>
            </td>
            <td>
              {{ decisionActionLabel(entry.plannedAction) }}
              <button
                v-if="entry.plannedProxyProfileId"
                class="link-button"
                type="button"
                @click="emit('command', { section: 'proxies', type: 'OPEN_SETTINGS' })"
              >
                {{
                  state.config.profiles.find(
                    (profile) => profile.id === entry.plannedProxyProfileId,
                  )?.name ?? t('missingProfile')
                }}
              </button>
              <small v-if="entry.actualProxyInfo">
                {{ t('actual') }} {{ proxyInfoTypeLabel(entry.actualProxyInfo.type) }}
              </small>
            </td>
            <td>
              <button
                v-if="entry.matchedRuleId"
                class="link-button"
                type="button"
                @click="emit('command', { section: 'rules', type: 'OPEN_SETTINGS' })"
              >
                {{ entry.matchedRuleName ?? t('missingRule') }}
              </button>
              <span v-else>—</span>
            </td>
            <td>
              <span v-if="entry.errorCode || entry.authFailure" class="status-pill danger">
                {{ entry.errorCode ?? t('authFailure') }}
              </span>
              <span v-else>
                {{ entry.httpStatus ?? t('completed') }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="button-row">
      <button type="button" :disabled="offset === 0" @click="newer">
        <ChevronLeft :size="16" aria-hidden="true" />
        {{ t('newer') }}
      </button>
      <button type="button" :disabled="state.logs.length < 100" @click="older">
        {{ t('older') }}
        <ChevronRight :size="16" aria-hidden="true" />
      </button>
      <span class="muted">{{ t('offset') }} {{ offset }}</span>
    </div>
  </div>
</template>
