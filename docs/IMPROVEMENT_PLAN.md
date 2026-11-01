# План улучшений и исправлений ProxyLoom

Дата: 2026-11-01. Базовая версия: `0.1.4` (schema config v3).

Документ фиксирует план следующей итерации: управление Once-оверрайдами, импорт прокси из строк,
копирование профилей в URL/curl, поддержку SOCKS5, новую иконку, доработку UI и найденные по ходу
аудита исправления. Каждый пункт оформлен задачей `PL-133…PL-150` в `TASKS.md`; правила
выполнения — `AGENTS.md`.

## 1. Состояние на старте

- `pnpm typecheck`, `pnpm lint`, `pnpm test:unit` (41 файл, 255 тестов) зелёные.
- Незакрытые release-задачи: PL-107, PL-108, PL-112, PL-115, PL-116, PL-121…PL-124 (CI, stores,
  manual matrices), PL-130/PL-131 (ждут manual regression Яндекс 26). План их не дублирует, но
  новые задачи не должны ломать их evidence.
- Once-оверрайды (`TemporaryOverride`, `session.overrides`) создаются из popup, но:
  - нет ни одного экрана со списком активных оверрайдов;
  - runtime-команда `REMOVE_OVERRIDE` существует, но UI её не вызывает;
  - изменить action/profile/scope нельзя — только ждать закрытия вкладки;
  - `TemporaryOverride` не хранит исходный hostname, поэтому смена scope
    `Domain → Exact hostname` невозможна без расширения session-модели.
- Профиль поддерживает только транспорты `HTTP`/`HTTPS` и два endpoint (HTTP target / HTTPS
  target, `useSameProxy`). SOCKS в PRD §5 явно указан как non-goal v1.

## 2. Найденные проблемы (исправления)

| #   | Проблема                                                                                                                                                                                                                                                         | Где                                                                    | Задача        |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------- |
| F1  | `GET_STATE` возвращает **все** session overrides, включая private (`incognito: true`), любой странице расширения. Options page обычного окна получает hostnames из private-сессии — нарушение FR-058/FR-074. Сейчас не видно в UI только потому, что списка нет. | `src/platform/runtime/runtime-controller.ts` (`getState`)              | PL-135        |
| F2  | Popup и options показывают сырые enum-значения: `DIRECT/PROXY/RULES`, `decision.action`, `decision.source`, `inspection.reason.replaceAll('_', ' ')`, ошибки как `${code}: ${message}`. Нарушает FR-012/FR-054 (всё через locale).                               | `entrypoints/popup/App.vue`, `src/ui/options/*`                        | PL-134        |
| F3  | Подтверждения через `window.confirm`: нельзя показать форматированный preview pattern/impact, нет focus management (NFR-008), в popup системный диалог закрывает popup на части платформ, общий setting `confirmDangerousActions` учитывается непоследовательно. | `entrypoints/popup/App.vue`, `ProfilesSection.vue`, `RulesSection.vue` | PL-133        |
| F4  | Once нельзя отменить до закрытия source tab — пользователь, ошибившийся с route, вынужден закрывать вкладку. Противоречит духу FR-005/FR-026 (preview → управляемое состояние).                                                                                  | popup, options                                                         | PL-135…PL-137 |
| F6  | Manual check (Chromium) иногда возвращал `NETWORK_ERROR`: `complete` от начальной `about:blank` засчитывался как загрузка целевой страницы, и `executeScript` падал на `about:blank`. Проявлялось под нагрузкой в полном E2E-прогоне.                            | `src/platform/runtime/targeted-proxy-check.ts`                         | PL-151        |
| F5  | При удалении профиля, на который ссылается Once, оверрайд молча удаляется `removeInvalid` без видимого diagnostic (PRD §20: `Invalid → Cleanup + diagnostic`).                                                                                                   | `override-service.ts`                                                  | PL-135        |

## 3. Once-оверрайды: список, редактирование, popup

### 3.1 Модель и application (PL-135)

- Расширить `TemporaryOverride` полем `sourceHostname` (нормализованный hostname текущей вкладки
  на момент создания). Это session-state, поэтому миграция — версионированный envelope
  `session.overrides` v1 → v2: legacy записи без `sourceHostname` получают `originKey` для scope
  `EXACT_HOSTNAME`, а для `REGISTRABLE_DOMAIN` — `sourceHostname = originKey` (смена на exact
  тогда даст apex-домен; это явно показывается в preview). Malformed/future payload — fail-safe
  очистка, как в PL-129.
