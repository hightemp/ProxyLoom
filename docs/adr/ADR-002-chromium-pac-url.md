# ADR-002: Видимый Chromium PAC URL

Статус: Accepted.

## Решение

Portable Origin Rules нормализуются в `scheme://hostname[:explicit-port]/`. Chromium PAC
сопоставляет этот target, а не исходную строку. Full URL Rules в Chromium сохраняются, видимо
помечаются `Firefox only` и пропускаются.

## Evidence

Локальная browser matrix на Chromium 150 и 151 зафиксировала: HTTP и WS предоставляют PAC полный
URL, HTTPS и WSS — origin-only значение. Поэтому path/query routing в Chromium запрещён
независимо от того, что часть схем раскрывает больше данных. `tests/e2e/routing.spec.ts` проверяет
все четыре схемы, `tests/parity/pac-parity.test.ts` — parity resolver/PAC.

Такое решение даёт одинаковую переносимую семантику Origin Rules и не обещает нестабильную
видимость HTTPS path/query.
