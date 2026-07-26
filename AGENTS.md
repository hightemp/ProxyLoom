# AGENTS.md — правила работы над ProxyLoom

## 1. Назначение

ProxyLoom — кроссбраузерное Manifest V3 расширение для управления HTTP/HTTPS proxy profiles и ordered routing rules. Одна кодовая база собирается в Chromium ZIP и Firefox ZIP. Chrome, Edge и Яндекс Браузер используют Chromium build; Firefox имеет отдельный routing adapter.

Главные свойства продукта:

- однозначные `DIRECT`, `PROXY`, `RULES`;
- first enabled/active/compatible match wins;
- Origin Rules переносимы;
- Full URL Rules исполняются только Firefox;
- назначенный proxy работает fail-closed, без скрытого `DIRECT`, system или другого proxy fallback;
- credentials хранятся локально без master-password encryption и никогда не логируются;
- UI полностью английский и локализуемый;
- telemetry/analytics/remote code отсутствуют.

## 2. Источники требований и иерархия решений

При конфликте следовать порядку:

1. Текущая явно выбранная задача `PL-*` в `TASKS.md`.
2. Связанные requirement IDs и разделы `PRD.md`.
3. Принятые ADR в `docs/adr/`, созданные обязательными spikes.
4. Этот `AGENTS.md`.
5. Tests и существующие public contracts.
6. Implementation details.

ADR может уточнить проверенное browser behavior, но не меняет product semantics сам по себе. Если limitation требует изменить режим, privacy, fallback, data model или user promise, сначала обновить `PRD.md`, requirement traceability и зависимые задачи.

Не менять product semantics скрытым code workaround. Не обещать одинаковую функциональность там, где browser APIs различаются. Ограничение отражается в capability service, английском UI, PRD/user docs и release matrix.

## 3. Как начинать задачу

1. Найти выбранный checkbox `PL-*` в `TASKS.md`.
2. Прочитать полное описание задачи, зависимости, acceptance criteria и tests.
3. Открыть только связанные requirement IDs/разделы PRD и указанные ADR. Не перечитывать весь PRD без необходимости.
4. Проверить, выполнены ли зависимости. Не имитировать отсутствующий spike assumption.
5. Посмотреть локальные `AGENTS.md` глубже по дереву: они могут уточнять правила модуля.
6. Проверить dirty worktree и сохранить unrelated user changes.
7. Реализовать ровно scope задачи и необходимые тесты.
8. Выполнить acceptance commands и target-specific verification.
9. Обновить документацию/traceability, если public behavior действительно изменён.
10. Отметить checkbox только когда acceptance criteria, tests и `Done when` подтверждены.

Checkbox нельзя отмечать за scaffold, partial implementation, green mocks без требуемого browser integration или потому, что задача «почти готова». В summary приложить команды и evidence.

## 4. Языки

- UI labels, buttons, modes, notifications, errors и help: английский, через locale messages.
- Code identifiers, comments, test names, README, ADR filenames и commit messages: английский.
- `PRD.md`, `TASKS.md`, `AGENTS.md`: русский.
- ADR: русский для архитектурного объяснения; code/API identifiers остаются английскими.
- Не добавлять user-facing literals прямо в Vue/TypeScript, кроме явно проверяемых protocol/provider values. Использовать typed i18n accessor.

Отображаемое имя берётся из централизованной product config. Не использовать `ProxyLoom` в storage keys, schema format discriminator, ID prefix или internal package namespace, если это затруднит rename.

## 5. Предполагаемая структура проекта

После задачи scaffolding структура должна следовать границам:

```text
entrypoints/                  WXT popup/options/error/background entrypoints
locales/en/                   все user-facing messages
src/
  config/                     centralized product/build/runtime defaults
  domain/                     pure entities, normalization, regex, resolver
  application/                use cases, commands, orchestration, view models
  storage/                    local/session/IndexedDB repositories, migrations
  platform/
    chromium/                 chrome.proxy, PAC apply, Chromium events/auth
    firefox/                  proxy.onRequest, Firefox events/auth
    contracts/                platform interfaces/capability contracts
  ui/                         Vue components/composables/styles, browser-agnostic
tests/
  unit/
  parity/
  integration/
  e2e/
  fixtures/
docs/
  adr/
  user-guide/
  release-verification/
store/
```

