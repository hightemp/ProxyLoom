import { browser } from 'wxt/browser'

import type { LogQuery } from '../../application/logging/log-types'
import type {
  AppRuntimeState,
  ErrorContextResponse,
  FoxyProxyPreviewView,
  NativeImportPreviewView,
  RuntimeRequest,
  RuntimeResponse,
} from '../../application/runtime/contracts'

const send = async <T>(request: RuntimeRequest): Promise<RuntimeResponse<T>> =>
  browser.runtime.sendMessage(request)

export const runtimeClient = {
  applyFoxyProxyImport: (text: string, selectedSourceIndexes: readonly number[]) =>
    send<AppRuntimeState>({
      selectedSourceIndexes,
      text,
      type: 'APPLY_FOXYPROXY_IMPORT',
    }),
  applyNativeImport: (text: string, mode: 'MERGE' | 'REPLACE', replaceConfirmed: boolean) =>
    send<AppRuntimeState>({
      mode,
      replaceConfirmed,
      text,
      type: 'APPLY_NATIVE_IMPORT',
    }),
  clearLogs: (includePrivate = true) => send<null>({ includePrivate, type: 'CLEAR_LOGS' }),
  command: <T = AppRuntimeState>(request: RuntimeRequest) => send<T>(request),
  errorContext: (token: string): Promise<ErrorContextResponse> =>
    send({ token, type: 'GET_ERROR_CONTEXT' }),
  exportNative: (includeCredentials: boolean) =>
    send<{ filename: string; text: string }>({
      includeCredentials,
      type: 'EXPORT_NATIVE',
    }),
  getState: (logQuery?: LogQuery, tabId?: number) =>
    send<AppRuntimeState>({
      ...(logQuery === undefined ? {} : { logQuery }),
      ...(tabId === undefined ? {} : { tabId }),
      type: 'GET_STATE',
    }),
  previewFoxyProxy: (text: string) =>
    send<FoxyProxyPreviewView>({
      text,
      type: 'PREVIEW_FOXYPROXY_IMPORT',
    }),
  previewNative: (text: string) =>
    send<NativeImportPreviewView>({
      text,
      type: 'PREVIEW_NATIVE_IMPORT',
    }),
}
