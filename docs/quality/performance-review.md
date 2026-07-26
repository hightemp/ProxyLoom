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
| Five-minute Options/Popup memory soak         |               All growth budgets | Pass, 752 cycles |

Evidence:

```text
pnpm test:performance
pnpm exec playwright test tests/e2e/performance.spec.ts
pnpm test:soak
```

The tester is capped at 1,000 lines, executes in a worker and supports immediate cancellation.
Persistent log writes use a bounded 50-entry/250-ms batch, and reads flush pending entries before
loading pages of 100 rather than rendering the complete store.

The 5-minute soak repeatedly traversed all seven Options sections and opened/closed the Popup in a
clean persistent Chromium profile. It forced V8 garbage collection before each CDP sample and
measured the Options renderer plus all Chromium processes belonging to the unique temporary
profile. The exact final observation was:

| Metric                |      Baseline |         Final |       Growth | Maximum growth | Result |
| --------------------- | ------------: | ------------: | -----------: | -------------: | ------ |
| Documents             |             1 |             1 |            0 |              2 | Pass   |
| DOM nodes             |           252 |           252 |            0 |            250 | Pass   |
| JavaScript listeners  |            33 |            33 |            0 |            100 | Pass   |
| Chromium processes    |             9 |             9 |            0 |              2 | Pass   |
| V8 heap used          |   2,745,192 B |   3,750,532 B |  1,005,340 B |    8,388,608 B | Pass   |
| Aggregate process PSS | 407,902,208 B | 465,729,536 B | 57,827,328 B |   67,108,864 B | Pass   |

The run lasted 300,774 ms and completed 752 UI cycles. Aggregate RSS grew by 69,791,744 bytes; RSS
is recorded diagnostically while proportional set size (PSS), which avoids double-counting shared
pages, is the enforced whole-browser budget. The test removes its exact temporary profile even on
failure. Its duration and sample interval can be overridden for local calibration with
`PROXYLOOM_SOAK_DURATION_MS` and `PROXYLOOM_SOAK_SAMPLE_INTERVAL_MS`; the default release gate is
five minutes.
