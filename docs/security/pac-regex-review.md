# PAC and regular-expression security review

Date: 2026-07-26  
Scope: PL-117, `src/domain/regex`, Chromium PAC IR/compiler/serializer, resolver parity and
fail-closed routing tests.

## Result

No known critical or high-severity finding remains in the reviewed scope. This is an engineering
review backed by automated tests; it is not a claim of independent third-party certification.

## Controls and evidence

- User patterns are limited to 2,048 characters and flags `i`/`m`. Backreferences, immediate
  nested quantifiers and repeated ambiguous alternatives are rejected.
- The regex batch tester executes in a worker, accepts at most 1,000 lines, has a timeout and
  settles cancellation immediately.
- PAC data is JSON-serialized rather than interpolated as executable source. `<`, U+2028 and
  U+2029 receive explicit escaping.
- Compiled PAC is rejected above 1,000,000 UTF-8 bytes and warns from 750,000 bytes.
- Proxy decisions emit one proxy directive with no appended `DIRECT` or second proxy. PAC parity
  and live Chromium drop tests verify zero direct-origin fallback.
- Unit adversarial cases cover quotes, slashes, newlines, unsafe regex shapes, unsupported flags,
  maximum sizes and PAC injection characters. A fixed-seed 256-case hostile-string fuzz corpus
  additionally verifies inert PAC serialization.

Evidence commands:

```text
pnpm test:unit
pnpm test:parity
pnpm test:performance
pnpm test:integration
pnpm test:e2e
```

## Residual risk

The unsafe-regex checks are deliberately conservative heuristics, not a proof that every accepted
JavaScript expression has bounded runtime. A user can still author a costly expression within the
safe subset. Length/feature limits, worker cancellation in the tester and the 1,000-rule cap reduce
the risk; release review should continue to treat newly discovered pathological patterns as
security regressions.
