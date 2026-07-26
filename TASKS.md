# ProxyLoom — план реализации

## Правила выполнения

Все задачи изначально не выполнены. Coding agent берёт одну задачу, читает связанные requirement IDs в `PRD.md`, выполняет только её scope и отмечает checkbox лишь после всех acceptance criteria и тестов. Если spike меняет допущение, сначала обновляются ADR/PRD и зависимые задачи. Предполагаемые пути ниже уточняются после scaffolding, но архитектурные границы обязательны.

## Фаза 1. Research spikes

- [x] **PL-001 — Проверить Manifest V3 proxy API в актуальных Chrome и Firefox**
  - **Цель:** доказать доступность routing API, permissions и lifecycle для двух release targets.
  - **Требования:** COMPAT-001, COMPAT-004, COMPAT-014, SEC-007.
  - **Действия:** собрать минимальные MV3 prototypes, применить direct/proxy config, перезапустить service worker, записать browser versions и install warnings.
  - **Прототип/модули:** `spikes/mv3-proxy-api/{chromium,firefox}/`, без переноса prototype code в production.
  - **Зависимости:** нет.
  - **Ожидаемый результат и критерии:** capability/permission table подтверждена на актуальных stable builds; минимальные версии и gaps однозначны.
  - **Тесты:** ручные сценарии apply/read/restart; сохранённые console/network traces без credentials.
  - **Артефакт/влияние/готово:** `docs/adr/ADR-001-mv3-proxy-api.md`; разблокированы foundation, adapters и manifest.

- [x] **PL-002 — Исследовать URL, доступный Chromium PAC**
  - **Цель:** установить фактический `FindProxyForURL(url, host)` input для HTTP, HTTPS, WS и WSS.
  - **Требования:** FR-015–FR-018, COMPAT-012, раздел 35 PRD.
  - **Действия:** PAC prototype безопасно кодирует наблюдаемый scheme/host/path availability в выбор локальных endpoints; проверить default/non-default ports и IDN.
  - **Прототип/модули:** `spikes/chromium-pac-url/`, local servers.
  - **Зависимости:** PL-001.
  - **Ожидаемый результат и критерии:** таблица фактически доступных частей URL для каждого scheme и browser version; Origin contract подтверждён или скорректирован.
  - **Тесты:** controlled HTTP/HTTPS/WS/WSS requests, повтор на Chrome и Chromium.
  - **Артефакт/влияние/готово:** `ADR-002-chromium-pac-url.md`; определяет normalization и PAC compiler.

- [x] **PL-003 — Проверить fail-closed при недоступном proxy**
  - **Цель:** доказать отсутствие direct/system/second-proxy fallback.
  - **Требования:** FR-006, FR-075, SEC-017.
  - **Действия:** направить запрос к unreachable/refusing/hanging proxy; наблюдать на local origin, был ли direct request; сравнить PAC directives.
  - **Прототип/модули:** `spikes/fail-closed/`, traffic-capture origin/proxy.
  - **Зависимости:** PL-001, PL-002.
  - **Ожидаемый результат и критерии:** для назначенного proxy origin не получает direct request; unsupported case явно зафиксирован как release blocker/limitation.
  - **Тесты:** HTTP, HTTPS, WS handshake и download в Chromium/Firefox.
  - **Артефакт/влияние/готово:** `ADR-003-fail-closed.md` + reproducible scripts; gate для adapters/integration.

- [x] **PL-004 — Проверить Firefox fallback semantics**
  - **Цель:** подтвердить single `ProxyInfo`, array behavior, `null`/`undefined` и влияние browser-defined manual proxy на `direct`.
  - **Требования:** COMPAT-013, SEC-017, раздел 35 PRD.
  - **Действия:** вернуть один proxy, массив proxy fallback, direct и null/undefined при разных user settings; снять network evidence.
  - **Прототип/модули:** `spikes/firefox-fallback/`.
  - **Зависимости:** PL-001.
  - **Ожидаемый результат и критерии:** точная return shape для PROXY/DIRECT и честный control-conflict UX определены.
  - **Тесты:** reachable/unreachable proxy, manual browser proxy on/off, restart.
  - **Артефакт/влияние/готово:** `ADR-004-firefox-fallback.md`; обновлены PRD/TASKS при расхождении.

- [x] **PL-005 — Проверить proxy authentication в Chromium MV3 и Firefox**
  - **Цель:** подтвердить challenge fields, permissions, async response, cancellation и cleanup events.
  - **Требования:** FR-046–FR-049, COMPAT-007, SEC-014.
  - **Действия:** local authenticating proxies; correct/wrong credentials; site auth negative case; повторная challenge.
  - **Прототип/модули:** `spikes/proxy-auth/`.
  - **Зависимости:** PL-001.
  - **Ожидаемый результат и критерии:** one-attempt algorithm реализуем на обеих платформах; известны event ordering и cancel behavior.
  - **Тесты:** HTTP proxy auth, CONNECT auth, main-frame/background, worker suspension.
  - **Артефакт/влияние/готово:** `ADR-005-proxy-auth.md`; задаёт auth adapter contract.

- [x] **PL-006 — Проверить разные HTTP/HTTPS proxy endpoints**
  - **Цель:** подтвердить mapping target scheme → endpoint и proxy transport HTTP/HTTPS.
  - **Требования:** FR-015–FR-017, FR-041, COMPAT-012.
  - **Действия:** поднять различимые local proxy endpoints и проверить HTTP/HTTPS/WS/WSS/download routing.
  - **Прототип/модули:** `spikes/separate-endpoints/`.
  - **Зависимости:** PL-002, PL-004.
  - **Ожидаемый результат и критерии:** browser-by-scheme matrix доказывает выбранное mapping или фиксирует limitation.
  - **Тесты:** same endpoint и separate endpoints, оба proxy transport types.
  - **Артефакт/влияние/готово:** `ADR-006-endpoint-routing.md`; разблокирует model/compiler/adapters.

- [x] **PL-007 — Исследовать manual check неактивного профиля в Chromium**
  - **Цель:** проверить targeted temporary PAC override без глобального нарушения routing.
  - **Требования:** FR-063–FR-066, SEC-011.
  - **Действия:** сериализованный prototype добавляет override только для check/IP origins, имитирует worker stop и выполняет startup recovery.
  - **Прототип/модули:** `spikes/inactive-profile-check/`.
  - **Зависимости:** PL-002, PL-003, PL-006.
  - **Ожидаемый результат и критерии:** прочий traffic остаётся на prior route; recovery доказан либо выбран честный safe UX без скрытого global switch.
  - **Тесты:** success/timeout/crash/concurrent click/config change.
  - **Артефакт/влияние/готово:** `ADR-007-inactive-check.md`; определяет proxy-check service.

- [x] **PL-008 — Проверить best-effort error page**
  - **Цель:** определить, какие main-frame proxy failures можно надёжно коррелировать и перенаправить.
  - **Требования:** FR-024, FR-049, FR-055–FR-056, COMPAT-008.
  - **Действия:** вызвать DNS/refused/timeout/auth errors; проверить tab state, redirect timing, loop guard и missing-tab cases.
  - **Прототип/модули:** `spikes/error-page/`.
  - **Зависимости:** PL-003, PL-005.
  - **Ожидаемый результат и критерии:** список supported/best-effort/unsupported error classes и безопасный алгоритм.
  - **Тесты:** main-frame/subresource/WS/download/internal URL.
  - **Артефакт/влияние/готово:** `ADR-008-error-page.md`; задаёт error coordinator.

- [x] **PL-009 — Проверить session overrides и tab-close cleanup**
  - **Цель:** подтвердить storage/session/alarms и tab isolation после worker restart.
  - **Требования:** FR-057–FR-059, COMPAT-009.
  - **Действия:** создать Once, suspend/restart worker, закрыть tab, открыть same origin в другой tab.
  - **Прототип/модули:** `spikes/session-overrides/`.
  - **Зависимости:** PL-001, PL-002, PL-004.
  - **Ожидаемый результат и критерии:** Firefox tab scope и Chromium origin scope/cleanup воспроизводимы.
  - **Тесты:** normal/private tabs, tab reuse, browser restart, stale ID.
  - **Артефакт/влияние/готово:** `ADR-009-session-overrides.md`; определяет session repository.

- [x] **PL-010 — Проверить incognito scopes**
  - **Цель:** установить spanning/split behavior, permissions и storage/log isolation.
  - **Требования:** FR-073–FR-074, COMPAT-010, PRIV-001, PRIV-004.
  - **Действия:** включить/выключить browser permission, проверить routing, session state и IndexedDB writes.
  - **Прототип/модули:** `spikes/incognito/`.
  - **Зависимости:** PL-001, PL-009.
  - **Ожидаемый результат и критерии:** per-browser isolation policy и UI instructions подтверждены.
  - **Тесты:** normal/private concurrent windows, close last private window, restart.
  - **Артефакт/влияние/готово:** `ADR-010-incognito.md`; разблокирует repositories/adapters/UI.

- [x] **PL-011 — Проверить Firefox extension E2E tooling**
  - **Цель:** найти воспроизводимый unsigned MV3 Firefox smoke/E2E flow, не имитируя поддержку Playwright.
  - **Требования:** раздел 33 PRD, COMPAT-015, NFR-017.
  - **Действия:** проверить актуальный Playwright, web-ext и допустимые alternatives; запустить popup/options smoke.
  - **Прототип/модули:** `spikes/firefox-e2e/`.
  - **Зависимости:** PL-001.
  - **Ожидаемый результат и критерии:** выбран стабильный CI-capable tool либо formal fallback integration+manual.
  - **Тесты:** clean-machine repeat, service worker/page access, failure reporting.
  - **Артефакт/влияние/готово:** `ADR-011-firefox-e2e.md`; уточняет E2E/CI tasks.

- [x] **PL-012 — Проверить downloads и WebSocket**
  - **Цель:** подтвердить scheme mapping, observable events и error handling.
  - **Требования:** FR-015–FR-018, FR-049, FR-056.
  - **Действия:** local WS/WSS and download servers, distinct proxies, failure injection.
  - **Прототип/модули:** `spikes/ws-downloads/`.
  - **Зависимости:** PL-003, PL-006.
  - **Ожидаемый результат и критерии:** routing/event/manual matrix заполнена; notification permission need доказана.
  - **Тесты:** handshake success/failure, established messages invisible, download success/cancel/failure.
  - **Артефакт/влияние/готово:** `ADR-012-ws-downloads.md`; влияет на permissions/logging.

- [x] **PL-013 — Измерить практический размер generated PAC**
  - **Цель:** определить safe limit для 1000 rules, config apply и browser PAC parser.
  - **Требования:** NFR-002, NFR-003, COMPAT-012.
  - **Действия:** генерировать representative/worst-case snapshots, измерять bytes/compile/apply/startup и ошибки API.
  - **Прототип/модули:** `spikes/pac-size/`.
  - **Зависимости:** PL-002.
  - **Ожидаемый результат и критерии:** documented threshold/warning/rejection policy и benchmark environment.
  - **Тесты:** 1/100/1000 rules, max patterns, injection characters.
  - **Артефакт/влияние/готово:** `ADR-013-pac-size.md`; задаёт compiler validation/performance gates.