- Новые команды (`src/application/runtime/contracts.ts`):
  - Отдельный `LIST_OVERRIDES` не понадобился: каждый ответ с `AppRuntimeState` проходит
    `scopeStateToCaller` — остаются только оверрайды сессии вызывающего (исправление F1), а если
    целевая вкладка из другой сессии, её URL/inspection не отдаются. Сессия определяется по
    `sender.tab.incognito` (options/error page) или по целевой вкладке (popup без sender tab).
  - `UPDATE_OVERRIDE { overrideId, scope?, action? }` — copy → validate → atomic replace; pattern
    и `originKey` пересчитываются тем же `preview()` (единый generator, без копии в UI).
  - `PROMOTE_OVERRIDE { overrideId }` — создаёт permanent Origin Rule на позиции 1 (Once стоит
    выше rules, поэтому позиция 1 сохраняет поведение; `Always` из popup, напротив, добавляет
    правило в конец) и удаляет оверрайд только после успешного commit.
  - `CLEAR_OVERRIDES` — удаляет все оверрайды текущей сессии (destructive → подтверждение).
- `removeInvalid` вызывается при каждом apply (раньше нигде не вызывался — оверрайд на удалённый
  профиль давал configuration error до закрытия вкладки). В About / Diagnostics виден только
  счётчик удалённых — без `originKey`, чтобы не раскрывать hostnames private-сессии.
- Routing: после каждого update/remove — обычный monotonic apply (PAC в Chromium, snapshot в
  Firefox). Инвариант: оверрайд по-прежнему выше rules, `DIRECT` его игнорирует.

### 3.2 Options: раздел «Temporary overrides» (PL-136)

- Новая навигационная секция между `Rules` и `Logs` (ID `overrides`, hash `#overrides`).
- Таблица: origin key, scope, route (`Direct`/profile name + short name, не только цвет), platform
  scope (`This tab` в Firefox / `All tabs on this origin` в Chromium с warning COMPAT-009), source
  tab (`Tab #id`, признак «tab closed — pending cleanup»), created time (relative).
- Действия по строке: `Edit` (scope + route в inline-форме с live preview pattern), `Make
permanent`, `Remove`. Глобально: `Clear all`. Empty state с объяснением, как создать Once.
- Private-оверрайды в options обычного окна не показываются; строка-подсказка «Private-window
  overrides are managed from a private window popup».
- A11y: таблица с caption, кнопки с accessible names, focus возвращается на следующую строку
  после удаления, live region для результата.

### 3.3 Popup: оверрайды текущего сайта (PL-137)

- Под карточкой `Current site` — компактный блок «Active for this site»: оверрайды, совпадающие с
  hostname активной вкладки (и, в Chromium, созданные в других вкладках для того же origin —
  с пометкой «from another tab»).
- Действия: смена route select'ом (сразу `UPDATE_OVERRIDE`), `Remove`, `Make permanent`, ссылка
  `Manage all` → `options.html#overrides`.
- Если для сайта уже есть Once, кнопка `Once` превращается в `Update Once` (вместо создания
  дубля — сейчас `create()` молча заменяет запись с тем же tab/origin).

### 3.4 Встроенные диалоги вместо `window.confirm` (PL-133)

- Общий `ConfirmDialog.vue` на `<dialog>` + composable `useConfirm()` (Promise API), focus trap,
  `Escape`/`Cancel`, возврат фокуса на инициатор, `aria-describedby` для impact.
- Учитывает `general.confirmDangerousActions` в одном месте; non-destructive preview (Once/Always)
  показывается всегда.
- Popup: preview Once/Always — тот же встроенный `ConfirmDialog` внутри документа popup (pattern
  моноширинно, route, warning Chromium); системный диалог больше не закрывает popup.
- Найдено при реализации: `confirmDangerousActions` (FR-013/FR-026) был в schema, но UI его не
  читал и не показывал, а удаление правила шло без подтверждения. Добавлен переключатель
  `Confirm destructive actions` в General; destructive-подтверждения (удаление профиля/правила,
  очистка логов, replace import) учитывают его, privacy disclosures (manual check, credential
  export, Full URL в Chromium, Once/Always preview) показываются всегда.
