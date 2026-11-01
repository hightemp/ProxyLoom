<script setup lang="ts">
import { computed, shallowRef } from 'vue'

import {
  MAX_IMPORT_TEXT_LENGTH,
  previewProxyLines,
  type ProxyFieldOrder,
  type ProxyImportLineView,
} from '../../application/profiles/proxy-line-import'
import type { AppRuntimeState } from '../../application/runtime/contracts'
import type { ProxyTransport } from '../../domain/types/entities'
import { t } from '../../i18n/messages'
import { errorText, importStatusLabel, proxyStringErrorLabel } from '../labels'
import { runtimeClient } from '../runtime/client'

const props = defineProps<{
  state: AppRuntimeState
  busy: boolean
}>()
const emit = defineEmits<{
  status: [message: string, error?: boolean]
  refresh: []
}>()

const FORMAT_EXAMPLES = [
  'http://user:pass@192.0.2.10:8080',
  'https://proxy.example:8443',
  '192.0.2.10:8080',
  'user:pass@proxy.example:3128',
  '192.0.2.10:8080:user:pass',
  'user:pass:192.0.2.10:8080',
  'https 192.0.2.10:8080',
  '192.0.2.10 8080 user pass http',
  '192.0.2.10,8080,user,pass,https',
  '[2001:db8::10]:8080',
] as const

const text = shallowRef('')
const defaultTransport = shallowRef<ProxyTransport>('HTTP')
const fieldOrder = shallowRef<ProxyFieldOrder>('HOST_FIRST')
const fileError = shallowRef('')
const working = shallowRef(false)

const preview = computed(() =>
  previewProxyLines(
    text.value,
    { defaultTransport: defaultTransport.value, fieldOrder: fieldOrder.value },
    props.state.config,
  ),
)
const importableCount = computed(() =>
  preview.value.ok
    ? preview.value.value.lines.filter((line) => line.status === 'NEW' || line.status === 'UPDATE')
        .length
    : 0,
)

const proxyText = (line: ProxyImportLineView): string =>
  line.host === null ? '' : `${line.transport ?? ''} ${line.host}:${line.port ?? ''}`.trim()

const note = (line: ProxyImportLineView): string => {
  if (line.errorCode !== null) return proxyStringErrorLabel(line.errorCode)
  const parts: string[] = []
  if (line.ambiguous) parts.push(t('ambiguousLine'))
  if (line.existingProfileId !== null) {
    const profile = props.state.config.profiles.find(
      (candidate) => candidate.id === line.existingProfileId,
    )
    if (profile !== undefined) parts.push(t('updatesProfile', profile.name))
  }
  return parts.join(' · ')
}

const loadFile = async (event: Event): Promise<void> => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  fileError.value = ''
  if (file === undefined) return
  if (file.size > MAX_IMPORT_TEXT_LENGTH) {
    fileError.value = errorText({ code: 'INPUT_TOO_LARGE' })
    input.value = ''
    return
  }
  text.value = await file.text()
  input.value = ''
}

const runImport = async (): Promise<void> => {
  working.value = true
  const result = await runtimeClient.applyProxyLines(text.value, {
    defaultTransport: defaultTransport.value,
    fieldOrder: fieldOrder.value,
  })
  working.value = false
  if (!result.ok) {
    emit('status', errorText(result.error), true)
    return
  }
  const { created, skipped, updated } = result.value
  emit('status', t('proxyImportResult', [String(created), String(updated), String(skipped)]))
  text.value = ''
  emit('refresh')
}
</script>

<template>
  <section class="surface card stack proxy-import" :aria-label="t('importFromText')">
    <div>
      <h3>{{ t('importFromText') }}</h3>
      <p>{{ t('importFromTextDescription') }}</p>
    </div>

    <label>
      {{ t('proxyLines') }}
      <textarea v-model="text" rows="6" spellcheck="false" autocomplete="off" />
    </label>

    <div class="form-grid">
      <label>
        {{ t('defaultTransport') }}
        <select v-model="defaultTransport" name="default-transport">
          <option value="HTTP">{{ t('proxyInfoHttp') }}</option>
          <option value="HTTPS">{{ t('proxyInfoHttps') }}</option>
        </select>
      </label>
      <label>
        {{ t('fieldOrder') }}
        <select v-model="fieldOrder" name="field-order">
          <option value="HOST_FIRST">{{ t('hostFirstOrder') }}</option>
          <option value="CREDENTIALS_FIRST">{{ t('credentialsFirstOrder') }}</option>
        </select>
      </label>
      <label>
        {{ t('loadFile') }}
        <input type="file" accept=".txt,.csv,text/plain,text/csv" @change="void loadFile($event)" />
      </label>
    </div>
    <p v-if="fileError" class="notice danger" role="alert">
      {{ fileError }}
    </p>

    <p v-if="!preview.ok" class="notice danger" role="alert">
      {{ errorText(preview.error) }}
    </p>
    <template v-else-if="preview.value.lines.length > 0">
      <p v-if="preview.value.droppedCount > 0" class="notice">
        {{ t('droppedLines', String(preview.value.droppedCount)) }}
      </p>
      <div class="log-table-wrap">
        <table>
          <caption class="sr-only">
            {{
              t('importFromText')
            }}
          </caption>
          <thead>
            <tr>
              <th scope="col">
                {{ t('importLine') }}
              </th>
              <th scope="col">
                {{ t('status') }}
              </th>
              <th scope="col">
                {{ t('importProxy') }}
              </th>
              <th scope="col">
                {{ t('username') }}
              </th>
              <th scope="col">
                {{ t('importNote') }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="line in preview.value.lines" :key="line.lineNumber">
              <td>{{ line.lineNumber }}</td>
              <td>
                <span
                  class="status-pill"
                  :class="{
                    danger: line.status === 'ERROR',
                    success: line.status === 'NEW' || line.status === 'UPDATE',
                  }"
                >
                  {{ importStatusLabel(line.status) }}
                </span>
              </td>
              <td>
                <code>{{ proxyText(line) }}</code>
              </td>
              <td>{{ line.username ?? '' }}</td>
              <td>{{ note(line) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <div class="button-row">
      <button
        class="primary"
        type="button"
        :disabled="busy || working || importableCount === 0"
        @click="void runImport()"
      >
        {{ t('importProxies', String(importableCount)) }}
      </button>
    </div>

    <details>
      <summary>{{ t('supportedFormats') }}</summary>
      <ul class="format-list">
        <li v-for="example in FORMAT_EXAMPLES" :key="example">
          <code>{{ example }}</code>
        </li>
      </ul>
    </details>
  </section>
</template>

<style scoped>
textarea {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.format-list {
  display: grid;
  gap: 4px;
  margin: 8px 0 0;
  padding-left: 18px;
}
</style>