- [x] **PL-014 — Проверить RegExp compatibility в PAC и Firefox runtime**
  - **Цель:** доказать общий safe subset flags/features и DoS controls.
  - **Требования:** FR-038–FR-040, SEC-001–SEC-002.
  - **Действия:** corpus syntax/features/Unicode/escaping выполняется в PAC и background; измеряются pathological cases.
  - **Прототип/модули:** `spikes/regexp-compat/`.
  - **Зависимости:** PL-002.
  - **Ожидаемый результат и критерии:** allowlist flags/features и serialization strategy однозначны.
  - **Тесты:** flags `i/m/g/y/s/u/v/d`, nested quantifiers, newline/quote/backslash/IDN.
  - **Артефакт/влияние/готово:** `ADR-014-regexp-compat.md`; обновляет validator/compiler/tester.

- [ ] **PL-015 — Проверить proxy control conflicts**
  - **Цель:** исследовать другой proxy extension, enterprise policy и ownership events.
  - **Требования:** FR-021–FR-023, SEC-007, раздел 32 PRD.
  - **Действия:** получить/потерять control, изменить settings извне, проверить owner information и retry policy.
  - **Прототип/модули:** `spikes/proxy-control/`.
  - **Зависимости:** PL-001.
  - **Ожидаемый результат и критерии:** status mapping и no-fight behavior подтверждены на Chrome/Firefox.
  - **Тесты:** policy fixture где возможно, second extension, startup/change events.
  - **Артефакт/влияние/готово:** `ADR-015-proxy-control.md`; задаёт capability/config UI.

## Фаза 2. Project foundation

- [x] **PL-016 — Создать WXT/Vue/TypeScript strict scaffold**
  - **Цель:** создать минимальный проект без продуктовой логики.
  - **Требования:** COMPAT-001, REL-002, NFR-001.
  - **Действия:** WXT, Vue module, MV3, pnpm, strict tsconfig, editor config, centralized product config.
  - **Модули:** `wxt.config.ts`, `package.json`, `tsconfig.json`, `src/config/product.ts`.
  - **Зависимости:** PL-001.
  - **Критерии приёмки:** clean install и пустые Chromium/Firefox builds; name меняется одной config entry.
  - **Тесты:** `pnpm typecheck`, оба build commands.
  - **Готово, когда:** lockfile committed, build output не committed, AGENTS commands актуализированы.

- [x] **PL-017 — Настроить entrypoints и i18n**
  - **Цель:** заложить popup/options/error/background и English-first localization.
  - **Требования:** FR-012, NFR-015, COMPAT-011.
  - **Действия:** создать WXT entrypoints, `_locales/en`, typed message accessor, no-literal lint policy.
  - **Модули:** `entrypoints/`, `locales/en/`, `src/i18n/`.
  - **Зависимости:** PL-016.
  - **Критерии приёмки:** все skeleton surfaces открываются; default locale `en`.
  - **Тесты:** build smoke и locale key test.
  - **Готово, когда:** browser-specific entry config не попал в UI/domain.

- [x] **PL-018 — Настроить качество и тестовые runners**
  - **Цель:** единые lint/format/type/unit scripts до feature work.
  - **Требования:** REL-003, NFR-017, SEC-013.
  - **Действия:** ESLint, formatter, Vitest, coverage, dependency audit/licence scripts.
  - **Модули:** tool configs, `tests/setup/`.
  - **Зависимости:** PL-016.
  - **Критерии приёмки:** intentional lint/type/test failure корректно ломает command.
  - **Тесты:** self-smoke всех scripts.
  - **Готово, когда:** команды документированы и reproducible.

- [x] **PL-019 — Определить future project boundaries**
  - **Цель:** физически запретить недопустимые зависимости слоёв.
  - **Требования:** FR-080, COMPAT-011, SEC-007.
  - **Действия:** создать directories/path aliases/import-boundary rules для domain/application/platform/storage/UI.
  - **Модули:** `src/domain`, `src/application`, `src/platform`, `src/storage`, `src/ui`.
  - **Зависимости:** PL-018.
  - **Критерии приёмки:** domain→browser и UI→platform direct imports ломают lint.
  - **Тесты:** boundary rule fixtures.
  - **Готово, когда:** архитектура совпадает с component diagram PRD.

## Фаза 3. Shared domain model

- [x] **PL-020 — Реализовать branded IDs, enums и timestamps**
  - **Цель:** стабильные, display-name-independent primitives.
  - **Требования:** FR-027, FR-076, раздел 27 PRD.
  - **Действия:** typed IDs, modes/actions/matchers/transports/platforms, clock interface.
  - **Модули:** `src/domain/types/`.
  - **Зависимости:** PL-019.
  - **Критерии приёмки:** invalid enum/reference constructions не проходят type/schema validation.
  - **Тесты:** serialization and exhaustive-switch unit tests.
  - **Готово, когда:** primitives не импортируют runtime APIs.

- [x] **PL-021 — Реализовать ProxyProfile и endpoint invariants**
  - **Цель:** покрыть все поля и same/separate semantics.
  - **Требования:** FR-002, FR-041–FR-045, SEC-003.
  - **Действия:** constructors/validators, host/port/transport/short-name/color/check URL constraints.
  - **Модули:** `src/domain/profiles/`.
  - **Зависимости:** PL-020, PL-006.
  - **Критерии приёмки:** canonical effective endpoints однозначны; credentials не входят в debug serialization.
  - **Тесты:** valid/invalid table, generated short-name collisions.
  - **Готово, когда:** every PRD field round-trips through safe schema.

- [x] **PL-022 — Реализовать Rule, Group и temporary state entities**
  - **Цель:** выразить priority, validity, compatibility и session state.
  - **Требования:** FR-030–FR-036, FR-057–FR-059.
  - **Действия:** entity schemas, action/reference invariants, temporary expiry models, preset group factory.
  - **Модули:** `src/domain/rules/`, `src/domain/overrides/`.
  - **Зависимости:** PL-020.
  - **Критерии приёмки:** PROXY action требует profile ID; group не влияет на position.
  - **Тесты:** entity validation, timestamps, preset demo safety.
  - **Готово, когда:** invalid references representable и не удаляются.

- [x] **PL-023 — Реализовать routing snapshot и diagnostic contracts**
  - **Цель:** единый normalized immutable input/output всех routing consumers.
  - **Требования:** FR-019–FR-020, FR-080, NFR-001.
  - **Действия:** snapshot builder contracts, revision/hash, decision/source/trace/diagnostic types.
  - **Модули:** `src/domain/routing/`.
  - **Зависимости:** PL-021, PL-022.
  - **Критерии приёмки:** snapshot отвергает invalid PROXY default, но сохраняет invalid rules для diagnostics.
  - **Тесты:** immutability, deterministic hash, schema fixtures.
  - **Готово, когда:** popup/PAC/Firefox/log/tester могут использовать один contract.

## Фаза 4. Storage and migrations

- [x] **PL-024 — Реализовать versioned local config repository**
  - **Цель:** атомарно хранить конфигурацию и revision.
  - **Требования:** FR-076, FR-078, SEC-004.
  - **Действия:** read/validate/copy-update/commit, optimistic revision, typed failures.
  - **Модули:** `src/storage/config/`.
  - **Зависимости:** PL-023.
  - **Критерии приёмки:** failed validation/write оставляет prior config; concurrent writes разрешаются детерминированно.
  - **Тесты:** mocked storage failures/concurrency/corruption.
  - **Готово, когда:** UI не пишет storage напрямую.

- [x] **PL-025 — Реализовать migration runner и recovery**
  - **Цель:** безопасные idempotent schema upgrades.
  - **Требования:** FR-076–FR-078, SEC-004.
  - **Действия:** migration registry, bounded backup, in-progress marker, rollback/startup recovery.
  - **Модули:** `src/storage/migrations/`.
  - **Зависимости:** PL-024.
  - **Критерии приёмки:** interruption на каждом шаге либо завершает migration, либо восстанавливает backup.
  - **Тесты:** version fixtures, injected interruption, repeat run.
  - **Готово, когда:** migration ADR/template и backup retention определены.

- [x] **PL-026 — Реализовать session repository**
  - **Цель:** хранить overrides, temporary disables, auth/recovery state вне globals.
  - **Требования:** FR-014, FR-048, FR-059, NFR-006.
  - **Действия:** storage.session adapter/fallback, namespace, expiry/reconciliation APIs.
  - **Модули:** `src/storage/session/`.
  - **Зависимости:** PL-009, PL-024.
  - **Критерии приёмки:** restart/tab cleanup behavior соответствует ADR; normal/private keys isolated.
  - **Тесты:** restart simulation, expiry, unavailable session API fallback.
  - **Готово, когда:** stale state cannot become effective silently.

- [x] **PL-027 — Реализовать first-run seed**
  - **Цель:** создать defaults и безопасные preset groups один раз.
  - **Требования:** FR-013, раздел 27 PRD.
  - **Действия:** initial config factory, five groups, disabled test-domain rule each, English descriptions.
  - **Модули:** `src/storage/seed/`, locale messages.
  - **Зависимости:** PL-022, PL-024.
  - **Критерии приёмки:** повторный startup не дублирует data; demo rules never route.
  - **Тесты:** empty/partial/existing install fixtures.
  - **Готово, когда:** no real domain lists present.

## Фаза 5. URL normalization

- [x] **PL-028 — Реализовать Origin URL normalization**
  - **Цель:** получить переносимый `scheme://hostname[:port]/`.
  - **Требования:** FR-015–FR-018, раздел 14.1 PRD.
  - **Действия:** standard URL parser, lower-case, Punycode, ports, scheme mapping, typed invalid/internal results.
  - **Модули:** `src/domain/url/normalize-origin.ts`.
  - **Зависимости:** PL-002, PL-020.
  - **Критерии приёмки:** path/query/fragment/credentials отсутствуют; WS/WSS сохраняют target scheme.
  - **Тесты:** exhaustive table IDN/IPv4/IPv6/default ports/malformed/internal.
  - **Готово, когда:** documented examples match exactly.

- [x] **PL-029 — Реализовать Full URL normalization**
  - **Цель:** сформировать Firefox matcher target без fragment.
  - **Требования:** COMPAT-002, COMPAT-006, раздел 14.2 PRD.
  - **Действия:** canonical URL serialization с path/query, compatibility metadata.
  - **Модули:** `src/domain/url/normalize-full-url.ts`.
  - **Зависимости:** PL-028.
  - **Критерии приёмки:** credentials/fragment исключены; query сохранён; Chromium marked incompatible.
  - **Тесты:** encoded paths, empty query, explicit ports, fragments.
  - **Готово, когда:** no network access occurs.

- [x] **PL-030 — Интегрировать локальную PSL**
  - **Цель:** корректно строить Exact hostname и Domain + subdomains.
  - **Требования:** FR-057, SEC-013.
  - **Действия:** выбрать audited local PSL library/data update policy, implement registrable-domain result types.
  - **Модули:** `src/domain/url/registrable-domain.ts`.
  - **Зависимости:** PL-018, PL-028.
  - **Критерии приёмки:** multi-level suffix, IDN, localhost, IP и public suffix обработаны без remote API.
  - **Тесты:** PSL official cases + private suffix policy.
  - **Готово, когда:** dependency rationale recorded.

## Фаза 6. Rule engine

- [x] **PL-031 — Реализовать regex validator**
  - **Цель:** безопасно валидировать pattern/flags до persistence.
  - **Требования:** SEC-001–SEC-002, FR-038–FR-040.
  - **Действия:** allowlist flags, length limit, syntax parse, risk analyzer, normalized error codes.
  - **Модули:** `src/domain/regex/`.
  - **Зависимости:** PL-014.
  - **Критерии приёмки:** stateful/unsupported/dangerous inputs rejected; no eval.
  - **Тесты:** corpus из ADR, ReDoS/injection fixtures.
  - **Готово, когда:** same validator used editor/import/compiler.

