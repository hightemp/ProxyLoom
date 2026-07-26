# ADR-003: Fail-closed proxy routing

Статус: Accepted.

## Решение

Назначенный proxy никогда не получает `DIRECT`, system proxy или второй proxy fallback.
Chromium PAC возвращает ровно одну compiler-owned directive, а PAC установлен с
`mandatory: true`. Firefox возвращает ровно один `ProxyInfo`. Configuration error направляется
на заведомо закрытый loopback endpoint и остаётся диагностируемой ошибкой.

## Evidence

`tests/e2e/routing.spec.ts` применяет dropped proxy, затем проверяет отсутствие прямого запроса
к origin. Firefox integration повторяет тот же тест. PAC parity и injection corpus проверяют,
что proxy result не содержит `DIRECT` или цепочки.

Recovery допускается только после явного действия пользователя: смена режима/правила/proxy или
`Open Directly Once`.