WXT может требовать конкретные entrypoint paths; физическое имя разрешено адаптировать, но dependency direction — нет.

## 6. Архитектурные границы

### Shared domain

`src/domain`:

- не импортирует Vue, WXT, browser/chrome, storage, timers, network или DOM;
- получает platform, clock и session facts аргументами;
- содержит единственный URL normalization contract и единственный pure resolver;
- возвращает typed results/diagnostics, не показывает UI и не пишет logs;
- детерминирован для одинакового input.

Popup inspection, global routing tester, logging plan, Firefox routing и PAC parity должны ссылаться на один resolver/routing snapshot. Запрещено копировать rules loop в UI, adapter или PAC builder.

### Application

`src/application`:

- оркестрирует repositories/platform interfaces;
- выполняет atomic commands и versioned configuration apply;
- не содержит прямых `chrome.*`/`browser.*`;
- различает persisted revision и реально applied revision;
- отдаёт UI capability/view model вместо browser-name flags.

### Platform adapters

Только `src/platform/chromium`, `src/platform/firefox`, WXT config/entrypoint могут использовать browser-specific API/conditions. Browser-specific manifest config тоже находится на build boundary.

Запрещены рассеянные `if (isFirefox)`, user-agent checks и `browser === ...` в domain/application/UI. Добавить capability/port method и реализовать в адаптерах.

### UI

Vue 3 Composition API, `<script setup lang="ts">`, typed props/emits/composables. UI:

- вызывает application commands/query services;
- не пишет storage напрямую;
- не генерирует PAC/regex routing самостоятельно;
- не угадывает capabilities;
- содержит keyboard/focus/ARIA/loading/empty/error states;
- не использует color как единственный profile indicator.

## 7. Routing invariants

Нарушение любого пункта — release blocker:

1. `DIRECT` игнорирует rules, auth и overrides, не удаляя их.
2. `PROXY`: override → first rule → global proxy.
3. `RULES`: override → first rule → `DIRECT`.
4. Rules проверяются строго по global position; group/specificity не меняют priority.
5. Disabled, unexpired temporary-disabled и incompatible rules пропускаются.
6. Full URL Rule — Firefox-only; Chromium сохраняет и пропускает его с visible reason.
7. Invalid/deleted proxy reference не превращается в `DIRECT`.
8. Proxy action возвращает ровно назначенный endpoint без `DIRECT`, system или second proxy fallback.
9. HTTP/WS target использует HTTP endpoint; HTTPS/WSS — HTTPS endpoint, согласно утверждённому ADR.
10. Extension/internal/check requests проходят explicit internal policy, не user rules/log.
11. Chromium Once origin-scoped и предупреждает о других tabs; Firefox tab-scoped при reliable tab ID.

Никогда не добавлять «временный» скрытый `DIRECT` fallback, даже для улучшения UX. Recovery выполняется только явным user action `Open Directly Once`/mode/rule change.

## 8. PAC safety

- PAC строится только из validated normalized snapshot через typed IR/serializer.
- Raw pattern/host/profile name не вставляется простой конкатенацией в executable context.
- Разрешены только compiler-owned directives и syntax.
- Proxy result не содержит fallback chain.
- Full URL rules не компилируются.
- Любое изменение serializer требует injection corpus, golden tests и resolver/PAC parity.
- Не использовать `eval`/`new Function` в приложении. Если parity harness изолированно исполняет PAC, он живёт только в tests, не production build, и его threat boundary документирован.
- PAC size проверяется до apply; rejected snapshot не удаляет last safely applied config.
- Apply имеет monotonic revision/coalescing; stale result не становится active.

## 9. Credentials и auth