- [x] **PL-032 — Реализовать pure resolver**
  - **Цель:** выполнить decision table и first-match semantics.
  - **Требования:** FR-001, FR-006, FR-019, FR-027–FR-032, FR-079–FR-080.
  - **Действия:** override/mode/rule/fallback pipeline, platform compatibility, invalid-reference error, trace.
  - **Модули:** `src/domain/routing/resolve-route.ts`.
  - **Зависимости:** PL-023, PL-028, PL-029, PL-031.
  - **Критерии приёмки:** DIRECT ignores overrides/rules; PROXY/RULES fallback differs; first match wins.
  - **Тесты:** table-driven matrix/property determinism.
  - **Готово, когда:** no browser/storage/time imports.

- [x] **PL-033 — Реализовать reorder и filtering domain services**
  - **Цель:** сохранять единый deterministic priority.
  - **Требования:** FR-030, FR-033–FR-034.
  - **Действия:** atomic move/renumber, query/filter predicates, filtered reorder guard.
  - **Модули:** `src/domain/rules/order.ts`, `filters.ts`.
  - **Зависимости:** PL-022.
  - **Критерии приёмки:** positions unique/contiguous; filtered move returns explicit error.
  - **Тесты:** moves across groups, concurrent revision, all filters.
  - **Готово, когда:** group never changes priority implicitly.

- [x] **PL-034 — Реализовать rule templates и routing tester trace**
  - **Цель:** генерировать editable safe patterns и объяснять full resolution.
  - **Требования:** FR-037–FR-040.
  - **Действия:** ten templates, escaping helpers, single-rule outcome and global trace presenter.
  - **Модули:** `src/domain/rules/templates.ts`, `src/application/routing-tester/`.
  - **Зависимости:** PL-030, PL-031, PL-032.
  - **Критерии приёмки:** generated regex passes validator and matches documented cases.
  - **Тесты:** template golden tests, trace branches.
  - **Готово, когда:** tester reuses resolver, not duplicate logic.

## Фаза 7. PAC compiler

- [x] **PL-035 — Спроектировать safe PAC intermediate representation**
  - **Цель:** исключить raw string injection и отделить normalized data от code emission.
  - **Требования:** SEC-001, SEC-006, FR-075.
  - **Действия:** typed IR for match/action/endpoints, literal serializer, directive allowlist.
  - **Модули:** `src/platform/chromium/pac/ir.ts`, `serialize.ts`.
  - **Зависимости:** PL-013, PL-014, PL-023.
  - **Критерии приёмки:** raw pattern cannot enter executable syntax except escaped data literal.
  - **Тесты:** quotes/newlines/backslashes/Unicode/prototype keys.
  - **Готово, когда:** security review of serializer passes.

- [x] **PL-036 — Реализовать PAC compiler mode/rule semantics**
  - **Цель:** компилировать PROXY/RULES, Origin first-match и separate endpoints.
  - **Требования:** COMPAT-012, FR-015–FR-020, FR-075.
  - **Действия:** emit deterministic `FindProxyForURL`, skip Full URL, no fallback directive, explicit direct fallback only for RULES/rule action.
  - **Модули:** `src/platform/chromium/pac/compiler.ts`.
  - **Зависимости:** PL-006, PL-032, PL-035.
  - **Критерии приёмки:** output stable by snapshot; proxy return contains exactly one assigned proxy and no `DIRECT`.
  - **Тесты:** golden snapshots, modes/schemes/ports/transports.
  - **Готово, когда:** browser PAC parser accepts corpus.

- [x] **PL-037 — Реализовать resolver/PAC parity harness**
  - **Цель:** доказать эквивалентность shared resolver и generated PAC.
  - **Требования:** FR-080, NFR-014, SEC-017.
  - **Действия:** isolated PAC evaluator/browser harness, generated URL/rules corpus, comparison of actions/endpoints.
  - **Модули:** `tests/parity/`.
  - **Зависимости:** PL-032, PL-036.
  - **Критерии приёмки:** 1000-rule and edge corpus has zero unexplained mismatches.
  - **Тесты:** property-based, injection, disabled/incompatible/invalid cases.
  - **Готово, когда:** mismatch fails CI with reproducible seed.

- [x] **PL-038 — Реализовать PAC size/performance validation**
  - **Цель:** enforce limits и coalescing inputs до browser failure.
  - **Требования:** NFR-002–NFR-003, NFR-016.
  - **Действия:** byte/entry checks, compile metrics, actionable diagnostics.
  - **Модули:** `src/platform/chromium/pac/limits.ts`.
  - **Зависимости:** PL-013, PL-036.
  - **Критерии приёмки:** too-large snapshot rejected before apply without losing last applied config.
  - **Тесты:** boundary sizes, 1000 rules, max regex.
  - **Готово, когда:** UI-ready diagnostic returned.

## Фаза 8. Chromium adapter

- [x] **PL-039 — Реализовать Chromium proxy control service**
  - **Цель:** читать level of control и честно блокировать apply.
  - **Требования:** FR-021–FR-023, PL-015 ADR.
  - **Действия:** map ChromeSetting levels, watch changes, expose capabilities.
  - **Модули:** `src/platform/chromium/control.ts`.
  - **Зависимости:** PL-015, PL-019.
  - **Критерии приёмки:** all five PRD statuses represented; no owner-name guessing.
  - **Тесты:** API mocks + manual second-extension/policy.
  - **Готово, когда:** controls can use status without browser branches.

- [x] **PL-040 — Реализовать revisioned Chromium config application**
  - **Цель:** применять direct/PAC без races и false applied state.
  - **Требования:** FR-014, FR-020–FR-023, NFR-002, NFR-004.
  - **Действия:** debounce/coalesce, monotonic revision, apply/read-back, startup restore, error rollback semantics.
  - **Модули:** `src/application/config/`, `src/platform/chromium/apply.ts`.
  - **Зависимости:** PL-024, PL-036, PL-039.
  - **Критерии приёмки:** latest change wins; failed/stale apply never reported active.
  - **Тесты:** rapid updates, worker restart, control loss, API error.
  - **Готово, когда:** persisted and applied revisions visible in diagnostics.

- [x] **PL-041 — Реализовать Chromium routing/error event bridge**
  - **Цель:** обеспечить diagnostics correlation без route duplication.
  - **Требования:** FR-024–FR-025, FR-049, FR-056.
  - **Действия:** classify requests, correlate snapshot decisions, exclude internal check/extension traffic.
  - **Модули:** `src/platform/chromium/events.ts`.
  - **Зависимости:** PL-032, PL-040.
  - **Критерии приёмки:** planned route comes from resolver; path/query/credentials never emitted.
  - **Тесты:** event ordering, missing tab, redirect, internal markers.
  - **Готово, когда:** consumers receive typed redacted events.

## Фаза 9. Firefox adapter

- [x] **PL-042 — Реализовать Firefox capability/control service**
  - **Цель:** представить permissions, control и API limitations единым contract.
  - **Требования:** COMPAT-004–COMPAT-005, COMPAT-010, COMPAT-014.
  - **Действия:** runtime checks, proxy settings observation, incognito and Full URL capabilities.
  - **Модули:** `src/platform/firefox/capabilities.ts`.
  - **Зависимости:** PL-001, PL-004, PL-015.
  - **Критерии приёмки:** UI получает data-driven badges/disabled reasons.
  - **Тесты:** API mocks + Firefox manual.
  - **Готово, когда:** no Firefox conditions enter UI/domain.

- [x] **PL-043 — Реализовать Firefox onRequest routing**
  - **Цель:** применять shared resolver к Origin/Full URL и tab override.
  - **Требования:** FR-030–FR-032, FR-057, COMPAT-002, COMPAT-013.
  - **Действия:** convert RequestDetails→context, resolve, map DIRECT/PROXY/error; для PROXY вернуть один `ProxyInfo` без массива/fallback, для DIRECT применить settings-control semantics по ADR.
  - **Модули:** `src/platform/firefox/routing.ts`.
  - **Зависимости:** PL-004, PL-006, PL-032, PL-042.
  - **Критерии приёмки:** first match/full URL/tab scope work; invalid profile never direct.
  - **Тесты:** integration matrix origin/full URL/fallback/speculative tab.
  - **Готово, когда:** no second rules implementation exists.

- [x] **PL-044 — Реализовать Firefox lifecycle/event bridge**
  - **Цель:** startup restore, errors, control changes и redacted diagnostics.
  - **Требования:** FR-014, FR-024–FR-025, NFR-004.
  - **Действия:** register listeners idempotently, reconcile session state, correlate proxy events.
  - **Модули:** `src/platform/firefox/events.ts`, background entrypoint.
  - **Зависимости:** PL-026, PL-041 patterns, PL-043.
  - **Критерии приёмки:** repeated worker startup не дублирует listeners/state.
  - **Тесты:** restart, request success/failure, control loss.
  - **Готово, когда:** actual vs planned info explicitly distinguished.

## Фаза 10. Proxy authentication

- [x] **PL-045 — Реализовать auth attempt tracker**
  - **Цель:** допустить ровно одну credential attempt на request ID.
  - **Требования:** FR-047–FR-048, SEC-014.
  - **Действия:** record/check/reject/cleanup/timeout APIs, bounded stale cleanup.
  - **Модули:** `src/application/auth/attempt-tracker.ts`.
  - **Зависимости:** PL-026.
  - **Критерии приёмки:** duplicate challenge yields cancel; completed/error/timeout release memory/session.
  - **Тесты:** lifecycle permutations, restart/stale entries.
  - **Готово, когда:** no credentials stored in attempt record.

- [x] **PL-046 — Реализовать challenge-to-profile matcher**
  - **Цель:** отвечать только ожидаемому proxy endpoint.
  - **Требования:** FR-046, SEC-003, SEC-014.
  - **Действия:** require `isProxy`, normalize challenger, match effective endpoint/profile, return redacted failure.
  - **Модули:** `src/application/auth/match-challenge.ts`.
  - **Зависимости:** PL-021, PL-032.
  - **Критерии приёмки:** site auth, unknown endpoint и stale route credentials не получают.
  - **Тесты:** host/port/transport/site-auth/redirect cases.
  - **Готово, когда:** matcher logs only IDs and codes.

- [x] **PL-047 — Реализовать Chromium и Firefox auth adapters**
  - **Цель:** подключить common policy к platform callbacks.
  - **Требования:** FR-046–FR-049, COMPAT-007.
  - **Действия:** asyncBlocking/cancel mapping, lifecycle cleanup, auth failure diagnostic/error page signal.
  - **Модули:** `src/platform/{chromium,firefox}/auth.ts`.
  - **Зависимости:** PL-005, PL-041, PL-044, PL-045, PL-046.
  - **Критерии приёмки:** correct credentials succeed once; wrong credentials cancel without browser loop/prompt where API permits.
  - **Тесты:** local proxy integration on both targets.
  - **Готово, когда:** no credential appears in trace/console/artifact.

## Фаза 11. Proxy profiles UI

- [x] **PL-048 — Реализовать application service для profile CRUD**
  - **Цель:** централизовать create/edit/duplicate/delete и impact analysis.
  - **Требования:** FR-002, FR-035, FR-041–FR-045, FR-053.
  - **Действия:** commands, validation, generated short name, referring-rules query, atomic mutations.
  - **Модули:** `src/application/profiles/`.
  - **Зависимости:** PL-021, PL-024, PL-040, PL-043.
  - **Критерии приёмки:** mutation либо persisted+applied, либо возвращает различимые persist/apply errors; delete не скрывает affected rules.
  - **Тесты:** CRUD, duplicate collision, used-profile impact, rollback.
  - **Готово, когда:** UI не содержит business logic.