- Для component tests добавлен `@vitejs/plugin-vue` (та же 6.0.8, что уже приходит через
  `@wxt-dev/module-vue`) в vitest config; `@vue/test-utils` уже был в devDependencies.
- Заменить все вызовы `window.confirm` (popup, Profiles, Rules, Import/Export) и добавить lint-
  запрет `no-restricted-globals: confirm/alert/prompt` для `entrypoints/` и `src/ui/`.

## 4. Импорт прокси из строк

Источник поведения: `proxy_switcher_vpn` — `ProxyStringParser.kt`, `ProxyLineImport.kt`,
`ImportProxyLinesScreen.kt`. Портируется логика, а не код: в ProxyLoom нет network
auto-detection протокола (запрещено privacy-правилами — без явной проверки сеть не трогаем).

### 4.1 Pure parser (PL-138)

`src/domain/profiles/proxy-string.ts`, без browser/DOM зависимостей; typed result
`Success | Ambiguous | Failure(code)`; сообщения об ошибках не содержат ввод/credentials.

Поддерживаемые форматы одной строки:

| Формат                                                             | Пример                                    |
| ------------------------------------------------------------------ | ----------------------------------------- |
| URI                                                                | `http://user:pass@1.2.3.4:8080`           |
| URI без credentials                                                | `https://proxy.example:443`               |
| `host:port`                                                        | `1.2.3.4:8080`                            |
| `user:pass@host:port`                                              | `user:pass@proxy.example:3128`            |
| `host:port:user:pass` / `user:pass:host:port` (ambiguity resolver) | `1.2.3.4:8080:user:pass`                  |
| Протокол токеном до/после                                          | `http 1.2.3.4:8080`, `1.2.3.4:8080 https` |
| Токены через пробел                                                | `1.2.3.4 8080 user pass [http]`           |
| CSV/TSV/`;` (2–5 колонок)                                          | `1.2.3.4,8080,user,pass,https`            |
| IPv6 в скобках (в отличие от Android-версии)                       | `http://[2001:db8::1]:8080`               |
| Пароль с `@` в URI (берётся последний `@`)                         | `http://user:p@ss@proxy.example:8080`     |

Правила:

- `http`/`https` → transport `HTTP`/`HTTPS`; `socks5`/`socks5h` → `SOCKS5` после PL-145, до этого
  `Failure(SOCKS_UNSUPPORTED)`; `socks4`/`socks` → `Failure` всегда.
- Конфликт protocol-токена и URI scheme → `Failure(PROTOCOL_CONFLICT)`.
- Percent-decoding credentials в URI, строгий UTF-8; path/query/fragment → `Failure`.
- Host нормализуется тем же `HOST_PATTERN`/IDN-контрактом, что `validateProxyProfile` — одна
  validation-точка, без второй копии regex.
- Лимиты hostile input: 8 KiB на строку, control characters → `Failure`.
- Тесты: перенос table-кейсов `ProxyStringParserTest.kt` + IPv6, IDN, injection-строки
  (`\n`, `"`, `;` внутри credentials), property-тест round-trip `parse(format(profile))`.

### 4.2 Bulk import с preview (PL-139)

- Application use case `ProxyLineImportService.preview(text, options)` и
  `apply(previewId, decisions)`; `options = { defaultTransport, fieldOrder, notePrefix? }`.
- Строки: trim, пропуск пустых и комментариев `#`, `//`; максимум 1000 записей и 1 MiB текста;
  overflow показывается как `N lines skipped`.
- Статусы строк: `NEW`, `UPDATE` (совпал `host+port+username+transport` существующего профиля и
  отличается пароль), `UNCHANGED`, `DUPLICATE` (повтор внутри пачки — побеждает последний, как в
  Android), `ERROR` (код причины), флаг `ambiguous` с переключателем порядка полей для всей пачки.
- Новый профиль: `name = host:port` (при коллизии имени — `host:port (2)`), `useSameProxy = true`,
  generated short name/color, `checkUrl` из defaults. Update меняет только пароль/transport,
  остальное (name, color, note, rules references) сохраняется.
