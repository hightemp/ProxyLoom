<script setup lang="ts">
import { Download, FileDown, FileJson, FileText, PackageOpen, TriangleAlert } from '@lucide/vue'
import { shallowRef } from 'vue'

import type {
  AppRuntimeState,
  FoxyProxyPreviewView,
  NativeImportPreviewView,
} from '../../application/runtime/contracts'
import { PRODUCT } from '../../config/product'
import { formatProxyList } from '../../domain/profiles/proxy-format'
import { t } from '../../i18n/messages'
import { errorText, foxyProxySkipLabel } from '../labels'
import { confirmController } from '../confirm/confirm-controller'
import { runtimeClient } from '../runtime/client'
import FileInput from '../components/FileInput.vue'
import ProxyLineImportPanel from './ProxyLineImportPanel.vue'

const props = defineProps<{
  state: AppRuntimeState
  busy: boolean
}>()
const emit = defineEmits<{
  refresh: []
  status: [message: string, error?: boolean]
}>()

const includeCredentials = shallowRef(true)
const textFormat = shallowRef<'URL' | 'COMPACT'>('URL')
const nativeText = shallowRef('')
const nativePreview = shallowRef<NativeImportPreviewView | null>(null)
const nativeMode = shallowRef<'MERGE' | 'REPLACE'>('MERGE')
const foxyText = shallowRef('')
const foxyPreview = shallowRef<FoxyProxyPreviewView | null>(null)
const selectedFoxy = shallowRef<ReadonlySet<number>>(new Set())
const working = shallowRef(false)

const readFile = async (file: File, target: 'NATIVE' | 'FOXY'): Promise<void> => {
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
  working.value = true
  const result = await runtimeClient.exportNative(includeCredentials.value)
  working.value = false
  if (!result.ok) {
    emit('status', errorText(result.error), true)
    return
  }
  saveFile(result.value.text, result.value.filename, 'application/json')
  emit('status', `${t('exported')} ${result.value.filename}.`)
}

const saveFile = (text: string, filename: string, type: string): void => {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

const exportText = (): void => {
  const filename = `${PRODUCT.slug}-proxies-${new Date().toISOString().slice(0, 10)}.txt`
  saveFile(formatProxyList(props.state.config.profiles, textFormat.value), filename, 'text/plain')
  emit('status', `${t('exported')} ${filename}.`)
}

const previewNative = async (): Promise<void> => {
  working.value = true
  const result = await runtimeClient.previewNative(nativeText.value)
  working.value = false
  if (!result.ok) {
    nativePreview.value = null
    emit('status', errorText(result.error), true)
    return
  }
  nativePreview.value = result.value
}

const applyNative = async (): Promise<void> => {
  const replaceConfirmed =
    nativeMode.value === 'MERGE' ||
    (await confirmController.destructive(
      {
        confirmLabel: t('replace'),
        message: t('replaceImportWarning'),
        title: t('replaceImportTitle'),
      },
      props.state.config.general.confirmDangerousActions,
    ))
  if (!replaceConfirmed) return
  working.value = true
  const result = await runtimeClient.applyNativeImport(
    nativeText.value,
    nativeMode.value,
    replaceConfirmed,
  )
  working.value = false
  if (!result.ok) {
    emit('status', errorText(result.error), true)
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
    emit('status', errorText(result.error), true)
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
    emit('status', errorText(result.error), true)
    return
  }
  emit('status', t('foxyProxyProfilesImported'))
  emit('refresh')
}
</script>

<template>
  <div class="stack">
    <h2 class="group-title">
      {{ t('exportGroup') }}
    </h2>
    <div class="io-grid">
      <article class="surface card stack">
        <div class="card-heading">
          <Download :size="20" aria-hidden="true" />
          <div>
            <h3>{{ t('nativeExport') }}</h3>
            <p>{{ t('nativeExportDescription') }}</p>
          </div>
        </div>
        <label class="check-row">
          <input v-model="includeCredentials" type="checkbox" />
          <span>
            <strong>{{ t('includeProxyCredentials') }}</strong>
            <small>{{ t('includeProxyCredentialsDescription') }}</small>
          </span>
        </label>
        <p v-if="includeCredentials" class="notice warning">
          <TriangleAlert :size="16" aria-hidden="true" />
          {{ t('credentialExportWarning') }}
        </p>
        <button class="primary" type="button" :disabled="busy || working" @click="downloadExport">
          <Download :size="16" aria-hidden="true" />
          {{ t('downloadJsonExport') }}
        </button>
      </article>

      <article class="surface card stack">
        <div class="card-heading">
          <FileText :size="20" aria-hidden="true" />
          <div>
            <h3>{{ t('textExport') }}</h3>
            <p>{{ t('textExportDescription') }}</p>
          </div>
        </div>
        <label>
          {{ t('textExportFormat') }}
          <select v-model="textFormat" name="text-export-format">
            <option value="URL">{{ t('copyAsUrl') }}</option>
            <option value="COMPACT">{{ t('copyAsCompact') }}</option>
          </select>
        </label>
        <button type="button" :disabled="state.config.profiles.length === 0" @click="exportText">
          <FileDown :size="16" aria-hidden="true" />
          {{ t('exportProxiesAsText') }}
        </button>
      </article>
    </div>

    <h2 class="group-title">
      {{ t('importGroup') }}
    </h2>
    <ProxyLineImportPanel
      :state="state"
      :busy="busy"
      @status="(message, error) => emit('status', message, error)"
      @refresh="emit('refresh')"
    />
    <div class="io-grid">
      <article class="surface card stack">
        <div class="card-heading">
          <FileJson :size="20" aria-hidden="true" />
          <div>
            <h3>{{ t('nativeImport') }}</h3>
            <p>{{ t('nativeImportDescription') }}</p>
          </div>
        </div>
        <FileInput
          accept="application/json,.json"
          name="native-json-file"
          :label="t('nativeJsonFile')"
          @file="(file) => void readFile(file, 'NATIVE')"
        />
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
        <div class="card-heading">
          <PackageOpen :size="20" aria-hidden="true" />
          <div>
            <h3>{{ t('foxyProxyImport') }}</h3>
            <p>{{ t('foxyProxyImportDescription') }}</p>
          </div>
        </div>
        <FileInput
          accept="application/json,.json"
          name="foxyproxy-json-file"
          :label="t('foxyProxyJsonFile')"
          @file="(file) => void readFile(file, 'FOXY')"
        />
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
              @change="
                toggleFoxy(candidate.sourceIndex, ($event.target as HTMLInputElement).checked)
              "
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
              {{ foxyProxySkipLabel(entry.reason) }}
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
  </div>
</template>

<style scoped>
.group-title {
  margin-top: var(--space-2);
}

.io-grid {
  display: grid;
  gap: var(--space-4);
  grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
  align-items: start;
}
</style>
