# ADR-007: Проверка неактивного proxy profile

Статус: Accepted.

## Решение

Manual check сериализуется с config apply, временно применяет high-priority exact-origin route к
`profile.checkUrl` и открывает inactive tab, потому что Chromium service-worker `fetch` в spike не
использовал установленный proxy. Background коррелирует только main-frame completion/error,
считывает JSON body через `scripting`, сразу закрывает tab и в `finally` восстанавливает последний
committed snapshot. Session recovery marker позволяет восстановиться после service-worker
interruption. Проверочный URL исключается из user routing logs и error-page redirects.

Check можно отменить; одновременно выполняется только один. Ответ ограничен 64 KiB, timeout и
JSON/IP schema; credentials не отправляются provider как application data.

`scripting` и broad host permission нужны только для чтения ответа этой одноразовой check-вкладки.
Код не инжектируется в обычные user tabs этим workflow.

## Evidence

Chromium E2E proves successful and cancelled checks through deterministic loopback proxies,
exclusion from user logs and restoration of the committed route. A fault-injection case starts a
hanging check, commits a newer global route while the temporary PAC owns the browser, terminates
only the MV3 service-worker CDP target and opens Options to wake the replacement worker. The latest
committed PROXY route is restored, the recovery marker is cleared and the next origin request
traverses that profile. Unit cases cover timeout, malformed/oversized response, concurrency and
cancellation.

## Последствия

Connect duration остаётся `null`, если browser API не предоставляет честную фазу connect.
Внешняя сеть происходит только по явному нажатию пользователя.