- Credentials сохраняются только в обычном extension local storage согласно v1.
- Не называть storage encrypted/secure vault.
- Не писать username/password в console, logs, errors, diagnostics, telemetry, test traces, screenshots или default export.
- Не передавать credentials GeoIP/check provider как app header/body/query.
- Site HTTP auth не получает proxy credentials: обязательно проверить proxy challenge и expected endpoint/profile.
- Для одного request ID — одна попытка. Повторная challenge означает rejection и cancel.
- Attempt state очищается по completion/error/timeout/startup reconciliation.
- Fixtures используют только synthetic credentials; CI artifacts проходят canary scan.

Если debugging требует увидеть secret, использовать локальный debugger вне committed logging и удалить evidence до handoff. Никогда не добавлять временный `console.log(profile)`.

## 10. Storage, schemas и migrations

- `storage.local`: versioned config; session storage: overrides/transient state; IndexedDB: ring log; memory: private logs/cache.
- Service worker globals не являются source of truth.
- Любое schema field change требует:
  1. version bump;
  2. idempotent ordered migration;
  3. backward fixture;
  4. interrupted-migration/rollback test;
  5. native import/export schema/migration review;
  6. PRD data model update, если меняется public semantics.
- Mutation: copy → validate → persist atomically → build/apply revision → report persisted/applied states.
- Не mutating active object before validation/commit.
- Backup bounded и не содержит лишних transient/log data.
- Import JSON считается hostile: size/depth/count/string limits, schema allowlist, no unsafe merge, prototype pollution protection.

## 11. Privacy и logging

Не ослаблять privacy ради упрощения разработки:

- не добавлять analytics, telemetry, crash upload, remote config, ads или account service;
- не отправлять user URL наружу;
- manual proxy check — единственное раскрытое внешнее обращение, только после user action;
- endpoint показан, заменяем и GeoIP отключаем;
- log schema — allowlist; запрещённые поля должны быть структурно невозможны;
- logging может быть полностью отключён;
- maximum 1000 persistent entries с ring-buffer/batching;
- private logs только in-memory и очищаются после private session;
- regex/routing tester не выполняет network requests;
- full path/query/fragment никогда не попадает в persistent logs/diagnostics.

Новая внешняя сеть, permission или data field требует security/privacy review и обоснования в PRD до реализации.

## 12. Dependencies

Добавлять dependency только если:

- она решает задачу лучше небольшого maintainable local module;
- активна, совместима с target browsers/MV3/CSP и имеет приемлемую лицензию;
- не загружает remote code/data неожиданно;
- bundle/security impact измерен;
- dependency rationale зафиксирован в task/ADR.

PSL должна быть локальной library/data; remote registrable-domain API запрещён. Lockfile обязателен. Использовать `pnpm` и frozen install. Не обновлять unrelated dependencies в feature task.

## 13. Permissions

Proxy/host/webRequest/tabs/notifications permissions чувствительны. Перед изменением manifest:

1. указать конкретный requirement и API use;
2. проверить, нельзя ли использовать меньший/optional scope;
3. обновить permission table PRD и store disclosure;
4. проверить install warnings Chromium/Firefox;
5. добавить capability/denied UI;
6. добавить integration/manual case.

Не добавлять permission «на будущее». Не вступать в бесконечную борьбу за proxy control. При policy/other extension UI блокирует controls и объясняет статус.

## 14. Tests и verification

Каждое поведение тестируется на наиболее низком достаточном уровне, но browser API promise нельзя закрыть только mock:

- domain — unit/property/table tests;
- PAC — injection/golden/parity/browser parse;
- storage/import — fixture/interruption/atomicity;
- platform API — local proxy/server integration;
- UI — component/accessibility/E2E;
- browser limitation — integration + named manual matrix.

Local test proxies/servers обязательны. Не зависеть от random public proxies. Внешний provider contract test отделён, opt-in/controlled и не заменяет mocks.

Перед отметкой задачи:

- выполнить task-specific tests;
- `pnpm lint`;
- `pnpm format:check`;
- `pnpm typecheck`;
- соответствующий unit/integration/E2E subset;
- build затронутых browser targets;
- manual scenario, если указан.