- Apply — одна атомарная config mutation (copy → validate → persist → apply revision); частичное
  применение запрещено (FR-070). Результат: `Created N, updated M, skipped K`.
- UI: кнопка `Import from text` в Proxies (вторично — пункт в Import & Export) → панель с textarea,
  кнопкой `Load file` (`.txt`/`.csv`, тот же лимит), опциями и таблицей preview, где строки
  показываются как `TRANSPORT host:port user` **без пароля**; кнопка `Import N proxies`.
- Help-блок «Supported formats» с примерами из таблицы 4.1.

### 4.3 Вставка строки в редактор профиля (PL-140)

- В форме Add/Edit profile поле `Paste proxy string` + кнопка `Fill`: заполняет transport, host,
  port, username, password HTTP endpoint (и включает `Use the same proxy for HTTPS`). Ambiguous —
  выбор из двух вариантов radio-кнопками. Ошибка — inline, под полем, без эха ввода.
- Для пустого имени предлагается `host:port`.

## 5. Экспорт с паролями, копирование в URL/curl и `.txt` (PL-141)

По решению владельца экспорт без паролей малополезен, поэтому credentials **не скрываются**:

- **Native JSON.** Чекбокс `Include proxy credentials` уже существует (FR-067), но выключен по
  умолчанию и требует `window.confirm`. Меняем: чекбокс включён по умолчанию, вместо блокирующего
  confirm — постоянная видимая пометка `The file will contain proxy passwords in plain text`.
  Снять чекбокс можно для обмена конфигурацией без секретов. Import credentials (FR-068) без
  изменений. Schema не меняется.
- **URL / curl / `host:port:user:pass`** — копирование в clipboard с открытыми credentials.
- **`.txt` файл** — `Export proxies as text`: по строке на профиль в выбранном формате (URL или
  `host:port:user:pass`), имя `<product-slug>-proxies-<YYYY-MM-DD>.txt`, сохраняется тем же
  Blob/anchor механизмом, что JSON (новых permissions нет). Файл обратно импортируется PL-139.

До реализации — PRD: переформулировать FR-067 (credentials включены по умолчанию с видимым
предупреждением) и добавить FR на copy/text export; обновить `docs/privacy.md` и store disclosure.

Форматы (через pure formatter в `src/domain/profiles/proxy-format.ts`, обратный парсеру 4.1):

| Формат                | Результат                                                                |
| --------------------- | ------------------------------------------------------------------------ |
| URL                   | `http://user:p%40ss@1.2.3.4:8080` (userinfo percent-encoded по RFC 3986) |
| curl                  | `curl -x 'http://user:p%40ss@1.2.3.4:8080' 'https://check.example/'`     |
| `host:port:user:pass` | `1.2.3.4:8080:user:p@ss` (только если host/credentials не содержат `:`)  |

- curl: аргументы в одинарных кавычках с экранированием `'` → `'\''`; target URL — `checkUrl`
  профиля; HTTPS-транспорт даёт `https://` proxy-URL (`curl` ≥ 7.52).
- Профиль с `useSameProxy = false` копирует две строки с комментариями `# HTTP targets` /
  `# HTTPS targets`; curl — две команды (`http://` и `https://` target).
- SOCKS5 (после PL-145): `socks5h://…`, `curl --socks5-hostname` эквивалент через `-x socks5h://`.
- UI: в карточке профиля меню `Copy as ▸ URL / curl / host:port:user:pass`; в списке Proxies —
  `Copy all as URLs` (по строке на профиль); в popup — `Copy URL` активного профиля.
- `navigator.clipboard.writeText` по user gesture, новые permissions не нужны; toast
  `Copied (contains password)` в live region. Скопированное значение не попадает в logs,
  diagnostics, errors и E2E traces (canary-тест).
- Import & Export: кнопка `Export proxies as text` с выбором формата рядом с native export.

## 6. SOCKS5

Решение владельца: добавить в план. Это изменение product semantics, поэтому порядок строгий:
spike → ADR → PRD → реализация.

### 6.1 Spike и ADR-016 (PL-144)

Проверить на Chrome/Edge/Яндекс stable и Firefox stable:

- Chromium PAC `SOCKS5 host:port`: работает, DNS резолвится на proxy; **Chromium не поддерживает
  аутентификацию SOCKS5** (`onAuthRequired` не вызывается) — ожидаемый вывод: в Chromium SOCKS5
  только без credentials.
