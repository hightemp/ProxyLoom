<script setup lang="ts">
import { Clock, EyeOff, Info, Pencil, Pin, Trash2 } from '@lucide/vue'
import { computed, nextTick, shallowRef } from 'vue'

import { previewOverrideForHostname } from '../../application/overrides/override-service'
import type { AppRuntimeState, RuntimeRequest } from '../../application/runtime/contracts'
import { asProxyProfileId } from '../../domain/types/brand'
import type { OverrideScope, RuleAction, TemporaryOverride } from '../../domain/types/entities'
import { t } from '../../i18n/messages'
import { confirmController } from '../confirm/confirm-controller'
import IconButton from '../components/IconButton.vue'
import Modal from '../components/Modal.vue'
import { decisionActionLabel, errorText } from '../labels'

const props = defineProps<{
  state: AppRuntimeState
  busy: boolean
}>()
const emit = defineEmits<{
  command: [request: RuntimeRequest]
}>()

const PROFILE_PREFIX = 'PROFILE:'
type RouteValue = 'DIRECT' | `PROFILE:${string}`

const editingId = shallowRef<string | null>(null)
const draftScope = shallowRef<OverrideScope>('EXACT_HOSTNAME')
const draftRoute = shallowRef<RouteValue>('DIRECT')
const editorScope = shallowRef<HTMLSelectElement | null>(null)
let editorActivator: HTMLElement | null = null

const overrides = computed(() =>
  [...props.state.overrides].sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
)
const editing = computed(
  () => overrides.value.find((override) => override.id === editingId.value) ?? null,
)
const preview = computed(() =>
  editing.value === null
    ? null
    : previewOverrideForHostname(
        editing.value.sourceHostname,
        draftScope.value,
        props.state.diagnostics.platform,
      ),
)

const routeValue = (action: RuleAction): RouteValue =>
  action.type === 'PROXY' && action.targetProxyProfileId !== null
    ? `${PROFILE_PREFIX}${action.targetProxyProfileId}`
    : 'DIRECT'

const routeLabel = (action: RuleAction): string => {
  if (action.type !== 'PROXY') return decisionActionLabel('DIRECT')
  const profile = props.state.config.profiles.find(
    (candidate) => candidate.id === action.targetProxyProfileId,
  )
  return profile === undefined
    ? t('missingProfile')
    : `${profile.name} (${profile.shortName ?? profile.generatedShortName})`
}

const scopeLabel = (scope: OverrideScope): string =>
  scope === 'EXACT_HOSTNAME' ? t('exactHostname') : t('domainSubdomains')

const appliesToLabel = (override: TemporaryOverride): string =>
  override.platformScope === 'TAB' ? t('overrideThisTab') : t('overrideAllTabsOnSite')

const closeEditor = (): void => {
  editingId.value = null
  const activator = editorActivator
  editorActivator = null
  void nextTick(() => {
    if (activator?.isConnected === true) activator.focus()
  })
}

const edit = (override: TemporaryOverride, event: Event): void => {
  editorActivator = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  editingId.value = override.id
  draftScope.value = override.scope
  draftRoute.value = routeValue(override.action)
  void nextTick(() => editorScope.value?.focus())
}

const save = (): void => {
  const override = editing.value
  if (override === null || preview.value?.ok !== true) return
  const action: RuleAction =
    draftRoute.value === 'DIRECT'
      ? { targetProxyProfileId: null, type: 'DIRECT' }
      : {
          targetProxyProfileId: asProxyProfileId(draftRoute.value.slice(PROFILE_PREFIX.length)),
          type: 'PROXY',
        }
  emit('command', {
    action,
    overrideId: override.id,
    scope: draftScope.value,
    type: 'UPDATE_OVERRIDE',
  })
  closeEditor()
}

const promote = async (override: TemporaryOverride): Promise<void> => {
  const confirmed = await confirmController.request({
    code: override.generatedPattern,
    confirmLabel: t('makePermanent'),
    details: [`${t('route')}: ${routeLabel(override.action)}`],
    message: t('makePermanentMessage'),
    title: t('makePermanentTitle'),
  })
  if (confirmed) emit('command', { overrideId: override.id, type: 'PROMOTE_OVERRIDE' })
}

const clearAll = async (): Promise<void> => {
  const confirmed = await confirmController.destructive(
    {
      confirmLabel: t('clearAllOverrides'),
      message: t('clearOverridesMessage'),
      title: t('clearOverridesTitle'),
    },
    props.state.config.general.confirmDangerousActions,
  )
  if (confirmed) emit('command', { type: 'CLEAR_OVERRIDES' })
}
</script>

