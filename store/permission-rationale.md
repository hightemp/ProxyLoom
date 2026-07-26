# Permission rationale

| Permission                          | Why it is required                                                                                                         |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `proxy`                             | Apply direct/PAC/onRequest routes and read proxy control status.                                                           |
| `storage`                           | Store versioned profiles, rules, settings, session overrides, and recovery markers.                                        |
| `webRequest`                        | Correlate redacted routing results, main-frame proxy failures, and auth lifecycle.                                         |
| `webRequestAuthProvider` (Chromium) | Supply credentials only for matching proxy challenges in MV3.                                                              |
| `webRequestBlocking` (Firefox)      | Firefox-compatible blocking proxy-auth response.                                                                           |
| `<all_urls>` host access            | Route configured HTTP/HTTPS/WS/WSS destinations and observe safe lifecycle events.                                         |
| `tabs`                              | Inspect the active tab, clean Once state, show a best-effort error page, and run an explicit inactive-profile check.       |
| `scripting`                         | Read only the JSON body of the temporary inactive tab created by an explicit profile Check; the tab is immediately closed. |
| `downloads`                         | Correlate download failures without redirecting an arbitrary tab.                                                          |
| `notifications`                     | Show a hostname-only download failure notification with a Logs action.                                                     |
| `alarms`                            | Reconcile expired/session state after Manifest V3 worker suspension.                                                       |

Chromium and Firefox packages contain only their required auth permission. No optional permission is
requested speculatively. The extension CSP is `script-src 'self'; object-src 'self'`; there is no
remote script, `unsafe-eval`, or `unsafe-inline`.