Coverage number не заменяет branch/requirement review. Flaky test не отключать молча; устранить cause или создать documented quarantine с owner и release impact.

## 15. Команды

После scaffolding canonical commands должны быть:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test:unit
pnpm test:parity
pnpm test:integration
pnpm test:e2e
pnpm build
pnpm build:firefox
pnpm zip
pnpm zip:firefox
```

WXT underlying commands:

```bash
wxt build
wxt build -b firefox
wxt zip
wxt zip -b firefox
```

До PL-016 этих команд закономерно нет. После scaffolding не документировать несуществующую команду: при script rename одновременно обновить `package.json`, этот раздел, README и CI.

Firefox extension E2E не объявлять Playwright-supported без положительного PL-011 ADR. Официальный Playwright extension workflow ориентирован на Chromium persistent context; использовать утверждённый Firefox tooling или integration+smoke+manual fallback.

## 16. Commits и scope

- Commit messages на английском, imperative и с task ID, например: `PL-032 implement pure route resolver`.
- Одна задача — одна логическая серия commits; не смешивать dependency upgrades/refactors/features.
- Не переписывать user changes и не использовать destructive git commands.
- Generated build output, credentials, real configs, private screenshots и test certificates/secrets не commit.
- Изменение public behavior включает tests и docs в том же task.
- Не создавать commit, tag, PR или release без явного workflow/user instruction.

## 17. Обновление TASKS

Выполненную задачу отмечать `- [x]` только после проверки каждого поля:

- scope реализован;
- dependencies/ADR соблюдены;
- acceptance criteria доказаны;
- mandatory tests зелёные;
- `Done when` достигнут;
- docs/requirements trace обновлены;
- unrelated regressions отсутствуют.

Не менять wording завершённой задачи так, чтобы скрыть недовыполненный scope. Новооткрытая работа получает новый unique `PL-*`, dependencies и requirement IDs. Если найден blocker, checkbox остаётся пустым, а issue/ADR фиксирует evidence.

## 18. Release artifacts

На release обязательны:

- один Chromium ZIP;
- один Firefox ZIP;
- SHA-256 checksum file;
- release notes;
- при необходимости Firefox review source package, отдельный от install ZIP.

Имена: `<product-slug>-<browser>-<version>.zip`. Artifacts собираются из clean checkout/frozen lockfile, проходят smoke install и не содержат secrets/dev fixtures. Edge/Яндекс используют тот же Chromium ZIP и checksum. Workflow по tag `v*` создаёт GitHub Release, но никогда автоматически не публикует в stores.

## 19. Действия при обнаружении browser API limitation

1. Остановить зависимую реализацию; не добавлять silent fallback или false UI.
2. Создать минимальный воспроизводимый prototype на exact browser version.
3. Сохранить sanitized evidence и сравнить с актуальной primary documentation.
4. Проверить оба browser families и влияние на fail-closed/privacy/permissions.
5. Оформить/обновить ADR: observed behavior, alternatives, security/privacy impact, recommendation.
6. Если меняется user promise/semantics — сначала обновить PRD requirement/risks/limitations/acceptance.
7. Обновить dependent TASKS, capability contract, English UI warning и user/store docs.
8. Добавить integration/manual regression case.
9. Продолжить только после явного архитектурного решения.

Нельзя «исправлять» невозможный platform behavior имитацией. В частности: не делать Chromium Full URL routing после proxy selection; не называть Chromium Once tab-specific; не скрывать Firefox browser-defined proxy fallback; не обещать guaranteed custom error page.

## 20. Definition of coding-agent handoff

Handoff по задаче содержит:

- task ID и краткий outcome;
- затронутые files/modules;
- выполненные exact commands и результаты;
- manual/browser versions, если применимо;
- migrations/permissions/privacy impact;
- remaining limitations или follow-up IDs;
- подтверждение, что checkbox отмечен только при полном DoD.

Если задача не завершена, не маскировать partial state: указать конкретный blocker/evidence и оставить checkbox пустым.
