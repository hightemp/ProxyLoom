# Architecture decision records

ADR-001–ADR-015 фиксируют решения обязательной research-фазы. Проверяемые browser promises
подкреплены локальными origin/proxy fixtures, Chromium Playwright E2E и временно установленным
Firefox MV3 extension. Сводка окружения и команд находится в
[`../research/browser-spikes-2026-07-26.md`](../research/browser-spikes-2026-07-26.md).

Статусы:

- `Accepted` — реализовано и покрыто автоматическим evidence;
- `Accepted with manual release gate` — решение реализовано, но перед публикацией остаётся
  именованная ручная browser matrix.
