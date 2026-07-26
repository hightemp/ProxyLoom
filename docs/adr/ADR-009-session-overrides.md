# ADR-009: Session overrides и service-worker lifecycle

Статус: Accepted.

## Решение

Temporary overrides и transient recovery markers хранятся в `storage.session` через repository;
service-worker globals не являются source of truth. При старте, alarm и закрытии tab выполняется
идемпотентная reconciliation по live tab IDs и expiry.

Firefox override имеет `TAB` scope и применяется только при reliable non-negative tab ID.
Chromium PAC не знает tab ID, поэтому override имеет `ORIGIN` scope до закрытия source tab; UI
показывает точное предупреждение до подтверждения и в inspection.

Overrides не входят в native export и игнорируются режимом DIRECT без удаления.

## Evidence

Unit coverage exercises tab close, stale IDs, startup/alarm reconciliation, normal/private
separation and browser-restart expiry. A persistent-profile Chromium E2E writes both normal and
private overrides plus transient auth/recovery state, fully closes Chromium and relaunches it with
the same profile. Local configuration and DIRECT control survive while all prior session records
are absent or reconciled to an empty set.
