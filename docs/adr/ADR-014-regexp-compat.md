# ADR-014: RegExp compatibility и tester isolation

Статус: Accepted.

## Решение

Разрешён общий безопасный subset JavaScript RegExp с flags `i`/`m`; lookbehind, backreferences,
named groups и потенциально опасные nested quantifiers отклоняются validator. Pattern всегда
применяется к одному normalized target contract.

Single/batch tester работает локально в отдельном unlisted worker, не выполняет сеть, принимает
не более 1000 строк/100 000 символов и имеет budget/cancel. Chromium пропускает Full URL rules;
Firefox исполняет их по path/query без fragment.

Validator, worker и PAC serializer покрыты malformed/adversarial corpus tests.