- [x] **PL-049 — Создать список и редактор proxy profiles**
  - **Цель:** предоставить полный English UI всех полей профиля.
  - **Требования:** FR-041–FR-045, FR-054, NFR-010.
  - **Действия:** list/empty state/form, same/separate toggle, endpoint transport/host/port/credentials, note/color/check URL.
  - **Модули:** `src/ui/options/proxies/`, locale keys.
  - **Зависимости:** PL-017, PL-048.
  - **Критерии приёмки:** field errors actionable; profile name/short name accompanies color; credentials notice exact.
  - **Тесты:** component keyboard/validation/theme tests.
  - **Готово, когда:** all ProxyProfile fields view/edit/round-trip.

- [x] **PL-050 — Реализовать duplicate/delete/usage dialogs**
  - **Цель:** сделать destructive profile workflows прозрачными.
  - **Требования:** FR-026, FR-035, FR-045, NFR-008.
  - **Действия:** usage list, invalid-rule outcome, confirmation, post-delete navigation/focus.
  - **Модули:** `src/ui/options/proxies/dialogs/`.
  - **Зависимости:** PL-049.
  - **Критерии приёмки:** used profile cannot be silently deleted; cancel is side-effect free.
  - **Тесты:** component + application integration for no-use/used/active-global profile.
  - **Готово, когда:** affected rules remain visible and invalid after confirmed delete.

## Фаза 12. Rules UI

- [x] **PL-051 — Реализовать application service для rules CRUD**
  - **Цель:** атомарные create/edit/duplicate/delete/enable operations.
  - **Требования:** FR-030–FR-036, FR-053.
  - **Действия:** commands, validation, position assignment, invalid reference preservation, config apply.
  - **Модули:** `src/application/rules/`.
  - **Зависимости:** PL-024, PL-031–PL-033, PL-040, PL-043.
  - **Критерии приёмки:** all changes revisioned; duplicate gets new ID/name/position; invalid action rejected.
  - **Тесты:** command table, concurrency, apply failure.
  - **Готово, когда:** rules UI consumes view models/commands only.

- [x] **PL-052 — Создать ordered rules list**
  - **Цель:** показать global priority, validity, group, action и compatibility без двусмысленности.
  - **Требования:** FR-030–FR-035, NFR-016.
  - **Действия:** list rows/cards, position, badges, invalid/deleted-profile states, empty/loading/error states.
  - **Модули:** `src/ui/options/rules/RulesList.vue`.
  - **Зависимости:** PL-017, PL-051.
  - **Критерии приёмки:** Full URL has `Firefox only`; invalid rules remain actionable; color not sole signal.
  - **Тесты:** component snapshots/accessible names/state matrix.
  - **Готово, когда:** list of 1000 remains usable with chosen virtualization strategy.

- [x] **PL-053 — Создать rule editor**
  - **Цель:** безопасно создавать/редактировать Origin и advanced Full URL rules.
  - **Требования:** FR-038–FR-040, COMPAT-002, COMPAT-006.
  - **Действия:** fields, matcher selection, flags, templates, action/profile, regex helper, generated preview.
  - **Модули:** `src/ui/options/rules/RuleEditor.vue`.
  - **Зависимости:** PL-034, PL-051.
  - **Критерии приёмки:** Chromium advanced Full URL requires explicit warning confirmation; save uses shared validator.
  - **Тесты:** all templates, invalid regex/reference, Firefox/Chromium capability view.
  - **Готово, когда:** helper contains all PRD topics in English.

- [x] **PL-054 — Реализовать rule search и filters**
  - **Цель:** искать/фильтровать без скрытого priority mutation.
  - **Требования:** FR-034, раздел 18 Rules PRD.
  - **Действия:** search, group/action/profile/compatibility/enabled filters, clear-all, URL state if appropriate.
  - **Модули:** `src/ui/options/rules/RuleFilters.vue`.
  - **Зависимости:** PL-033, PL-052.
  - **Критерии приёмки:** filter combinations deterministic; reorder disabled with `Clear filters to reorder rules`.
  - **Тесты:** filter matrix, keyboard clear, 1000-rule performance.
  - **Готово, когда:** clearing filters restores unchanged global order.

## Фаза 13. Regex tester

- [x] **PL-055 — Реализовать cancellable regex execution service**
  - **Цель:** проверять untrusted patterns/URL batches без зависания UI.
  - **Требования:** SEC-002, NFR-005, раздел 12 PRD.
  - **Действия:** worker/chunk execution, time budget, cancellation, line/result limits, no-network guarantee.
  - **Модули:** `src/application/regex-tester/`, worker entry.
  - **Зависимости:** PL-029, PL-031.
  - **Критерии приёмки:** pathological/big batch terminates with typed warning; no fetch/browser request.
  - **Тесты:** timeout/cancel/1000 lines/worker failure.
  - **Готово, когда:** main thread threshold is met.

- [x] **PL-056 — Создать Single и Multiple URL tester UI**
  - **Цель:** показать validity, normalized target, match, flags, compatibility и action.
  - **Требования:** разделы 12.1–12.2 PRD, FR-054.
  - **Действия:** single form, multiline input, progressive rows, invalid/compatibility states, copy-safe output.
  - **Модули:** `src/ui/options/rules/RegexTester.vue`.
  - **Зависимости:** PL-053, PL-055.
  - **Критерии приёмки:** every input line has one result; Full URL warning accurate; URL never leaves process.
  - **Тесты:** component cases and no-network assertion.
  - **Готово, когда:** results match domain matcher exactly.

- [x] **PL-057 — Создать Global routing tester UI**
  - **Цель:** объяснить evaluation whole ordered ruleset.
  - **Требования:** FR-037, FR-080.
  - **Действия:** URL/platform/mode context, trace list, first match, final action/profile/fallback and invalid diagnostics.
  - **Модули:** `src/ui/options/rules/RoutingTester.vue`.
  - **Зависимости:** PL-034, PL-056.
  - **Критерии приёмки:** trace differentiates skipped disabled/incompatible/nonmatch/invalid and selected rule.
  - **Тесты:** decision table UI fixtures.
  - **Готово, когда:** output equals resolver result with no duplicate evaluation.

## Фаза 14. Groups and sorting

- [x] **PL-058 — Реализовать group management**
  - **Цель:** организовывать rules без влияния на priority.
  - **Требования:** FR-030, раздел 13 PRD.
  - **Действия:** list/create/rename/delete group with reassignment strategy, preset seed presentation.
  - **Модули:** `src/application/groups/`, `src/ui/options/rules/groups/`.
  - **Зависимости:** PL-027, PL-051.
  - **Критерии приёмки:** rename/move group leaves rule positions unchanged; delete requires destination/confirmation.
  - **Тесты:** group CRUD/order invariance/demo deletion.
  - **Готово, когда:** UI states `Groups do not change rule priority.`

- [x] **PL-059 — Реализовать drag-and-drop global sorting**
  - **Цель:** изменять единственный global order безопасно.
  - **Требования:** FR-033–FR-034, NFR-007.
  - **Действия:** DnD handle, optimistic preview, atomic command, rollback, filtered-view lock.
  - **Модули:** `src/ui/options/rules/RuleSorter.vue`.
  - **Зависимости:** PL-033, PL-052, PL-054.
  - **Критерии приёмки:** cross-group move explicit; failed save restores order; DnD disabled under filter/search.
  - **Тесты:** component/application/E2E sorting.
  - **Готово, когда:** resolver observes exact displayed order after success.

- [x] **PL-060 — Добавить keyboard sorting alternative**
  - **Цель:** сделать reorder доступным без pointer.
  - **Требования:** NFR-007–NFR-009.
  - **Действия:** move up/down/to position controls, announcements, focus preservation.
  - **Модули:** Rules list/sorter locale keys.
  - **Зависимости:** PL-059.
  - **Критерии приёмки:** keyboard operation has same atomic semantics and filter guard.
  - **Тесты:** keyboard-only and screen-reader live-region component tests.
  - **Готово, когда:** all reorder functions work without DnD.

## Фаза 15. Popup

- [x] **PL-061 — Реализовать current-tab inspection service**
  - **Цель:** дать popup/badge один authoritative effective route.
  - **Требования:** FR-004, FR-024–FR-025, FR-050–FR-052, FR-080.
  - **Действия:** retrieve eligible active tab, build context, resolve, merge error/control/capability state.
  - **Модули:** `src/application/inspection/`.
  - **Зависимости:** PL-032, PL-039, PL-042.
  - **Критерии приёмки:** internal/no-permission tabs return explanatory typed state.
  - **Тесты:** mode/rule/override/error/control fixtures.
  - **Готово, когда:** popup and badge share inspection view model.

- [x] **PL-062 — Создать popup status header**
  - **Цель:** быстро показать mode/site/effective route/rule/error.
  - **Требования:** FR-004, FR-052, NFR-012.
  - **Действия:** compact responsive layout, status badges, current hostname, warning and `Open Settings`.
  - **Модули:** `entrypoints/popup/`, `src/ui/popup/`.
  - **Зависимости:** PL-017, PL-061.
  - **Критерии приёмки:** no dense table; planned vs actual/unknown clear; narrow/zoom states usable.
  - **Тесты:** component accessibility/theme/error states.
  - **Готово, когда:** warm/cold popup benchmarks recorded.

- [x] **PL-063 — Реализовать popup global controls**
  - **Цель:** явно менять mode и global proxy.
  - **Требования:** FR-001, FR-028–FR-029, FR-050.
  - **Действия:** segmented mode control, `Use Globally` profile list, disabled/control-conflict handling.
  - **Модули:** `src/ui/popup/GlobalRoutingControls.vue`.
  - **Зависимости:** PL-048, PL-062.
  - **Критерии приёмки:** selecting profile explicitly switches to PROXY; PROXY without profile impossible.
  - **Тесты:** application/component/E2E mode matrix.
  - **Готово, когда:** actions never imply site rule creation.

- [x] **PL-064 — Реализовать popup site actions и retry**
  - **Цель:** начать Once/Always/Edit/Open Directly workflows.
  - **Требования:** FR-005, FR-050–FR-051, FR-057.
  - **Действия:** action chooser, scope, profile/DIRECT, link existing rule, current-error Retry.
  - **Модули:** `src/ui/popup/SiteActions.vue`.
  - **Зависимости:** PL-053, PL-061.
  - **Критерии приёмки:** global/site actions separated; unsupported tab disabled with reason.
  - **Тесты:** exact/domain, once/always, matched/no-rule, error retry.
  - **Готово, когда:** confirmation preview shows regex and action for Always.

## Фаза 16. Temporary overrides

- [x] **PL-065 — Реализовать override application service**
  - **Цель:** создавать/валидировать/remove Once state выше rules.
  - **Требования:** FR-057–FR-059, COMPAT-009.
  - **Действия:** scope pattern generation via PSL, session persist, invalid profile handling, inspection invalidation.
  - **Модули:** `src/application/overrides/`.
  - **Зависимости:** PL-026, PL-030, PL-032.
  - **Критерии приёмки:** override does not enter rules/config export; mode DIRECT ignores it without deleting.
  - **Тесты:** exact/domain, mode changes, deleted profile, private separation.
  - **Готово, когда:** shared resolver consumes stored override.