<template>
  <div class="stack">
    <div class="section-heading">
      <div>
        <h2>{{ t('overridesTitle') }}</h2>
        <p>{{ t('overridesDescription') }}</p>
      </div>
      <button
        v-if="overrides.length > 0"
        class="danger-text"
        type="button"
        :disabled="busy"
        @click="void clearAll()"
      >
        <Trash2 :size="16" aria-hidden="true" />
        {{ t('clearAllOverrides') }}
      </button>
    </div>

    <p class="notice">
      <EyeOff :size="16" aria-hidden="true" />
      {{ t('privateOverridesNote') }}
    </p>

    <div v-if="overrides.length === 0" class="surface empty-state">
      <Clock :size="28" aria-hidden="true" />
      <p>{{ t('noOverrides') }}</p>
    </div>

    <div v-else class="log-table-wrap surface">
      <table>
        <caption class="sr-only">
          {{
            t('overridesTitle')
          }}
        </caption>
        <thead>
          <tr>
            <th scope="col">
              {{ t('overrideSite') }}
            </th>
            <th scope="col">
              {{ t('scope') }}
            </th>
            <th scope="col">
              {{ t('route') }}
            </th>
            <th scope="col">
              {{ t('overrideAppliesTo') }}
            </th>
            <th scope="col">
              {{ t('overrideSourceTab') }}
            </th>
            <th scope="col">
              {{ t('overrideCreated') }}
            </th>
            <th scope="col">
              {{ t('overrideActions') }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="override in overrides" :key="override.id">
            <th scope="row" class="site-cell">
              <code class="truncate" :title="override.originKey">{{ override.originKey }}</code>
            </th>
            <td>{{ scopeLabel(override.scope) }}</td>
            <td>{{ routeLabel(override.action) }}</td>
            <td>
              <span class="applies">
                {{ appliesToLabel(override) }}
                <span
                  v-if="override.platformScope === 'ORIGIN'"
                  class="hint-icon"
                  :title="t('temporaryOverrideWarning')"
                >
                  <Info :size="14" aria-hidden="true" />
                  <span class="sr-only">{{ t('temporaryOverrideWarning') }}</span>
                </span>
              </span>
            </td>
            <td class="muted">
              {{ t('tabNumber', String(override.sourceTabId)) }}
            </td>
            <td>
              <time :datetime="override.createdAt">
                {{ new Date(override.createdAt).toLocaleString() }}
              </time>
            </td>
            <td>
              <div class="row-actions">
                <IconButton
                  :icon="Pencil"
                  size="small"
                  :label="t('editOverrideFor', override.originKey)"
                  :disabled="busy"
                  @click="edit(override, $event)"
                />
                <IconButton
                  :icon="Pin"
                  size="small"
                  :label="t('makePermanentFor', override.originKey)"
                  :disabled="busy"
                  @click="void promote(override)"
                />
                <IconButton
                  :icon="Trash2"
                  size="small"
                  variant="danger-text"
                  :label="t('removeOverrideFor', override.originKey)"
                  :disabled="busy"
                  @click="emit('command', { overrideId: override.id, type: 'REMOVE_OVERRIDE' })"
                />
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <Modal
      :open="editing !== null"
      :title="editing ? t('editOverrideFor', editing.originKey) : ''"
      @close="closeEditor"
    >
      <form v-if="editing" id="override-form" class="stack override-editor" @submit.prevent="save">
        <div class="form-grid">
          <label>
            {{ t('scope') }}
            <select ref="editorScope" v-model="draftScope" name="override-scope">
              <option value="EXACT_HOSTNAME">{{ t('exactHostname') }}</option>
              <option value="REGISTRABLE_DOMAIN">{{ t('domainSubdomains') }}</option>
            </select>
          </label>
          <label>
            {{ t('route') }}
            <select v-model="draftRoute" name="override-route">
              <option value="DIRECT">{{ decisionActionLabel('DIRECT') }}</option>
              <option
                v-for="profile in state.config.profiles"
                :key="profile.id"
                :value="`${PROFILE_PREFIX}${profile.id}`"
              >
                {{ profile.name }} ({{ profile.shortName ?? profile.generatedShortName }})
              </option>
            </select>
          </label>
        </div>
        <div class="override-preview" aria-live="polite">
          <template v-if="preview?.ok">
            <span class="field-label">{{ t('generatedPattern') }}</span>
            <code>{{ preview.value.generatedPattern }}</code>
          </template>
          <span v-else-if="preview" class="notice danger">{{ errorText(preview.error) }}</span>
        </div>
      </form>
      <template #footer>
        <button type="button" @click="closeEditor">
          {{ t('cancel') }}
        </button>
        <button
          class="primary"
          type="submit"
          form="override-form"
          :disabled="busy || preview?.ok !== true"
        >
          {{ t('saveOverride') }}
        </button>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.site-cell {
  max-width: 240px;
}

.site-cell code {
  display: block;
  white-space: nowrap;
}

.applies {
  display: inline-flex;
  gap: 6px;
  align-items: center;
}

.hint-icon {
  display: inline-flex;
  color: var(--color-muted);
  cursor: help;
}

td.muted {
  white-space: nowrap;
}

.override-preview {
  display: grid;
  gap: 6px;
  padding: var(--space-3);
  border-radius: var(--radius);
  background: var(--color-surface-2);
}

.override-preview code {
  word-break: break-all;
}

.field-label {
  color: var(--color-muted);
  font-size: 12.5px;
  font-weight: 550;
}
</style>
