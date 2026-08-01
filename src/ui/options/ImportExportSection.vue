<script setup lang="ts">
import { shallowRef } from 'vue'

import type {
  AppRuntimeState,
  FoxyProxyPreviewView,
  NativeImportPreviewView,
} from '../../application/runtime/contracts'
import { t } from '../../i18n/messages'
import { runtimeClient } from '../runtime/client'

defineProps<{
  state: AppRuntimeState
  busy: boolean
}>()
const emit = defineEmits<{
  refresh: []
  status: [message: string, error?: boolean]
}>()

const includeCredentials = shallowRef(false)
const nativeText = shallowRef('')
const nativePreview = shallowRef<NativeImportPreviewView | null>(null)
const nativeMode = shallowRef<'MERGE' | 'REPLACE'>('MERGE')
const foxyText = shallowRef('')
const foxyPreview = shallowRef<FoxyProxyPreviewView | null>(null)
const selectedFoxy = shallowRef<ReadonlySet<number>>(new Set())
const working = shallowRef(false)

const readFile = async (event: Event, target: 'NATIVE' | 'FOXY'): Promise<void> => {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file === undefined) return
  const text = await file.text()
  if (target === 'NATIVE') {
    nativeText.value = text
    nativePreview.value = null
  } else {
    foxyText.value = text
    foxyPreview.value = null
  }
}

