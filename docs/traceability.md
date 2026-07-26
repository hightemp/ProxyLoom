# Requirements and task traceability

Date: 2026-07-26

This document distinguishes implementation evidence from acceptance evidence. `A` means the
implementation and its repository-local automated acceptance evidence are present. `B` means the
implementation and available automation are present, but the task explicitly requires an
external browser, hosted service, portal or human check that has not been signed. `M` is a manual
release gate. `A` tasks are checked in `TASKS.md`; `B` and `M` tasks remain unchecked until their
complete acceptance evidence exists.

## Task disposition

| Tasks         | Status | Primary evidence                                                                                                                  | Remaining evidence boundary                                        |
| ------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| PL-001…PL-003 | A      | Current Chrome/Firefox MV3 smokes, permission warnings, PAC visibility and two-browser fail-closed network evidence               | None beyond aggregate release gates                                |
| PL-004        | A      | Firefox 153 manual on/off, single/array fallback, terminal `null`, controlled fail-closed and MV3 reload network evidence         | None beyond aggregate PL-122 release matrix                        |
| PL-005…PL-006 | A      | Chromium/Firefox auth evidence plus distinct HTTP/HTTPS/WS/WSS endpoint and transport captures                                    | None beyond aggregate release gates                                |
| PL-007        | A      | Successful/cancelled check E2E plus CDP worker interruption during a concurrent committed config change and startup recovery      | None beyond aggregate release gates                                |
| PL-008        | A      | Main-frame fail-closed error-page E2E plus correlation, loop, redaction and unsupported-request unit evidence                     | None beyond aggregate release gates                                |
| PL-009…PL-010 | A      | Tab/startup reconciliation, full persistent-profile restart and real Chrome/Firefox/Edge private isolation/last-window cleanup    | None beyond aggregate signed-package release gates                 |
| PL-011…PL-014 | A      | Firefox MV3 tooling, real WS/WSS/download routing, 1,000-rule PAC budgets and safe RegExp corpus                                  | None beyond aggregate release gates                                |
| PL-015        | B      | Real second-extension Chromium ownership/recovery E2E and target-specific control mapping                                         | Firefox competing extension and enterprise-policy runs             |
| PL-016…PL-093 | A      | `entrypoints/`, `src/`, unit/parity/integration/E2E suites                                                                        | Covered by aggregate browser release gates below                   |
| PL-094…PL-095 | A      | Headed Chromium, actual 200% zoom and isolated Orca 46.1 keyboard/speech-output walkthrough                                       | None beyond aggregate release gates                                |
| PL-096        | A      | Performance E2E plus a 5-minute, 752-cycle Chromium heap/DOM/process-memory soak under `docs/quality/`                            | None beyond aggregate release gates                                |
| PL-097…PL-101 | A      | Unit coverage, deterministic loopback origins and HTTP/HTTPS proxies                                                              | None beyond aggregate release gates                                |
| PL-102…PL-103 | A      | Clean-profile Chromium/Firefox harnesses and live no-fallback/endpoints/auth/override/restart/control/private/error/check matrix  | Signed-package matrices remain PL-121…PL-123                       |
| PL-104…PL-105 | A      | Chromium extension fixtures and visible CRUD/drag/tester/Once/Always/Edit/Retry E2E                                               | None beyond aggregate release gates                                |
| PL-106        | A      | Native/FoxyProxy/theme/error E2E, Firefox integration fallback and official-Stable final-build Firefox UI/runtime/idle-wake smoke | None beyond aggregate PL-122 release matrix                        |
| PL-107…PL-108 | B      | Parsed CI workflow, frozen install and all local job commands                                                                     | Hosted GitHub pass/fail run                                        |
| PL-109…PL-110 | A      | Dual builds, package validators and valid/invalid tag fixtures                                                                    | None beyond aggregate release gates                                |
| PL-111        | A      | Clean local `v0.1.0` tagged-repository dry-run, dual exact packages, SHA-256 and exact Firefox source rebuild                     | None beyond the external release action                            |
| PL-112        | B      | Least-privilege GitHub-only release workflow with no store publisher                                                              | Real hosted tag/release/idempotency run                            |
| PL-113…PL-114 | A      | English README/guide, link/command/spelling gates, privacy disclosure                                                             | Portal copy recheck is part of PL-115                              |
| PL-115        | B      | Listing copy, rationale, public-policy review, 300px logo, 440×280 tile and 1280×800 synthetic screenshot                         | Brand/legal decision, public links/IDs and store-portal validation |
| PL-116        | B      | Safe About/Diagnostics UI and redaction tests                                                                                     | Final public privacy/support links                                 |
| PL-117…PL-118 | A      | Security reports, adversarial/fuzz/parity/import/recovery regression suites                                                       | No third-party certification is claimed                            |
| PL-119        | A      | Manifest/CSP/dependency/license scans plus Chromium 151 and Firefox 153 permission-warning extraction                             | Store-portal recheck remains PL-115                                |
| PL-120        | A      | Chromium console/export/auth/log checks plus Chrome, Firefox and Edge network/storage canary inspection                           | Store privacy form remains PL-115                                  |
| PL-121…PL-123 | M      | Candidate checklists plus Chrome/Firefox/Edge/Yandex branded runtime smokes                                                       | Signed full Chrome, Firefox, Edge and Yandex matrices              |
| PL-124        | M      | `docs/release-verification/final-audit.md`                                                                                        | PL-121…PL-123 plus human release-owner approval                    |

## Product requirement evidence

| Requirements          | Implementation and verification evidence                                                             |
| --------------------- | ---------------------------------------------------------------------------------------------------- |
| FR-001…FR-014         | General mode, profile/rule CRUD, diagnostics and localization UI; unit and core E2E                  |
| FR-015…FR-024         | Shared resolver, endpoint mapping, control status and error coordination; parity/integration/E2E     |
| FR-025…FR-040         | Ordered Origin/Full URL rules, groups, filters, templates and bounded regex tester                   |
| FR-041…FR-053         | Profile endpoint validation, checks, authentication and badge/status flows                           |
| FR-054…FR-059         | Popup inspection, Once/Always/Edit/Retry and isolated session overrides                              |
| FR-060…FR-072         | Logs, proxy check, native import/export and fixture-backed FoxyProxy import                          |
| FR-073…FR-080         | Incognito model, help/status, privacy, docs and release artifacts                                    |
| NFR-001…NFR-017       | Strict builds, performance budgets, accessibility, local infrastructure, diagnostics and CI          |
| COMPAT-001…COMPAT-014 | Dual WXT adapters/builds, capability UI, ADRs and platform-specific tests                            |
| COMPAT-015            | Automated Chromium/Firefox gates and four branded-browser smokes; full signoff remains PL-121…PL-123 |
| SEC-001…SEC-018       | Regex/PAC/import/auth/storage/privacy controls and security reports under `docs/security/`           |
| PRIV-001…PRIV-012     | In-memory private logs, redaction, Firefox/Edge canary scans and safe export/diagnostics             |
| REL-001…REL-003       | Manual-store policy, pinned/frozen quality workflow and browser jobs                                 |
| REL-004…REL-007       | Stable tag validation, dual exact ZIPs, source review package and SHA-256                            |
| REL-008               | Manual publication boundary, listing copy/assets and release-owner checklist                         |

## Machine gate

`pnpm validate:traceability` compares this document with every `PL-*` identifier in `TASKS.md` and
every requirement identifier in `PRD.md`. It fails when a new or existing identifier has no row.
This prevents an apparently complete audit from silently omitting a requirement or task.