- [x] **PL-066 — Реализовать tab lifecycle cleanup**
  - **Цель:** удалить Once при tab close/restart и temporary disables по expiry.
  - **Требования:** FR-036, FR-059, NFR-004.
  - **Действия:** tabs/alarms listeners, startup reconciliation, tab ID reuse protection.
  - **Модули:** `src/application/session-lifecycle/`.
  - **Зависимости:** PL-009, PL-026, PL-065.
  - **Критерии приёмки:** stale override cannot apply to reused tab; expired disable re-enables rule automatically.
  - **Тесты:** fake clock, tab close, restart, missed alarm.
  - **Готово, когда:** reconciliation idempotent.

- [x] **PL-067 — Подключить Firefox tab-specific overrides**
  - **Цель:** применить real tab scope where request has reliable tab ID.
  - **Требования:** FR-057, COMPAT-010.
  - **Действия:** context mapping, speculative/invalid ID exclusion, private scope.
  - **Модули:** Firefox routing adapter integration.
  - **Зависимости:** PL-043, PL-065, PL-066.
  - **Критерии приёмки:** same origin in other tab unaffected; speculative request does not inherit.
  - **Тесты:** Firefox integration and manual tabs/private.
  - **Готово, когда:** tab-specific behavior evidenced.

- [x] **PL-068 — Подключить Chromium origin-scoped overrides и warning**
  - **Цель:** compile session override above rules while honestly exposing scope.
  - **Требования:** COMPAT-009, FR-020, FR-075.
  - **Действия:** snapshot override injection, source-tab cleanup regeneration, exact warning in popup/error.
  - **Модули:** snapshot/PAC compiler/UI locales.
  - **Зависимости:** PL-036, PL-040, PL-064–PL-066.
  - **Критерии приёмки:** all same-origin tabs may be affected only until source closes; no hidden fallback.
  - **Тесты:** multi-tab Chromium integration, cleanup race.
  - **Готово, когда:** warning shown before confirmation and on active override.

## Фаза 17. Error page

- [x] **PL-069 — Реализовать redacted error correlation store**
  - **Цель:** связать main-frame failure с safe error context.
  - **Требования:** FR-024, FR-055–FR-056, SEC-003.
  - **Действия:** bounded TTL state keyed by tab/request, hostname-only target, loop token.
  - **Модули:** `src/application/errors/`.
  - **Зависимости:** PL-008, PL-041, PL-044, PL-047.
  - **Критерии приёмки:** missing/expired context fails safely; path/query/credentials absent.
  - **Тесты:** redirects, tab close, duplicate event, auth failure, expiry.
  - **Готово, когда:** store cannot trigger internal redirect loop.

- [x] **PL-070 — Создать error page UI**
  - **Цель:** объяснить proxy failure и доступные recovery actions.
  - **Требования:** раздел 19 PRD, FR-054–FR-056.
  - **Действия:** render title/reason/code/profile/hostname/rule/time, Retry/Switch/Open Directly Once/Open Settings.
  - **Модули:** error entrypoint, `src/ui/error/`.
  - **Зависимости:** PL-017, PL-069.
  - **Критерии приёмки:** absent data shown honestly; credentials/full URL never rendered; keyboard/focus correct.
  - **Тесты:** component/accessibility/all action states.
  - **Готово, когда:** Chromium scope warning exact on direct-once.

- [x] **PL-071 — Реализовать best-effort error navigation coordinator**
  - **Цель:** открыть own page только для supported main-frame errors.
  - **Требования:** FR-055–FR-056, COMPAT-008.
  - **Действия:** classify, guard, tab update, retry original URL via transient secure state, background/download exclusions.
  - **Модули:** `src/platform/*/error-navigation.ts`.
  - **Зависимости:** PL-008, PL-069, PL-070.
  - **Критерии приёмки:** no subresource/internal redirect; retry/switch/direct flows work where supported.
  - **Тесты:** browser integration failure classes and loop regression.
  - **Готово, когда:** unsupported errors remain logged and UI/docs call behavior best effort.

## Фаза 18. Logging

- [x] **PL-072 — Реализовать IndexedDB log repository**
  - **Цель:** bounded persistent ring buffer без storage.local rewrite.
  - **Требования:** FR-060–FR-062, PRIV-002, NFR-006.
  - **Действия:** schema/indexes, append batch, trim oldest >1000, page/query/clear.
  - **Модули:** `src/storage/logs/`.
  - **Зависимости:** PL-018.
  - **Критерии приёмки:** ordering stable, limit exact, transactional clear/trim.
  - **Тесты:** 1001+, concurrent batches, DB upgrade/failure.
  - **Готово, когда:** no array rewrite per event.

- [x] **PL-073 — Реализовать logging policy и redaction**
  - **Цель:** собирать только разрешённые fields/modes.
  - **Требования:** FR-060–FR-062, PRIV-001–PRIV-002, PRIV-009.
  - **Действия:** event→entry mapping, default/advanced filters, disabled/pause, internal/private handling.
  - **Модули:** `src/application/logging/`.
  - **Зависимости:** PL-041, PL-044, PL-072.
  - **Критерии приёмки:** forbidden path/query/body/headers/cookies/credentials structurally impossible.
  - **Тесты:** redaction/property tests, logging modes, private session.
  - **Готово, когда:** log schema contains only PRD allowlist.

- [x] **PL-074 — Реализовать in-memory private log**
  - **Цель:** optional transient diagnostics без persistence.
  - **Требования:** PRIV-001, PRIV-004.
  - **Действия:** bounded memory buffer per private session, clear on last private close, never export.
  - **Модули:** `src/application/logging/private-buffer.ts`.
  - **Зависимости:** PL-010, PL-073.
  - **Критерии приёмки:** IndexedDB spy sees zero private writes; normal/private views isolated.
  - **Тесты:** concurrent windows, last-close, restart.
  - **Готово, когда:** private entries cannot survive process/session.

- [x] **PL-075 — Создать Logs UI**
  - **Цель:** искать/фильтровать/очищать/pause и переходить к entities.
  - **Требования:** раздел 18 Logs PRD, NFR-012.
  - **Действия:** paginated/virtualized list, planned vs actual, filters/search, links, empty/privacy notices.
  - **Модули:** `src/ui/options/logs/`.
  - **Зависимости:** PL-073, PL-074.
  - **Критерии приёмки:** first page only loaded; clear confirmed; missing entity link handled.
  - **Тесты:** component/performance/accessibility/navigation.
  - **Готово, когда:** 1000 entries do not create 1000 DOM rows.

## Фаза 19. Manual proxy check

- [x] **PL-076 — Реализовать pluggable IP/GeoIP provider**
  - **Цель:** manual-only external IP/country lookup с видимым endpoint.
  - **Требования:** FR-007, FR-063–FR-064, PRIV-003, PRIV-006–PRIV-007.
  - **Действия:** provider config, timeout/size/schema/IP validation, GeoIP off, candidate privacy gate.
  - **Модули:** `src/application/proxy-check/providers/`.
  - **Зависимости:** PL-018, provider pre-release review.
  - **Критерии приёмки:** no background call; malformed response typed; custom endpoint previewed.
  - **Тесты:** mocked success/timeout/non-2xx/malformed/oversize/IP variants.
  - **Готово, когда:** retention disclosure shown for default candidate or default left empty.

- [x] **PL-077 — Реализовать common proxy check orchestration**
  - **Цель:** измерить allowed metrics и сохранить last result.
  - **Требования:** FR-043, FR-063–FR-066.
  - **Действия:** one-at-a-time state machine, total timing, status/IP/country mapping, connect duration optional, cancellation/finally.
  - **Модули:** `src/application/proxy-check/service.ts`.
  - **Зависимости:** PL-048, PL-076.
  - **Критерии приёмки:** unavailable connect timing is null/`Not available`; only last manual result persists.
  - **Тесты:** state transitions, concurrent click, cancel, profile edit/delete.
  - **Готово, когда:** credentials absent from provider payload/error.

- [x] **PL-078 — Реализовать Chromium targeted test PAC/recovery**
  - **Цель:** проверить inactive profile безопасной ADR-approved strategy.
  - **Требования:** FR-065–FR-066, SEC-011.
  - **Действия:** high-priority endpoint-origin override, mutex, prior snapshot marker, finally/startup restore, log exclusion.
  - **Модули:** `src/platform/chromium/proxy-check.ts`.
  - **Зависимости:** PL-007, PL-040, PL-077.
  - **Критерии приёмки:** unrelated routing unchanged; recovery succeeds after injected worker termination.
  - **Тесты:** full Chromium integration crash/timeout/config-change.
  - **Готово, когда:** unsafe ADR outcome triggers documented alternate UX instead of implementation.

- [x] **PL-079 — Создать Manual Check UI**
  - **Цель:** явно запускать check и показывать endpoint/results.
  - **Требования:** FR-007, FR-043, FR-063–FR-066, FR-054.
  - **Действия:** confirm endpoint/provider, progress/cancel, availability/durations/IP/country/status/error/time.
  - **Модули:** profile editor/check result components, General provider settings.
  - **Зависимости:** PL-049, PL-077, PL-078.
  - **Критерии приёмки:** no automatic trigger on view/startup; GeoIP disable state clear.
  - **Тесты:** component/E2E success/failure/Not available/privacy notice.
  - **Готово, когда:** one concurrent check enforced in UI and service.

## Фаза 20. Native import/export

- [x] **PL-080 — Определить versioned native export schema**
  - **Цель:** стабильный product-name-independent format.
  - **Требования:** FR-067–FR-070, FR-076, SEC-009.
  - **Действия:** JSON schema, format/schema versions, credential-omitted/included variants, limits and fixtures.
  - **Модули:** `src/domain/import-export/native-schema.ts`, `tests/fixtures/import/`.
  - **Зависимости:** PL-021–PL-023.
  - **Критерии приёмки:** all PRD entities/settings round-trip; display name irrelevant.
  - **Тесты:** schema/golden/unknown keys/limits.
  - **Готово, когда:** schema documented and migration hook exists.

- [x] **PL-081 — Реализовать safe export**
  - **Цель:** выдавать JSON без credentials по умолчанию.
  - **Требования:** FR-067, PRIV-008, SEC-003.
  - **Действия:** DTO mapper, opt-in secret inclusion, deterministic serialization, safe filename.
  - **Модули:** `src/application/import-export/export.ts`.
  - **Зависимости:** PL-080.
  - **Критерии приёмки:** default output has no username/password values/keys per schema policy; opt-in warning required.
  - **Тесты:** secret scans, round-trip, unusual strings.
  - **Готово, когда:** export never includes logs/session/transient state.

- [x] **PL-082 — Реализовать preview/merge/replace import engine**
  - **Цель:** атомарно импортировать untrusted JSON.
  - **Требования:** FR-068–FR-070, SEC-004, SEC-009, SEC-012.
  - **Действия:** size/depth parse, schema migration, duplicate/remap plan, preview, transaction, backup/rollback/report.
  - **Модули:** `src/application/import-export/import.ts`.
  - **Зависимости:** PL-025, PL-080.
  - **Критерии приёмки:** no partial import; references remapped; replace double-confirmed; prototype keys inert.
  - **Тесты:** corrupt/oversize/duplicate/interrupted/old-version/credentials fixtures.
  - **Готово, когда:** failure leaves byte-equivalent prior logical config.

