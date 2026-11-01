import {
  CircleHelp,
  Clock,
  Download,
  Gauge,
  ListOrdered,
  Palette,
  ScrollText,
  Server,
  ShieldCheck,
  Wrench,
} from '@lucide/vue'
import type { Component } from 'vue'

import type { MessageKey } from '../../i18n/messages'

export type HelpArticleId =
  | 'modes'
  | 'proxies'
  | 'import'
  | 'check'
  | 'rules'
  | 'once'
  | 'logs'
  | 'limits'
  | 'troubleshooting'
  | 'appearance'

export interface HelpArticle {
  readonly id: HelpArticleId
  readonly icon: Component
  readonly title: MessageKey
  readonly body: readonly MessageKey[]
}

/** Help content; every string is a locale message so the guide stays translatable. */
export const HELP_ARTICLES: readonly HelpArticle[] = [
  {
    body: ['helpModesBody1', 'helpModesBody2', 'helpModesBody3'],
    icon: Gauge,
    id: 'modes',
    title: 'helpModesTitle',
  },
  {
    body: ['helpProxiesBody1', 'helpProxiesBody2', 'helpProxiesBody3'],
    icon: Server,
    id: 'proxies',
    title: 'helpProxiesTitle',
  },
  {
    body: ['helpImportBody1', 'helpImportBody2', 'helpImportBody3'],
    icon: Download,
    id: 'import',
    title: 'helpImportTitle',
  },
  {
    body: ['helpCheckBody1', 'helpCheckBody2'],
    icon: CircleHelp,
    id: 'check',
    title: 'helpCheckTitle',
  },
  {
    body: ['helpRulesBody1', 'helpRulesBody2', 'helpRulesBody3'],
    icon: ListOrdered,
    id: 'rules',
    title: 'helpRulesTitle',
  },
  {
    body: ['helpOnceBody1', 'helpOnceBody2', 'helpOnceBody3'],
    icon: Clock,
    id: 'once',
    title: 'helpOnceTitle',
  },
  {
    body: ['helpLogsBody1', 'helpLogsBody2'],
    icon: ScrollText,
    id: 'logs',
    title: 'helpLogsTitle',
  },
  {
    body: ['helpLimitsBody1', 'helpLimitsBody2'],
    icon: ShieldCheck,
    id: 'limits',
    title: 'helpLimitsTitle',
  },
  {
    body: ['helpTroubleBody1', 'helpTroubleBody2', 'helpTroubleBody3'],
    icon: Wrench,
    id: 'troubleshooting',
    title: 'helpTroubleTitle',
  },
  { body: ['helpAppearanceBody1'], icon: Palette, id: 'appearance', title: 'helpAppearanceTitle' },
]

export const isHelpArticleId = (value: string): value is HelpArticleId =>
  HELP_ARTICLES.some((article) => article.id === value)