- Firefox `proxy.onRequest` `{ type: 'socks', username, password, proxyDNS: true }`: аутентификация
  поддерживается.
- Fail-closed при недоступном SOCKS endpoint в обоих семействах (нет fallback на `DIRECT`).
- WS/WSS, downloads, proxy check через SOCKS, incognito.

ADR-016 фиксирует результат и capability `socks5Auth: boolean`.

### 6.2 Реализация (PL-145, только при положительном ADR-016)

- PRD: убрать SOCKS5 из non-goals §5, новые FR, browser limitations §35 (Chromium без auth),
  permission table без изменений (`proxy` уже есть).
- Data model: `ProxyTransport = 'HTTP' | 'HTTPS' | 'SOCKS5'`; для SOCKS5 профиль использует один
  endpoint для всех target schemes (`useSameProxy` принудительно `true`, правило 7.9 AGENTS
  уточняется в ADR). Config schema v3 → v4: idempotent migration (no-op данных + version bump),
  backward fixture, interrupted-migration test, native import/export schema v4.
- PAC serializer: новая compiler-owned directive `SOCKS5`, injection/golden/parity tests.
- Firefox adapter: `type: 'socks', proxyDNS: true`, credentials из профиля.
- UI: transport select с `SOCKS5`; в Chromium — предупреждение «SOCKS5 authentication is not
  supported in this browser».
- **SOCKS5 с credentials в Chromium (решение):** сохранять **разрешено** — конфигурация остаётся
  переносимой между браузерами через export (тот же принцип, что Full URL Rule: хранится, но
  явно помечен). Профиль получает видимый статус `Authentication unsupported in this browser`
  (capability `socks5Auth=false`), в select'ах popup/rules — с пометкой. Маршрутизация **не
  меняется**: запрос уходит на назначенный SOCKS5 без auth и fail-closed отклоняется proxy, error
  page объясняет причину. Никакого пропуска профиля, подмены на `DIRECT` или другой proxy.
  Блокировать сохранение не рекомендуется: тогда импорт Firefox-конфигурации в Chromium ломался бы
  или требовал молча выбрасывать пароли.
- Парсер/форматтер (4.1/5) включают `socks5`/`socks5h`.
- Native import: SOCKS5-профили с credentials в Chromium импортируются без потерь, с тем же
  видимым статусом; rules на них остаются valid (поведение fail-closed, а не skip).

## 7. Порядок работ и версии

| Шаг | Задачи             | Версия        | Зависимости                     |
| --- | ------------------ | ------------- | ------------------------------- |
| 0   | PL-146 (выполнено) | 0.1.5         | —                               |
| 1   | PL-133, PL-134     | 0.1.6         | —                               |
| 2   | PL-135             | 0.1.7         | PL-133                          |
| 3   | PL-136, PL-137     | 0.1.8         | PL-135                          |
| 4   | PL-138             | 0.1.9         | —                               |
| 5   | PL-139, PL-140     | 0.1.10        | PL-138, PL-133                  |
| 6   | PL-141             | 0.1.11        | PL-138 (formatter)              |
| 7   | PL-142             | 0.1.12        | PL-133, PL-139                  |
| 8   | PL-147…PL-150      | 0.1.13–0.1.16 | PL-133, PL-134, PL-137, PL-141  |
| 9   | PL-143             | 0.1.17        | docs/screenshots sweep после UI |
| 10  | PL-144             | —             | spike, без релиза               |
| 11  | PL-145             | 0.2.0         | PL-144 положительный            |

Шаги 1–3 и 4–6 независимы и могут идти параллельно. Редизайн экранов (шаг 8) делается после того,
как на них появились новые функции, чтобы не переделывать разметку дважды.

## 8. Сквозные требования к каждой задаче

- **TDD обязателен.** Порядок в каждой задаче: сначала падающий тест на нужном уровне (domain
  table/property, application, component или E2E), commit/evidence красного прогона, затем
  минимальная реализация до зелёного, затем refactor при зелёных тестах. Баг-фикс начинается с
  regression-теста, воспроизводящего баг (например, F1 — тест, что обычный контекст не получает
  private override). В handoff указывается, какой тест был красным до изменения.