- [x] **PL-083 — Создать Native Import & Export UI**
  - **Цель:** дать preview, merge/replace, credentials consent и report.
  - **Требования:** FR-067–FR-070, FR-026, FR-054.
  - **Действия:** file picker/drop, preview counts/conflicts, credential checkbox/warning, result/download.
  - **Модули:** `src/ui/options/import-export/native/`.
  - **Зависимости:** PL-081, PL-082.
  - **Критерии приёмки:** replace impossible without explicit confirmation; no-success report for zero changes.
  - **Тесты:** component/E2E merge/replace/cancel/error/secret warning.
  - **Готово, когда:** imported config is applied and report links issues.

## Фаза 21. FoxyProxy import

- [x] **PL-084 — Собрать FoxyProxy fixture corpus и parser contracts**
  - **Цель:** ограничить поддержку воспроизводимыми modern JSON variants.
  - **Требования:** FR-071–FR-072, SEC-009.
  - **Действия:** документировать provenance/redact fixtures, adapter detection, supported endpoint fields, skipped reasons.
  - **Модули:** `tests/fixtures/foxyproxy/`, `src/domain/import-export/foxyproxy/contracts.ts`.
  - **Зависимости:** PL-080.
  - **Критерии приёмки:** каждый claimed variant имеет fixture; rules/patterns/groups/subscriptions/logs explicitly excluded.
  - **Тесты:** fixture classification and zero-profile cases.
  - **Готово, когда:** unsupported historical formats are not advertised.

- [x] **PL-085 — Реализовать adapter-based FoxyProxy parsers**
  - **Цель:** best-effort извлечь только HTTP/HTTPS proxy profiles.
  - **Требования:** FR-071–FR-072, SEC-003, SEC-009.
  - **Действия:** parse adapters, field normalization, skip unsupported types, duplicate-name suggestions, safe credentials mapping.
  - **Модули:** `src/application/import-export/foxyproxy/`.
  - **Зависимости:** PL-021, PL-084.
  - **Критерии приёмки:** supported profiles valid; unsupported fields reported; zero imports is failure.
  - **Тесты:** all fixtures, malformed/prototype/oversize, SOCKS skip, name collisions.
  - **Готово, когда:** no FoxyProxy rule enters ProxyLoom rules.

- [x] **PL-086 — Создать FoxyProxy preview/import UI**
  - **Цель:** показать found/skipped profiles и разрешить collisions.
  - **Требования:** FR-071–FR-072, FR-026, FR-054.
  - **Действия:** file workflow, adapter label, selectable profiles, skipped explanations, rename/conflict resolution, result.
  - **Модули:** `src/ui/options/import-export/foxyproxy/`.
  - **Зависимости:** PL-048, PL-085.
  - **Критерии приёмки:** existing profiles never silently overwritten; user sees unsupported fields.
  - **Тесты:** component/E2E success/partial/zero/collision/cancel.
  - **Готово, когда:** imported profiles pass normal profile validation.

## Фаза 22. Incognito

- [x] **PL-087 — Реализовать incognito capability/status service**
  - **Цель:** определить доступ и показать browser-owned enablement instructions.
  - **Требования:** FR-073, COMPAT-010.
  - **Действия:** runtime access check, browser-specific help model, change/restart refresh.
  - **Модули:** `src/application/incognito/`, platform capability adapters.
  - **Зависимости:** PL-010, PL-042.
  - **Критерии приёмки:** extension never claims it can enable permission; unknown status honest.
  - **Тесты:** granted/denied/unavailable mocks and manual.
  - **Готово, когда:** General shows actionable English status.

- [x] **PL-088 — Изолировать private routing/session state**
  - **Цель:** применять persistent config, не смешивая overrides/tab correlations.
  - **Требования:** FR-058, FR-074, COMPAT-010.
  - **Действия:** incognito key in contexts/repositories, spanning/split behavior per ADR, cleanup.
  - **Модули:** routing context/session repositories/platform bridges.
  - **Зависимости:** PL-026, PL-065–PL-067, PL-087.
  - **Критерии приёмки:** normal override never affects private and vice versa; persistent profiles/rules shared as documented.
  - **Тесты:** cross-window integration and restart.
  - **Готово, когда:** private state isolation evidence exists for both families.

- [x] **PL-089 — Добавить incognito privacy UI и tests**
  - **Цель:** объяснить storage/log behavior и verify no persistence.
  - **Требования:** PRIV-001, PRIV-004, PRIV-010.
  - **Действия:** General/About notices, private log indicator, diagnostics exclusion.
  - **Модули:** options General/Logs/About locale and views.
  - **Зависимости:** PL-074, PL-087–PL-088.
  - **Критерии приёмки:** private data absent after closing last private session and from export.
  - **Тесты:** UI, IndexedDB/storage spies, manual matrices.
  - **Готово, когда:** store disclosure matches behavior.

## Фаза 23. WebSocket/downloads

- [x] **PL-090 — Интегрировать WS/WSS routing**
  - **Цель:** route handshake через HTTP/HTTPS endpoint mapping.
  - **Требования:** FR-015–FR-016, раздел 25 PRD.
  - **Действия:** request classification, PAC/Firefox mapping, handshake logging and established-message limitation.
  - **Модули:** domain request types, platform event/routing adapters.
  - **Зависимости:** PL-012, PL-036, PL-043, PL-073.
  - **Критерии приёмки:** ws→HTTP endpoint, wss→HTTPS endpoint; handshake failure logged; messages not claimed.
  - **Тесты:** local WS/WSS integration through distinct proxies.
  - **Готово, когда:** no-fallback case passes.

- [x] **PL-091 — Интегрировать download routing и failure notification**
  - **Цель:** применять URL route без случайной error page.
  - **Требования:** FR-017, FR-049, FR-056.
  - **Действия:** download request correlation, log event, safe notification and Settings link where permission justified.
  - **Модули:** platform download adapter, notification service.
  - **Зависимости:** PL-012, PL-071, PL-073.
  - **Критерии приёмки:** download follows scheme endpoint; failure never redirects arbitrary tab.
  - **Тесты:** HTTP/HTTPS download success/failure/cancel on both families.
  - **Готово, когда:** permission rationale/manifest updated from spike evidence.

- [x] **PL-092 — Добавить WS/download diagnostics scenarios**
  - **Цель:** сделать limitations/errors видимыми в Logs/About.
  - **Требования:** FR-009, NFR-016.
  - **Действия:** request type labels, error codes, planned route and limitation copy.
  - **Модули:** Logs/About UI and locale.
  - **Зависимости:** PL-075, PL-090–PL-091.
  - **Критерии приёмки:** UI distinguishes handshake/download and does not imply payload visibility.
  - **Тесты:** component fixtures and manual matrix entries.
  - **Готово, когда:** linked profile/rule navigation works.

## Фаза 24. Themes and accessibility

- [x] **PL-093 — Реализовать System/Light/Dark theme service**
  - **Цель:** единая persistent appearance across surfaces.
  - **Требования:** FR-013, NFR-011.
  - **Действия:** setting, system listener, early theme application avoiding flash, semantic tokens.
  - **Модули:** `src/ui/theme/`, Appearance view.
  - **Зависимости:** PL-017, PL-024.
  - **Критерии приёмки:** all three themes update popup/options/error; System tracks OS.
  - **Тесты:** component/E2E persistence/system change.
  - **Готово, когда:** profile colors retain required contrast treatment.

- [x] **PL-094 — Провести keyboard/focus audit**
  - **Цель:** все actions доступны с keyboard и focus predictable.
  - **Требования:** NFR-007–NFR-009.
  - **Действия:** tab order, dialogs focus trap/restore, async mutation focus, DnD alternative, skip/navigation.
  - **Модули:** all UI surfaces, accessibility test helpers.
  - **Зависимости:** PL-050, PL-053–PL-060, PL-062–PL-064, PL-070, PL-075, PL-079, PL-083, PL-086.
  - **Критерии приёмки:** documented keyboard walkthrough completes without pointer.
  - **Тесты:** automated keyboard paths + manual screen reader smoke.
  - **Готово, когда:** no critical focus loss/trap.

- [x] **PL-095 — Провести semantics/contrast/zoom audit**
  - **Цель:** WCAG 2.2 AA и usable popup/options.
  - **Требования:** NFR-010–NFR-012.
  - **Действия:** accessible names, labels/errors/live regions, contrast, non-color cues, 200% zoom/reduced motion.
  - **Модули:** shared UI primitives/styles and surfaces.
  - **Зависимости:** PL-093, PL-094.
  - **Критерии приёмки:** automated scanner clean for critical issues; manual exceptions documented/fixed.
  - **Тесты:** axe-equivalent, contrast, zoom viewports, reduced motion.
  - **Готово, когда:** accessibility checklist signed.

- [x] **PL-096 — Оптимизировать popup/options responsiveness**
  - **Цель:** выполнить performance thresholds без потери accessibility.
  - **Требования:** NFR-002–NFR-005, NFR-012.
  - **Действия:** measure cold/warm popup, lazy sections, list virtualization, worker batch, render profiling.
  - **Модули:** UI entrypoints/data loaders/performance tests.
  - **Зависимости:** PL-052, PL-055, PL-062, PL-075, PL-093.
  - **Критерии приёмки:** PRD threshold table met on documented reference environment.
  - **Тесты:** repeatable benchmark suite with p95 report.
  - **Готово, когда:** regressions have CI/manual budget gate.

## Фаза 25. Unit tests

- [x] **PL-097 — Завершить domain unit coverage**
  - **Цель:** закрыть normalization, PSL, regex, models, priority, modes, compatibility.
  - **Требования:** раздел 33 PRD, NFR-001, NFR-014.
  - **Действия:** table/property tests for every resolver branch and URL/template edge.
  - **Модули:** `tests/unit/domain/`.
  - **Зависимости:** PL-021–PL-034.
  - **Критерии приёмки:** requirement-to-test map complete; mutation/branch gaps reviewed.
  - **Тесты:** указанный suite является результатом задачи.
  - **Готово, когда:** deleted references/session overrides/temp disables explicitly covered.

- [x] **PL-098 — Завершить storage/import/log unit coverage**
  - **Цель:** доказать migrations, atomic import/export, Foxy parsing и ring buffer.
  - **Требования:** FR-060–FR-072, FR-076–FR-078, SEC-004, SEC-009.
  - **Действия:** corruption/interruption/limit/duplicate/secret/property fixtures.
  - **Модули:** `tests/unit/storage/`, `tests/unit/import-export/`, `tests/unit/logging/`.
  - **Зависимости:** PL-025–PL-027, PL-072–PL-074, PL-080–PL-085.
  - **Критерии приёмки:** every failure path leaves prior state or typed report.
  - **Тесты:** suite itself plus secret scan snapshots.
  - **Готово, когда:** migration from every supported schema version passes.

- [x] **PL-099 — Завершить PAC/auth/application unit coverage**
  - **Цель:** доказать escaping/parity/apply races/auth attempts/control mapping.
  - **Требования:** FR-020–FR-023, FR-046–FR-049, FR-075, SEC-001, SEC-014.
  - **Действия:** adversarial serializer corpus, fake timers/events, revision races, challenge mapping.
  - **Модули:** `tests/unit/pac/`, `tests/unit/auth/`, `tests/unit/application/`.
  - **Зависимости:** PL-035–PL-047.
  - **Критерии приёмки:** raw injection cannot alter PAC; second auth challenge cancels; stale apply ignored.
  - **Тесты:** suite itself and property seeds stored on failure.
  - **Готово, когда:** PAC parity is a required test command.

## Фаза 26. Integration test infrastructure

