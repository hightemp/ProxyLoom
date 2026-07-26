# ADR-015: Proxy control conflict

Статус: Accepted with manual release gate.

## Решение

Перед apply adapter читает `levelOfControl`. Запись разрешена только при `CONTROLLABLE` или
`CONTROLLED_BY_THIS_EXTENSION`; policy/other extension/not-controllable возвращает typed error.
Background хранит persisted и applied revision отдельно. UI показывает status и не запускает
бесконечную повторную запись.

Firefox дополнительно считает ошибку `proxy.settings.set` capability failure. Terminal `null`
выражает DIRECT, но без подтверждённого `proxyType: none` отказ назначенного `ProxyInfo` может
перейти к browser-defined manual/system proxy. Поэтому безопасный routing snapshot применить
нельзя даже при доступном `proxy.onRequest`.

Unit tests покрывают mapping/apply errors; ручная policy/competing-extension matrix обязательна
для release report. Recovery — повторная явная команда после освобождения контроля.
