<script setup lang="ts">
import { computed, shallowRef, useId } from 'vue'

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
import Disclosure from '../components/Disclosure.vue'
import FileInput from '../components/FileInput.vue'
import HelpTip from '../components/HelpTip.vue'

const props = defineProps<{
  state: AppRuntimeState
  busy: boolean
  /** Inside a modal the dialog provides the title and frame. */
  embedded?: boolean
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
const linesId = useId()
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

const loadFile = async (file: File): Promise<void> => {
  fileError.value = ''
  if (file.size > MAX_IMPORT_TEXT_LENGTH) {
    fileError.value = errorText({ code: 'INPUT_TOO_LARGE' })
    return
  }
  text.value = await file.text()
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
  <section
    class="stack proxy-import"
    :class="{ 'surface card': !embedded }"
    :aria-label="t('importFromText')"
  >
    <div class="panel-intro">
      <h3 v-if="!embedded">
        {{ t('importFromText') }}
      </h3>
      <p>{{ t('importFromTextDescription') }}</p>
    </div>

    <div class="field">
      <span class="field-label">
        <label :for="linesId">{{ t('proxyLines') }}</label>
        <HelpTip :text="t('tipImportFormats')" article="import" />
      </span>
      <textarea
        :id="linesId"
        v-model="text"
        rows="7"
        spellcheck="false"
        autocomplete="off"
        :placeholder="FORMAT_EXAMPLES.slice(0, 3).join('\n')"
      />
    </div>
    <FileInput
      accept=".txt,.csv,text/plain,text/csv"
      :label="t('loadFile')"
      @file="(file) => void loadFile(file)"
    />

    <div class="form-grid">
      <label>
        {{ t('defaultTransport') }}
        <select v-model="defaultTransport" name="default-transport">
          <option value="HTTP">{{ t('proxyInfoHttp') }}</option>
          <option value="HTTPS">{{ t('proxyInfoHttps') }}</option>
          <option value="SOCKS5">{{ t('transportSocks5') }}</option>
        </select>
      </label>
      <label>
        {{ t('fieldOrder') }}
        <select v-model="fieldOrder" name="field-order">
          <option value="HOST_FIRST">{{ t('hostFirstOrder') }}</option>
          <option value="CREDENTIALS_FIRST">{{ t('credentialsFirstOrder') }}</option>
        </select>
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

    <Disclosure :title="t('supportedFormats')">
      <ul class="format-list">
        <li v-for="example in FORMAT_EXAMPLES" :key="example">
          <code>{{ example }}</code>
        </li>
      </ul>
    </Disclosure>
  </section>
</template>

<style scoped>
textarea {
  font-family: var(--font-mono);
  font-size: 13px;
}

.panel-intro {
  display: grid;
  gap: 4px;
}

.panel-intro p {
  color: var(--color-muted);
}

.format-list {
  display: grid;
  gap: 4px;
  margin: 0;
  padding-left: 18px;
}
</style>