- [x] **PL-100 — Создать local origin/check servers**
  - **Цель:** deterministic HTTP/HTTPS/WS/WSS/download targets без публичной сети.
  - **Требования:** NFR-013, раздел 33.2 PRD.
  - **Действия:** certificates, request capture, auth origin negative fixture, delays/errors/status/IP JSON.
  - **Модули:** `tests/integration/servers/`.
  - **Зависимости:** PL-018.
  - **Критерии приёмки:** isolated parallel runs, explicit ports, clean teardown.
  - **Тесты:** infrastructure self-tests.
  - **Готово, когда:** no random public proxy/service dependency.

- [x] **PL-101 — Создать local test proxies**
  - **Цель:** управляемые HTTP/HTTPS transports, CONNECT auth и failures.
  - **Требования:** NFR-013, SEC-017.
  - **Действия:** distinct endpoint markers, basic auth, wrong auth, refuse/hang/drop, traffic capture.
  - **Модули:** `tests/integration/proxies/`.
  - **Зависимости:** PL-100.
  - **Критерии приёмки:** test can prove proxy vs direct from capture; credentials redacted in output.
  - **Тесты:** proxy self-tests for HTTP/CONNECT/TLS/failures.
  - **Готово, когда:** CI certificates/secrets are ephemeral.

- [x] **PL-102 — Создать browser integration harness**
  - **Цель:** load unpacked builds, drive browser/network и collect safe evidence.
  - **Требования:** COMPAT-015, NFR-017.
  - **Действия:** profiles, extension ID discovery, background access, clean user data, artifact redaction.
  - **Модули:** `tests/integration/harness/`.
  - **Зависимости:** PL-011, PL-016, PL-100–PL-101.
  - **Критерии приёмки:** Chromium automated; Firefox per ADR; failures reproducible locally/CI.
  - **Тесты:** harness smoke/retry/cleanup.
  - **Готово, когда:** tests never reuse developer browser profile.

- [x] **PL-103 — Реализовать critical routing integration matrix**
  - **Цель:** gate no-fallback, endpoints, auth, override, restart/control/incognito/error/check.
  - **Требования:** SEC-017 и весь список раздела 33.2 PRD.
  - **Действия:** parameterized cases across supported automated targets with local captures.
  - **Модули:** `tests/integration/specs/`.
  - **Зависимости:** PL-047, PL-067–PL-078, PL-088, PL-090–PL-091, PL-102.
  - **Критерии приёмки:** every required scenario pass/explicit platform skip with ADR; no silent skip.
  - **Тесты:** suite itself.
  - **Готово, когда:** unreachable proxy capture proves zero direct requests.

## Фаза 27. Playwright E2E

- [x] **PL-104 — Создать Chromium extension E2E fixtures**
  - **Цель:** stable persistent-context access к popup/options/service worker.
  - **Требования:** раздел 33.3 PRD, REL-003.
  - **Действия:** load build, seed/reset storage, open surfaces, test IDs/accessibility selectors, screenshots redaction.
  - **Модули:** `tests/e2e/fixtures/`.
  - **Зависимости:** PL-102.
  - **Критерии приёмки:** parallel-safe deterministic fixture on bundled Chromium.
  - **Тесты:** fixture smoke/headless supported mode.
  - **Готово, когда:** no dependence on Chrome/Edge sideload flags.

- [x] **PL-105 — Покрыть core CRUD/routing E2E**
  - **Цель:** проверить popup/options/profile/rule/mode/override flows end to end.
  - **Требования:** FR-001–FR-005, FR-041–FR-059.
  - **Действия:** profile CRUD, rules CRUD/DnD, tester, mode switching, Once/Always/Edit/Retry.
  - **Модули:** `tests/e2e/core/`.
  - **Зависимости:** PL-104 и соответствующие UI tasks.
  - **Критерии приёмки:** visible UI state and persisted/applied state asserted.
  - **Тесты:** suite itself; retry only for proven flaky browser startup with diagnostic.
  - **Готово, когда:** all named PRD Playwright core flows covered.

- [x] **PL-106 — Покрыть import/theme/error E2E и Firefox smoke**
  - **Цель:** завершить UI E2E и выполнить ADR-selected Firefox check.
  - **Требования:** FR-054–FR-072, NFR-011, COMPAT-015.
  - **Действия:** native/Foxy import, theme persistence, validation/control/error states; Firefox smoke via selected tooling or documented integration/manual fallback.
  - **Модули:** `tests/e2e/extended/`, `tests/smoke/firefox/`.
  - **Зависимости:** PL-011, PL-083, PL-086, PL-093, PL-104.
  - **Критерии приёмки:** no fake Firefox Playwright claim; unsupported flow explicitly gated elsewhere.
  - **Тесты:** suite itself.
  - **Готово, когда:** E2E limitations documented in README/testing docs.

## Фаза 28. CI

- [ ] **PL-107 — Создать CI quality workflow**
  - **Цель:** запускать frozen install, lint, format, typecheck, unit на PR/push.
  - **Требования:** REL-002–REL-003, SEC-013.
  - **Действия:** pin Node LTS/pnpm, dependency cache by lockfile, least permissions, concurrency cancellation.
  - **Модули:** `.github/workflows/ci.yml`.
  - **Зависимости:** PL-018, PL-097–PL-099.
  - **Критерии приёмки:** any gate failure blocks job; lockfile mismatch fails.
  - **Тесты:** workflow run on branch with intentional failure then clean run.
  - **Готово, когда:** required checks documented.

- [ ] **PL-108 — Добавить integration и Playwright jobs**
  - **Цель:** automated browser gates с local infrastructure.
  - **Требования:** REL-003, NFR-013.
  - **Действия:** install browsers/deps, certificates, service lifecycle, artifact redaction, retry policy.
  - **Модули:** CI workflow and test scripts.
  - **Зависимости:** PL-103–PL-106, PL-107.
  - **Критерии приёмки:** jobs run clean hosted runner; failure uploads safe traces.
  - **Тесты:** pass/fail workflow runs.
  - **Готово, когда:** no external random proxy dependency.

- [x] **PL-109 — Добавить dual build и artifact jobs**
  - **Цель:** собирать Chromium/Firefox on PR/push.
  - **Требования:** REL-003, REL-005–REL-007.
  - **Действия:** WXT builds/zips, artifact naming, manifest/content validation, upload retention.
  - **Модули:** CI workflow, package scripts.
  - **Зависимости:** PL-016, PL-107.
  - **Критерии приёмки:** two installable artifacts produced from same commit; forbidden files absent.
  - **Тесты:** artifact smoke install/manifest inspection.
  - **Готово, когда:** artifact names include product target/version.

## Фаза 29. GitHub releases

- [x] **PL-110 — Реализовать tag/version validation**
  - **Цель:** принимать только согласованный `v*` release version.
  - **Требования:** REL-004.
  - **Действия:** validate semver tag vs manifest/package centralized version, fail on dirty mismatch.
  - **Модули:** release script, `.github/workflows/release.yml`.
  - **Зависимости:** PL-109.
  - **Критерии приёмки:** mismatch/invalid prerelease policy fails before build.
  - **Тесты:** valid/invalid tag fixtures.
  - **Готово, когда:** version has one authoritative source.

- [x] **PL-111 — Реализовать release build/checksums/notes**
  - **Цель:** создать два ZIP, SHA-256 и release notes после all gates.
  - **Требования:** REL-004–REL-007.
  - **Действия:** reuse quality jobs, clean build, checksum manifest, generated notes, Firefox source review package if required.
  - **Модули:** release workflow/scripts.
  - **Зависимости:** PL-108–PL-110.
  - **Критерии приёмки:** checksums verify downloaded artifacts; names exact; gates cannot be bypassed.
  - **Тесты:** dry-run/tag test repository or workflow dispatch simulation.
  - **Готово, когда:** build provenance/commit recorded.

- [ ] **PL-112 — Создать GitHub Release без store publication**
  - **Цель:** приложить artifacts/checksums и остановиться до stores.
  - **Требования:** REL-001, REL-004, REL-008.
  - **Действия:** least-privilege release permission, upload, notes, failure/idempotency handling.
  - **Модули:** release workflow.
  - **Зависимости:** PL-111.
  - **Критерии приёмки:** tag creates one release; no store credentials/actions exist.
  - **Тесты:** release dry run and permissions review.
  - **Готово, когда:** manual store checklist remains separate.

## Фаза 30. Documentation and store readiness

- [x] **PL-113 — Создать English README и user guide**
  - **Цель:** объяснить modes, rules, setup, privacy and limitations.
  - **Требования:** FR-079, COMPAT-002, COMPAT-008–COMPAT-010.
  - **Действия:** English docs, screenshots without secrets, Once warning, Firefox-only/full URL, no fallback.
  - **Модули:** `README.md`, `docs/user-guide/`.
  - **Зависимости:** stable UI and PL-095.
  - **Критерии приёмки:** no feature overclaim; commands match package.
  - **Тесты:** link/spell/command verification.
  - **Готово, когда:** new user can install and configure one profile/rule.

- [x] **PL-114 — Подготовить privacy disclosure**
  - **Цель:** прозрачно описать permissions, local credentials/logs и manual provider.
  - **Требования:** PRIV-005–PRIV-012, SEC-007.
  - **Действия:** English privacy policy/store answers, data inventory/retention, provider disclosure, incognito behavior.
  - **Модули:** `docs/privacy.md`, store metadata.
  - **Зависимости:** PL-076, PL-089.
  - **Критерии приёмки:** behavior and permissions inventory match builds; no encrypted-vault claim.
  - **Тесты:** privacy checklist and manifest diff review.
  - **Готово, когда:** disclosure ready for all stores.

- [ ] **PL-115 — Подготовить store assets/metadata**
  - **Цель:** собрать truthful English listings для Chrome/Firefox/Edge/Yandex as applicable.
  - **Требования:** REL-008, NFR-010, R-12.
  - **Действия:** centralized brand legal check, descriptions, icons/screenshots, permission explanations, support links.
  - **Модули:** `store/`, product config.
  - **Зависимости:** PL-113–PL-114, final branding decision.
  - **Критерии приёмки:** assets meet current store dimensions/policies; screenshots have no real browsing data.
  - **Тесты:** store checklist and centralized-name substitution build.
  - **Готово, когда:** no hardcoded old brand remains.

- [ ] **PL-116 — Создать About / Diagnostics**
  - **Цель:** дать safe support snapshot и browser limitation status.
  - **Требования:** FR-009, FR-021–FR-023, NFR-016.
  - **Действия:** app/build/browser/schema/capabilities/control/applied revision, copy redaction, support/privacy links.
  - **Модули:** `src/ui/options/about/`.
  - **Зависимости:** PL-039–PL-044, PL-069, PL-114.
  - **Критерии приёмки:** copied diagnostics have no credentials/path/query/private data.
  - **Тесты:** redaction/component/capability matrix.
  - **Готово, когда:** support can distinguish persisted vs applied state.

## Фаза 31. Security review

- [x] **PL-117 — Провести PAC/regex security review**
  - **Цель:** независимо проверить injection, ReDoS и fail-closed outputs.
  - **Требования:** SEC-001–SEC-002, SEC-006, SEC-017–SEC-018.
  - **Действия:** adversarial corpus/fuzz, code review, timeout/size/flags, PAC directive inspection.
  - **Модули:** compiler/validator/tester and security report.
  - **Зависимости:** PL-031, PL-035–PL-038, PL-055, PL-099.
  - **Критерии приёмки:** no critical/high finding; residual risk documented.
  - **Тесты:** fuzz/property/parity/no-fallback suites.
  - **Готово, когда:** report signed and fixes regression-tested.

