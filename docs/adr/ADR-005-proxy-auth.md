# ADR-005: Proxy authentication

Статус: Accepted.

## Решение

Credentials выдаются только для challenge с `isProxy = true`, совпавшего endpoint и выбранного
profile snapshot. Для `requestId` разрешена одна попытка; повторная challenge отменяется.
Состояние очищается по completion/error/timeout/startup reconciliation.

Chromium использует MV3 `webRequestAuthProvider`/`asyncBlocking`, Firefox —
`webRequestBlocking`/blocking response. Site HTTP auth никогда не получает proxy credentials.

## Evidence

Unit tests покрывают endpoint/challenge matching, negative site-auth и attempt lifecycle.
Chromium и Firefox fixtures подтверждают последовательность `[unauthenticated, authenticated]`
и одну выдачу synthetic credentials. Секреты отсутствуют в log/error/export по умолчанию.
