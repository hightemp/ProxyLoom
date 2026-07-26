# ADR-015: Proxy control conflict

Статус: Accepted.

## Решение

Перед apply adapter читает `levelOfControl`. Запись разрешена только при `CONTROLLABLE` или
`CONTROLLED_BY_THIS_EXTENSION`; policy/other extension/not-controllable возвращает typed error.
Background хранит persisted и applied revision отдельно. UI показывает status и не запускает
бесконечную повторную запись.

Firefox дополнительно считает ошибку `proxy.settings.set` capability failure. Terminal `null`
выражает DIRECT, но без подтверждённого `proxyType: none` отказ назначенного `ProxyInfo` может
перейти к browser-defined manual/system proxy. Поэтому безопасный routing snapshot применить
нельзя даже при доступном `proxy.onRequest`.

`BrowserSetting.set()` в Firefox возвращает boolean. `false` считается apply failure так же, как
rejected promise: adapter переводит routing state в fail-closed и не сообщает ложный успех.

Chromium E2E использует отдельное реальное control extension и подтверждает ownership, no-fight,
Retry до/после `clear`. Firefox 153 BiDi integration устанавливает два реальных MV3 add-on в одном
профиле. Более новый controller получает precedence; subject наблюдает
`controlled_by_other_extensions`, не пишет settings, а controller остаётся владельцем. После
`clear` прежнее `proxyType: none` subject автоматически восстанавливается, и явный retry успешен.

Отдельный Firefox 153 enterprise fixture загружает настоящий locked `Proxy` policy через
`PLAYWRIGHT_FIREFOX_POLICIES_JSON`. `proxy.settings.get()` возвращает `not_controllable` и
`proxyType: manual`, попытка `set` отклоняется, а policy proxy остаётся активным. Recovery для
policy возможен только после снятия администратором; расширение не ведёт борьбу за контроль.
