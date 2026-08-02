# ADR-005: Proxy authentication

Статус: Accepted.

## Решение

Credentials выдаются только для challenge с `isProxy = true`, совпавшего endpoint и выбранного
profile snapshot. Для `requestId` разрешена одна попытка; повторная challenge отменяется.
Состояние очищается по completion/error/timeout/startup reconciliation.

Chromium использует MV3 `webRequestAuthProvider`/`asyncBlocking`, Firefox —
`webRequestBlocking`/blocking response. Site HTTP auth никогда не получает proxy credentials.

Chromium PAC переживает остановку service worker, а applied routing snapshot в памяти — нет.
Поэтому при cold wake `asyncBlocking` callback bounded ожидает завершение startup session
reconciliation и existing configuration-apply path, после чего повторно читает только успешно
опубликованный snapshot. Строить auth snapshot напрямую из persisted config запрещено: browser
proxy control или apply могли завершиться неуспешно, и тогда сохранённый route не доказывает, что
challenge принадлежит ProxyLoom.

Перед ответом на каждую Chromium proxy challenge listener асинхронно подтверждает
`CONTROLLED_BY_THIS_EXTENSION` для соответствующего regular/incognito context и проверяет, что
snapshot не сменился за время проверки. Отсутствующий в Chromium `webRequest` incognito flag
восстанавливается по `tabId` через общий tab resolver; если положительный tab ID разрешить нельзя,
auth fail-closed отвечает без credentials. Одного совпадения challenger host/port недостаточно:
другой controller может назначить тот же endpoint. Auth path никогда не запускает configuration
apply и потому не борется за control.

Если applied snapshot не появился из-за timeout/error, listener отвечает без credentials и не
отменяет challenge: при control conflict он может принадлежать system proxy или другому extension.
`cancel: true` используется только для повторной challenge после фактической выдачи credentials.
Pending callback завершается без credentials по completion/error/unregister и не может выдать их
позднее. Firefox blocking path остаётся синхронным.

## Evidence

Unit tests покрывают endpoint/challenge matching, negative site-auth и attempt lifecycle.
Chromium и Firefox fixtures подтверждают последовательность `[unauthenticated, authenticated]`
и одну выдачу synthetic credentials. Секреты отсутствуют в log/error/export по умолчанию.

PL-128 добавляет deferred-readiness unit matrix для success/null/timeout/rejection, site-auth,
cleanup, teardown и loss of proxy control. Chromium E2E использует authenticated HTTPS proxy и
HTTPS origin, завершает worker через CDP и подтверждает успешную первую navigation без reload. При
cold wake Chromium может создать несколько unauthenticated CONNECT параллельно; тест требует,
чтобы они завершились ровно одним authenticated CONNECT и единственным запросом origin. Отдельный
second-extension E2E забирает control, сохраняя тот же host/port, и подтверждает отсутствие выдачи
credentials. Routing E2E traces отключены, потому что test fixture передаёт полный профиль через
page context.
