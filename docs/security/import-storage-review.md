# Import and storage security review

Date: 2026-07-26  
Scope: PL-118, native/FoxyProxy import, configuration migrations, local/session/log storage.

## Result

No known critical or high-severity finding remains in the reviewed scope.

## Controls and evidence

- Imports are capped at 2 MiB and depth 32 before schema conversion.
- `__proto__`, `prototype` and `constructor` keys are rejected recursively.
- Native documents and configuration use strict Zod objects, bounded strings/arrays, fixed enums
  and explicit format/schema versions.
- Unsupported future versions fail closed. Version-zero migration is idempotent and tested.
- Merge remaps conflicting IDs and references. Replace requires explicit confirmation.
- Configuration changes are validated before commit, serialized through one write queue and use
  revision conflict detection.
- A backup plus in-progress marker supports startup recovery after an interrupted/corrupt write.
- Invalid imports return a preview/report and are not passed to the repository, so the active
  revision remains unchanged.
- Credential-free export omits the credential keys entirely. Credential export is a separate
  opt-in path with a plaintext warning.

Regression evidence is in:

- `tests/unit/application/import-export.test.ts`
- `tests/unit/application/foxyproxy-import.test.ts`
- `tests/unit/storage/config-repository.test.ts`
- `tests/unit/storage/session-repository.test.ts`
- `tests/unit/storage/log-repository.test.ts`
- `tests/e2e/extended-ui.spec.ts`

## Residual risk

Proxy credentials intentionally live in ordinary browser extension local storage because no
browser-portable encrypted vault is available. The project does not claim master-password
protection. A compromised browser profile or device can expose them; this is disclosed in UI and
privacy documentation.