- Версия в `package.json` и centralized product config, changelog/release notes.
- Locale: все новые строки в `locales/en/`, typed accessor; cspell/`validate:docs` зелёные.
- Тесты на нижнем достаточном уровне: domain — table/property; application — atomicity; UI —
  component + Chromium E2E (`tests/e2e`); Firefox — integration/smoke по ADR-011.
- Privacy: пароли не появляются в preview-таблицах, logs, diagnostics, test traces (кроме явного
  clipboard в PL-141, где canary-скан проверяет traces).
- Документация: `docs/user-guide/README.md` (Once management, Import from text, Copy as),
  `docs/privacy.md` (clipboard), `docs/traceability.md`.
- Команды перед отметкой: `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test:unit`,
  `pnpm test:parity`, нужные `test:integration`/`test:e2e`, `pnpm build`, `pnpm build:firefox`,
  `pnpm validate:traceability`.

## 9. Иконка и доработка UI

### 9.1 Иконка (PL-146, выполнено в 0.1.5)

Старая иконка — буква «P» на синем квадрате, в сайдбаре options — текстовый бейдж «PL»; на 16px
не отличалась от других расширений. Новый знак обыгрывает «Loom»: три нити входят в узел и
расходятся двумя маршрутами со стрелками (routing). Градиент `#405cf5 → #7a5af8` совпадает с
акцентом UI.

- `public/icon.svg` — полный рисунок (32/48/128 px, store logo, промо-плитка).
- `store/assets/icon-small.svg` — упрощённый pixel-fitted вариант только для 16 px (вход, узел,
  две стрелки), полный рисунок на 16 px превращается в шум.
- `pnpm render:icons` растеризует всё через Chromium (ImageMagick не рисует SVG-градиенты).
- Options sidebar показывает ту же иконку вместо текстового «PL».
- Тест `tests/unit/scripts/brand-assets.test.ts` (был красным до изменения): размеры/RGBA PNG,
  наличие обоих источников, отсутствие старого glyph, brand mark из иконки.

### 9.2 Общие замечания по текущему UI

Стиль сохраняется (светлая/тёмная тема, синий акцент), цель — аккуратнее и плотнее.

| Экран    | Проблема                                                                                            |
| -------- | --------------------------------------------------------------------------------------------------- |
| Оболочка | Баннер `Saved and applied.` висит постоянно и сдвигает контент                                      |
| Оболочка | Двойные eyebrow (`ROUTING POLICY` + `CONNECTION POLICY`), заголовки страницы и карточки дублируются |
| Оболочка | В сайдбаре `Revision 17` — внутренний термин без смысла для пользователя                            |
| Rules    | Чекбокс enabled без подписи; action только серым текстом; профиль без чипа/short name               |
| Rules    | Длинные regex раздувают строку; 5 кнопок в каждой строке; фильтры занимают полэкрана                |
| Proxies  | Endpoints выровнены вразнобой; блок check громоздкий; нет сводки (transport, used by N rules)       |
| Popup    | Сырые enum, системные confirm (частично PL-133/PL-134), нет главного ответа «куда идёт сайт»        |

### 9.3 Оболочка (PL-147)

- Toast-уведомления (live region, success исчезает через 4 с, error остаётся до закрытия) вместо
  постоянного баннера.
- Один уровень заголовка страницы; карточки без дублирующих eyebrow.
- Сайдбар: локализованный mode + состояние `Applied` / `Applying…` / `Apply failed`; revision
  переносится в About / Diagnostics.
- Design tokens: шкала отступов и типографики, плотность строк, единые компоненты `Badge`,
  `ProfileChip` (цвет + short name + имя — не только цвет, NFR-010), `OverflowMenu` («⋯»),
  `Drawer` для редакторов, `EmptyState`.
- Empty/loading/error states во всех разделах (General, Logs, Import & Export, About).

Реализация PL-147: toast (`ToastHost`, success исчезает через 6 с, error остаётся до закрытия,
одновременно показывается один), в сайдбаре `Applied` / `Applying…` / `Apply failed` вместо
revision (revision остаётся в About / Diagnostics), убраны eyebrow заголовка страницы и
дублирующий eyebrow в Proxies, добавлены `ProfileChip`, `OverflowMenu` (клавиатура: стрелки,
Home/End, Escape с возвратом фокуса) и `Drawer` (модальный `<dialog>`). Отдельные tokens отступов
и компонент `EmptyState` не понадобились: существующие `.surface`/`.empty-state` уже единообразны.

