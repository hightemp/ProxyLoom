# ADR-013: PAC size и performance limits

Статус: Accepted.

## Решение

PAC строится только из validated snapshot через typed IR и safe serializer. Лимиты применяются до
browser API apply: максимум 1000 rules, bounded pattern/string lengths и maximum compiled bytes.
Rejected snapshot не заменяет последний успешно applied configuration.

Compiler детерминирован; runtime loop следует global position. Full URL rules не компилируются.
Raw pattern попадает только как JSON-serialized data, не executable source.

Unit tests покрывают boundary/overflow/injection corpus, parity suite сравнивает PAC с resolver.
Release benchmark проверяет compile/apply на 1000 Origin Rules.
