# Yandex Browser 26 Stable release-candidate smoke

Date: 2026-07-26  
OS: Linux 7.0.0-28-generic x86_64  
Browser: Yandex Browser 26.4.1.1110 stable, Chromium 146.0.7680.1110  
Install: clean temporary profile, Developer mode, GUI **Load unpacked** from the same
`.output/chrome-mv3` candidate used for Chrome

## Passed checks

- Yandex Browser accepted and enabled ProxyLoom 0.1.0 and started its MV3 service worker without an
  extension load error.
- Options, Popup and the proxy-error surface loaded.
- A proxy profile was created through the runtime reached by the visible Options surface and was
  reflected by Popup.
- `chrome.proxy.settings` reported `controlled_by_this_extension`, `pac_script` and
  `mandatory: true` in PROXY mode.
- Switching back to DIRECT produced `mode: direct`.
- The observed user agent contained both Chromium 146 and `YaBrowser/26.4.0.0`, confirming that the
  checks ran in the vendor browser rather than Playwright Chromium.
- The temporary Yandex profile and the temporary unpacked-build symlink were deleted after the
  check.

## Evidence boundary

This smoke resolves the earlier limitation of command-line extension flags, but it does not sign
the complete PL-123 checklist. Authentication, install-warning variants, Incognito, long-session,
second-extension and vendor-store behavior still require the release-owner matrix using the final
checksummed Chromium ZIP.

## PL-130 discarded-tab regression

Observed on 2026-08-22 with Yandex Browser 26.4.1.1110 and an authenticated HTTPS proxy: a
discarded tab could reach the ProxyLoom error page with `net::ERR_TIMED_OUT` while the same target
returned HTTP 200 through the proxy and a fresh browser tab loaded successfully. Two automated
attempts to launch this unpacked MV3 build through Playwright's command-line extension flags did
not publish the extension service worker in Yandex (headed and headless); both stopped in fixture
setup before the auth scenario. Therefore the post-fix discarded-tab case remains a named manual
gate and must not be inferred from the Chromium E2E result.

- [ ] Load the 0.1.2 Chromium candidate through the visible Developer mode flow.
- [ ] Configure an authenticated HTTPS proxy and confirm proxy control.
- [ ] Let the MV3 worker and a target tab become inactive/discarded, then restore the tab.
- [ ] Confirm the first navigation or first explicit Retry succeeds without an intermediate
      `net::ERR_TIMED_OUT` and without a direct/system fallback.