### 9.4 Popup (PL-148)

- Сверху крупно: hostname текущего сайта и итоговый маршрут (`Direct` / `ProfileChip`) с
  источником (`Once`, `Rule: <name>`, `Global proxy`, `Rules mode default`).
- Mode — segmented control с локализованными подписями и однострочным пояснением выбранного режима.
- Global profile — список с `ProfileChip` и статусом последней проверки.
- Site actions: две явные кнопки `Once` / `Always` + scope/route, inline preview (PL-133),
  блок оверрайдов сайта (PL-137), `Copy URL` (PL-141).
- Футер: `Options`, `Logs`. Фиксированная ширина, 200% zoom без горизонтального скролла.

### 9.5 Proxies (PL-149)

- Компактная карточка: `ProfileChip`, transport badge, endpoints в выровненной grid
  (`HTTP / WS → host:port`, `HTTPS / WSS → host:port`, логин без пароля), `Used by N rules`.
- Последняя проверка — компактная pill (`Available · 707 ms · DE · 5 min ago` /
  `Failed · reason`), детали по раскрытию.
- Основные действия `Use globally`, `Check`; остальное в «⋯»: Edit, Duplicate, Copy as…, Delete.
- Редактор профиля — drawer справа вместо формы внизу страницы; поле вставки строки (PL-140).
- Toolbar списка: поиск/фильтр, `Import from text`, `Copy all as URLs`, `Export as text` (PL-139,
  PL-141, PL-142).

### 9.6 Rules (PL-150)

- Строка: drag handle + номер, подписанный switch `Enabled`, имя, pattern моноширинно в одну строку
  с обрезкой и раскрытием по клику, action как `ProfileChip`/`Direct`, badges `Firefox only`,
  `Disabled for 12 min`, `Invalid profile`.
- Действия строки: ↑/↓ остаются для клавиатуры (NFR-007), остальное в «⋯».
- Фильтры в одну строку с раскрытием `More filters`; счётчик `Showing N of M`.
- Редактор в drawer с live regex tester; глобальный routing tester — отдельная вкладка/панель.
- Групповой выбор: enable/disable/delete selected с impact preview.

### 9.7 Тестирование UI (TDD)

Для каждой задачи сначала component tests (роли, подписи, состояния) и E2E-сценарии, затем
вёрстка. Существующие `accessibility.spec.ts` (контраст, фокус, 200% zoom, ширина popup) — обязательный
regression. Скриншоты store (`pnpm capture:store-assets`) пересобираются в PL-143.

## 10. Дополнительные задачи (PL-142, PL-143)

- **PL-142 — Поиск и фильтр профилей.** После bulk import в списке может быть сотни профилей:
  поиск по name/host, фильтр по transport/последнему check, multi-select `Delete selected` с
  impact preview (сколько rules станут invalid), `Check selected` последовательно с отменой.
- **PL-143 — Синхронизация user guide/store текстов** с новыми возможностями и скриншоты options
  (без реальных credentials).

### Наблюдения по стабильности E2E

- `performance.spec.ts` (cold popup p95 < 1500 ms) изредка падает под нагрузкой и на исходном
  коммите `8c99c08` (1 из 4 прогонов) — бюджет чувствителен к загрузке машины.
- `restart.spec.ts` упал 1 раз из 10 полных прогонов; изолированно 8 из 8 зелёные. Нужна
  отдельная диагностика, если повторится.

## 11. Принятые решения

1. `Make permanent` для Once всегда создаёт правило в начале списка.
2. Экспорт в `.txt` нужен — входит в PL-141.
3. SOCKS5 с credentials в Chromium сохраняется с видимым статусом и fail-closed (см. 6.2).
4. Native JSON export включает пароли по умолчанию, с видимым предупреждением (см. 5).
5. Разработка ведётся через TDD (см. 8).
6. Иконка — «нити → узел → маршруты», отдельный упрощённый вариант для 16 px (см. 9.1).
7. UI: текущий стиль, но аккуратнее; приоритет — popup, Proxies, Rules, общая оболочка (см. 9).