const downloadExport = async (): Promise<void> => {
  if (includeCredentials.value && !window.confirm(t('credentialExportWarning'))) {
    return
  }
  working.value = true
  const result = await runtimeClient.exportNative(includeCredentials.value)
  working.value = false
  if (!result.ok) {
    emit('status', result.error.message, true)
    return
  }
  const blob = new Blob([result.value.text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = result.value.filename
  anchor.click()
  URL.revokeObjectURL(url)
  emit('status', `${t('exported')} ${result.value.filename}.`)
}

const previewNative = async (): Promise<void> => {
  working.value = true
  const result = await runtimeClient.previewNative(nativeText.value)
  working.value = false
  if (!result.ok) {
    nativePreview.value = null
    emit('status', `${result.error.code}: ${result.error.message}`, true)
    return
  }
  nativePreview.value = result.value
}

const applyNative = async (): Promise<void> => {
  const replaceConfirmed = nativeMode.value === 'MERGE' || window.confirm(t('replaceImportWarning'))
  if (!replaceConfirmed) return
  working.value = true
  const result = await runtimeClient.applyNativeImport(
    nativeText.value,
    nativeMode.value,
    replaceConfirmed,
  )
  working.value = false
  if (!result.ok) {
    emit('status', `${result.error.code}: ${result.error.message}`, true)
    return
  }
  emit('status', t('nativeImportCommitted'))
  emit('refresh')
}

const previewFoxy = async (): Promise<void> => {
  working.value = true
  const result = await runtimeClient.previewFoxyProxy(foxyText.value)
  working.value = false
  if (!result.ok) {
    foxyPreview.value = null
    emit('status', `${result.error.code}: ${result.error.message}`, true)
    return
  }
  foxyPreview.value = result.value
  selectedFoxy.value = new Set(result.value.candidates.map(({ sourceIndex }) => sourceIndex))
}

const toggleFoxy = (sourceIndex: number, selected: boolean): void => {
  const next = new Set(selectedFoxy.value)
  if (selected) next.add(sourceIndex)
  else next.delete(sourceIndex)
  selectedFoxy.value = next
}

const applyFoxy = async (): Promise<void> => {
  working.value = true
  const result = await runtimeClient.applyFoxyProxyImport(foxyText.value, [...selectedFoxy.value])
  working.value = false
  if (!result.ok) {
    emit('status', `${result.error.code}: ${result.error.message}`, true)
    return
  }
  emit('status', t('foxyProxyProfilesImported'))
  emit('refresh')
}
</script>

<template>
  <div class="stack">
    <article class="surface card stack">
      <div>
        <p class="eyebrow">
          {{ t('portableBackup') }}
        </p>
        <h2>{{ t('nativeExport') }}</h2>
        <p>{{ t('nativeExportDescription') }}</p>
      </div>
      <label class="check-row">
        <input v-model="includeCredentials" type="checkbox" />
        <span>
          <strong>{{ t('includeProxyCredentials') }}</strong>
          <small>{{ t('includeProxyCredentialsDescription') }}</small>
        </span>
      </label>
      <button class="primary" type="button" :disabled="busy || working" @click="downloadExport">
        {{ t('downloadJsonExport') }}
      </button>
    </article>

    <article class="surface card stack">
      <div>
        <p class="eyebrow">
          {{ t('validatedAtomic') }}
        </p>
        <h2>{{ t('nativeImport') }}</h2>
        <p>{{ t('nativeImportDescription') }}</p>
      </div>
      <label>
        {{ t('nativeJsonFile') }}
        <input type="file" accept="application/json,.json" @change="readFile($event, 'NATIVE')" />
      </label>
      <button type="button" :disabled="nativeText === '' || working" @click="previewNative">
        {{ t('validatePreview') }}
      </button>
      <div v-if="nativePreview" class="preview-box">
        <strong>
          {{ nativePreview.profiles }} {{ t('profilesCountLabel') }} · {{ nativePreview.rules }}
          {{ t('rulesCountLabel') }}
        </strong>
        <p>
          {{ t('credentials') }}
          {{ nativePreview.includesCredentials ? t('presentInFile') : t('notPresent') }}
        </p>
        <ul>
          <li v-for="warning in nativePreview.warnings" :key="warning">
            {{ warning }}
          </li>
        </ul>
        <fieldset class="segmented compact">
          <legend>{{ t('importStrategy') }}</legend>
          <button
            type="button"
            :aria-pressed="nativeMode === 'MERGE'"
            @click="nativeMode = 'MERGE'"
          >
            {{ t('merge') }}
          </button>
          <button
            type="button"
            :aria-pressed="nativeMode === 'REPLACE'"
            @click="nativeMode = 'REPLACE'"
          >
            {{ t('replace') }}
          </button>
        </fieldset>
        <button class="primary" type="button" :disabled="working" @click="applyNative">
          {{ t('apply') }} {{ nativeMode === 'MERGE' ? t('merge') : t('replace') }}
        </button>
      </div>
    </article>

    <article class="surface card stack">
      <div>
        <p class="eyebrow">
          {{ t('profilesOnly') }}
        </p>
        <h2>{{ t('foxyProxyImport') }}</h2>
        <p>{{ t('foxyProxyImportDescription') }}</p>
      </div>
      <label>
        {{ t('foxyProxyJsonFile') }}
        <input type="file" accept="application/json,.json" @change="readFile($event, 'FOXY')" />
      </label>
      <button type="button" :disabled="foxyText === '' || working" @click="previewFoxy">
        {{ t('parsePreview') }}
      </button>
      <div v-if="foxyPreview" class="preview-box stack">
        <strong>{{ t('detected') }} {{ foxyPreview.adapter }}</strong>
        <label
          v-for="candidate in foxyPreview.candidates"
          :key="candidate.sourceIndex"
          class="check-row candidate-row"
        >
          <input
            type="checkbox"
            :checked="selectedFoxy.has(candidate.sourceIndex)"
            @change="toggleFoxy(candidate.sourceIndex, ($event.target as HTMLInputElement).checked)"
          />
          <span>
            <strong>{{ candidate.title }}</strong>
            <small>
              {{ candidate.transport }} {{ candidate.hostname }}:{{ candidate.port }}
              {{ candidate.hasCredentials ? `· ${t('credentialsPresent')}` : '' }}
            </small>
          </span>
        </label>
        <ul v-if="foxyPreview.skipped.length > 0">
          <li v-for="entry in foxyPreview.skipped" :key="entry.sourceIndex">
            {{ t('skipped') }} {{ entry.title || `${t('entry')} ${entry.sourceIndex + 1}` }}:
            {{ entry.reason.replaceAll('_', ' ') }}
          </li>
        </ul>
        <button
          class="primary"
          type="button"
          :disabled="working || selectedFoxy.size === 0"
          @click="applyFoxy"
        >
          {{ t('importSelectedProfiles') }}
        </button>
      </div>
    </article>
  </div>
</template>
