# Performance review

Date: 2026-07-26  
Reference environment: Linux x86_64, Node 22.16.0, Playwright Chromium 151, headless extension
context.

Required automated budgets:

| Scenario                                      |                Release threshold | Result           |
| --------------------------------------------- | -------------------------------: | ---------------- |
| Worst-position match among 1,000 Origin rules |                       100 ms p95 | Pass             |
| Representative 1,000-rule PAC compile         | 500 ms p95 implementation budget | Pass             |
| Warm Popup to enabled action                  |                       750 ms p95 | Pass, 20 samples |
| Cold browser/worker Popup to enabled action   |                     1,500 ms p95 | Pass, 20 samples |
| Ordinary rule persist + browser proxy apply   |                         2,000 ms | Pass             |
| Persistent log writes                         |      ≤50 entries / ≤250 ms batch | Pass             |
| One-minute warm-up + five-minute memory soak  |               All growth budgets | Pass             |

Evidence:

```text
pnpm test:performance
pnpm exec playwright test tests/e2e/performance.spec.ts
pnpm test:soak
```

The tester is capped at 1,000 lines, executes in a worker and supports immediate cancellation.
Persistent log writes use a bounded 50-entry/250-ms batch, and reads flush pending entries before
loading pages of 100 rather than rendering the complete store.

The soak repeatedly traverses all seven Options sections and opens/closes the Popup in a clean
persistent Chromium profile. A one-minute exercise warm-up lets Chromium finish ordinary lazy
startup work before the baseline; the enforced measurement window remains a full five minutes. It
forces V8 garbage collection before each CDP sample and measures the Options renderer plus all
Chromium processes belonging to the unique temporary profile. The latest local reference
observation after the warm-up was:

| Metric                |      Baseline |         Final |       Growth | Maximum growth | Result |
| --------------------- | ------------: | ------------: | -----------: | -------------: | ------ |
| Documents             |             1 |             1 |            0 |              2 | Pass   |
| DOM nodes             |           255 |           255 |            0 |            250 | Pass   |
| JavaScript listeners  |            33 |            33 |            0 |            100 | Pass   |
| Chromium processes    |             9 |             9 |            0 |              2 | Pass   |
| V8 heap used          |   3,513,904 B |   3,691,840 B |    177,936 B |    8,388,608 B | Pass   |
| Aggregate process PSS | 442,141,696 B | 468,647,936 B | 26,506,240 B |   67,108,864 B | Pass   |

The warm-up lasted 60,096 ms and completed 160 cycles. The measured window then lasted 300,454 ms
and completed 764 cycles. Aggregate RSS grew by 34,881,536 bytes; RSS is recorded diagnostically
while proportional set size (PSS), which avoids double-counting shared pages, is the enforced
whole-browser budget. The test removes its exact temporary profile even on failure. Warm-up,
duration and sample interval can be overridden for local calibration with
`PROXYLOOM_SOAK_WARMUP_MS`, `PROXYLOOM_SOAK_DURATION_MS` and
`PROXYLOOM_SOAK_SAMPLE_INTERVAL_MS`; the default release gate measures five minutes after a
one-minute warm-up.