- [x] **PL-118 — Провести import/storage security review**
  - **Цель:** проверить untrusted JSON, migrations, atomicity and secret handling.
  - **Требования:** SEC-004, SEC-008–SEC-009, SEC-012, PRIV-008.
  - **Действия:** prototype pollution/depth/size/corruption/interruption tests, export secret scan.
  - **Модули:** repositories/importers and security report.
  - **Зависимости:** PL-025, PL-080–PL-086, PL-098.
  - **Критерии приёмки:** malicious import cannot execute, corrupt active config or leak secret.
  - **Тесты:** adversarial fixture corpus.
  - **Готово, когда:** rollback evidence retained.

- [x] **PL-119 — Провести permissions/CSP/dependency review**
  - **Цель:** минимизировать browser power и supply-chain exposure.
  - **Требования:** SEC-005, SEC-007, SEC-013, SEC-016.
  - **Действия:** per-target manifest diff, permission traceability, CSP/remote-code scan, licenses/audit/lockfile.
  - **Модули:** manifests/build outputs/dependency reports.
  - **Зависимости:** PL-109, PL-115.
  - **Критерии приёмки:** every permission maps to PRD; no remote JS/eval; unresolved high dependency issue absent.
  - **Тесты:** static artifact scan and install-warning capture.
  - **Готово, когда:** report includes accepted residual risks.

- [x] **PL-120 — Провести credential/privacy leak review**
  - **Цель:** найти secrets/full URLs в logs/messages/errors/telemetry/artifacts.
  - **Требования:** SEC-003, SEC-008, SEC-015, PRIV-005–PRIV-012.
  - **Действия:** seeded canary credentials/paths, inspect console/storage/IDB/export/traces/screenshots/network.
  - **Модули:** end-to-end product and privacy report.
  - **Зависимости:** PL-103, PL-106, PL-114, PL-116.
  - **Критерии приёмки:** canaries appear only in allowed local credential storage/opt-in export/browser auth boundary.
  - **Тесты:** automated secret scan + manual network capture.
  - **Готово, когда:** no external URL/credential transmission except disclosed manual check target request.

## Фаза 32. Cross-browser release verification

- [ ] **PL-121 — Выполнить Chrome manual matrix**
  - **Цель:** подписать release behavior на current stable Chrome.
  - **Требования:** COMPAT-015, SEC-017, acceptance section PRD.
  - **Действия:** выполнить Chrome checklist ниже на clean profile, записать OS/browser/build/checksum/results.
  - **Модули:** `docs/release-verification/chrome-<version>.md`.
  - **Зависимости:** PL-103, PL-109, PL-117–PL-120.
  - **Критерии приёмки:** all mandatory cases pass; deviations linked to approved limitation/issue.
  - **Тесты:** manual matrix является тестом.
  - **Готово, когда:** no open critical/high routing/auth/privacy defect.

- [ ] **PL-122 — Выполнить Firefox manual matrix**
  - **Цель:** подписать MV3/full URL/tab override/fallback behavior на current stable Firefox.
  - **Требования:** COMPAT-002, COMPAT-013–COMPAT-015, SEC-017.
  - **Действия:** выполнить Firefox checklist, включая manual proxy setting and private window.
  - **Модули:** `docs/release-verification/firefox-<version>.md`.
  - **Зависимости:** PL-103, PL-106, PL-109, PL-117–PL-120.
  - **Критерии приёмки:** single-`ProxyInfo` fail-closed evidence, settings-control semantics and Full URL behavior recorded.
  - **Тесты:** manual matrix.
  - **Готово, когда:** no false parity claim remains.

- [ ] **PL-123 — Выполнить Edge и Яндекс Браузер matrices**
  - **Цель:** проверить Chromium ZIP без отдельного build.
  - **Требования:** COMPAT-003, COMPAT-015.
  - **Действия:** sideload same checksum artifact, execute respective checklists and record API/store differences.
  - **Модули:** `docs/release-verification/{edge,yandex}-<version>.md`.
  - **Зависимости:** PL-109, PL-121.
  - **Критерии приёмки:** same ZIP installs/routes/authenticates; limitations documented.
  - **Тесты:** manual matrices.
  - **Готово, когда:** artifact identity and results signed.

- [ ] **PL-124 — Выполнить final release audit**
  - **Цель:** подтвердить Definition of Done и готовность two ZIP release.
  - **Требования:** FR-079–FR-080, REL-001–REL-008, PRD section 38.
  - **Действия:** trace requirements/tasks/tests, complete checklists, verify clean build/checksums/known risks/docs.
  - **Модули:** release report/changelog/checklists.
  - **Зависимости:** PL-121–PL-123 и все release-blocking tasks.
  - **Критерии приёмки:** every requirement has evidence; no checked task lacks acceptance/test proof.
  - **Тесты:** clean-checkout full quality/release commands and checksum install smoke.
  - **Готово, когда:** human release owner approves; store publication remains manual.

---

# Release checklist

- [ ] Version and `v*` tag agree with centralized source.
- [x] Clean checkout passes frozen install, lint, format, typecheck, unit, integration and E2E.
- [ ] Chromium and Firefox ZIPs install from release candidates.
- [x] SHA-256 checksums reproduce.
- [x] Resolver/PAC parity and unavailable-proxy no-DIRECT tests pass.
- [ ] All four browser matrices name exact browser/OS/build versions.
- [x] Migration from every supported schema and rollback pass.
- [x] Credentials canary scan of logs/export/traces/artifacts passes.
- [x] Current IP/GeoIP provider documentation, CORS, retention and UI disclosure rechecked.
- [x] Browser limitations and known issues included in release notes.
- [x] English UI/README/store text and Russian PRD/TASKS/AGENTS language checks pass.
- [x] Store publishing remains a separate human action.

# Chrome manual matrix

- [ ] Install/update/uninstall Chromium ZIP on clean and existing profile.
- [ ] `DIRECT`, `PROXY`, `RULES` decision table and badge.
- [ ] 1000 Origin Rules, first match, disabled/temp-disabled and reorder.
- [ ] Full URL Rule visible as `Firefox only` and skipped.
- [ ] Same/separate HTTP/HTTPS endpoints; HTTP/HTTPS/WS/WSS/download.
- [ ] Reachable/unreachable proxy proves no direct/system/second fallback.
- [ ] Proxy auth success, wrong credentials, one attempt, site-auth negative.
- [ ] Once/Always exact/domain; same-origin-tab warning and cleanup.
- [ ] Best-effort main-frame error page, retry/switch/direct once; no subresource redirect.
- [ ] Manual inactive-profile check, timeout/crash recovery and no user-log test traffic.
- [ ] Logging off/default/all, 1000 ring, clear/pause, redaction.
- [ ] Native merge/replace/export secrets opt-in and FoxyProxy profiles-only.
- [ ] Incognito denied/granted, private logs/session isolation.
- [ ] Control by another extension/policy and recovery without fight.
- [ ] Popup/options/error themes, keyboard, zoom, focus and contrast smoke.
- [ ] Service worker suspension/restart restores committed effective configuration.

# Firefox manual matrix

- [ ] Install/update/uninstall Firefox MV3 ZIP and verify minimum version.
- [ ] `DIRECT`, `PROXY`, `RULES` with browser manual proxy on/off.
- [ ] Origin Rules and Full URL path/query Rules; first match and badges.
- [ ] Single-`ProxyInfo` adapter response proves no browser-defined/direct/second-proxy fallback.
- [ ] Same/separate HTTP/HTTPS endpoints; HTTP/HTTPS/WS/WSS/download.
- [ ] Proxy auth success/wrong/site-auth negative/one attempt.
- [ ] True tab-specific Once does not affect same origin in another tab.
- [ ] Speculative/invalid tab requests do not inherit temporary override.
- [ ] Temporary disables/overrides cleanup after tab close/restart.
- [ ] Error page best effort and background/download behavior.
- [ ] Manual profile check and honest connect duration.
- [ ] Logs/private in-memory isolation and redaction.
- [ ] Native/Foxy imports and migrations.
- [ ] Private browsing access/status and session separation.
- [ ] Proxy settings conflict/control status.
- [ ] Firefox automated smoke result or documented tooling limitation.
- [ ] Theme/accessibility/performance smoke.

# Edge manual matrix

- [ ] Install exact Chromium ZIP and record checksum.
- [ ] Three modes, Origin first-match, Full URL incompatibility.
- [ ] Separate endpoints, auth and fail-closed.
- [ ] Once scope warning/cleanup and error page.
- [ ] Manual check/log/import/export.
- [ ] InPrivate behavior and control conflict.
- [ ] Badge/themes/keyboard/options/popup.
- [ ] Worker restart and build/store metadata.

# Yandex Browser manual matrix

- [ ] Install exact Chromium ZIP and record checksum/version.
- [ ] Three modes, Origin first-match, Full URL incompatibility.
- [ ] Separate endpoints, auth and fail-closed.
- [ ] Once scope warning/cleanup and error page.
- [ ] Manual check/log/import/export.
- [ ] Private-window behavior and proxy control conflict.
- [ ] Badge/themes/keyboard/options/popup.
- [ ] Worker restart and any vendor-specific limitation documented.

# Security checklist

- [x] No `eval`, `new Function`, remote script, CDN code or unsafe CSP.
- [x] PAC injection corpus and resolver parity pass.
- [x] Assigned proxy results contain no hidden `DIRECT`/other proxy/system fallback.
- [x] Regex flags/length/safety/time budget enforced in editor/import/tester/PAC.
- [x] Proxy auth checks `isProxy`, endpoint and one attempt; secrets redacted.
- [x] Import size/depth/count/schema/prototype-pollution controls pass.
- [x] Migrations/imports are atomic with backup/recovery.
- [x] External responses are schema-validated and never raw HTML.
- [x] Manifest permissions are minimal and traced to PRD.
- [x] Dependencies/lockfile/licenses/audit reviewed.
- [x] Extension/internal URLs excluded from rules/error loops.
- [x] Temporary check PAC crash recovery proven.
- [x] Build artifacts contain no dev secrets, fixtures or source maps with secrets.

# Privacy checklist

- [x] No analytics, telemetry, remote config, ads or crash upload.
- [x] Logging can be disabled; default and 1000-entry limit work.
- [x] Logs contain hostname/scheme only, never path/query/fragment/body/headers/cookies.
- [x] Credentials appear only in local credential storage, auth boundary and explicit export.
- [x] Native export excludes credentials by default and warns on opt-in.
- [x] Private logs never persist and private session state is isolated.
- [x] Regex/routing testers make no network request.
- [x] Manual check is the only external provider call; endpoint shown/replaceable/disableable.
- [x] Provider retention/privacy disclosure is current and accurate.
- [x] User URLs and credentials are not sent to provider.
- [x] Diagnostics and screenshots are redacted.
- [ ] Store privacy answers match observed network/storage behavior.

# Store submission checklist

- [ ] Product name/trademark/domain/store availability rechecked; centralized replacement tested.
- [ ] English name, summary, description, support and privacy links are current.
- [ ] Icons/screenshots meet each store specification and contain no private data.
- [x] Permission justifications match per-target manifest.
- [ ] Chrome Web Store privacy practices completed.
- [ ] Firefox Add-ons MV3, source package and review instructions satisfied.
- [ ] Edge/Yandex listing differences reviewed where submission is planned.
- [x] Release ZIP/checksum/version match tested artifacts.
- [x] Known browser limitations disclosed without overclaim.
- [x] No automatic store publication credential or job exists.
- [ ] Human reviewer installs each final artifact before manual submission.
