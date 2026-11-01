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

## Дополнение (PL-164): Test speed

`Test speed` переиспользует тот же workflow. Временный exact-origin override ставится и для origin
`general.speedTestEndpoint`; этот origin так же считается internal (без user logs и error page).
После успешного чтения JSON в ту же вкладку через `scripting.executeScript` внедряется
самодостаточная функция `measureDownloadInPage`: она выполняет `fetch` (`no-store`, без cookies)
и читает поток до 5 MB или 15 s, начиная отсчёт с получения заголовков. Service-worker `fetch`
по-прежнему не используется — ровно по причине из основного решения. Ответ должен разрешать
cross-origin чтение (Cloudflare отдаёт `Access-Control-Allow-Origin: *`). Ошибка скачивания не
меняет availability: сохраняется `speedErrorCode`. Время фазы скачивания вычитается из
`totalDurationMs`. Отмена закрывает вкладку и возвращает `TIMEOUT`.

Evidence: unit tests probe/service/targeted check; Chromium E2E через локальный прокси и локальный
`/__down` на втором origin подтверждает, что скачивание идёт через профиль и не попадает в logs.
Firefox использует тот же код, но в этой среде Firefox integration не запускается (см. известное
ограничение `-remote-allow-system-access`), поэтому Firefox-путь подтверждён только сборкой.
