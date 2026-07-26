# Google Chrome 150 Stable release-candidate smoke

Date: 2026-07-26  
OS: Linux 7.0.0-28-generic x86_64  
Browser: Google Chrome 150.0.7871.128 (Official Build, stable)  
Install: clean temporary profile, Developer mode, GUI **Load unpacked** from
`.output/chrome-mv3`

This is direct branded-browser evidence. It is broader than a command-line launch smoke, but it is
not the signed release-owner matrix required by PL-121.

## Passed checks

- Chrome accepted the unpacked MV3 candidate, displayed ProxyLoom 0.1.0, enabled it and started its
  service worker without an extension load error.
- Options, Popup and the proxy-error surface loaded with HTTP status 200 and no page or console
  error.
- A proxy profile and a rule were created through the visible UI and survived a reload.
- Popup reflected the persisted global profile and mode.
- `chrome.proxy.settings` reported `controlled_by_this_extension`, the expected mandatory PAC
  configuration in PROXY mode and `mode: direct` after switching back to DIRECT.
- Chrome's extension details UI enabled **Allow in Incognito**, and
  `isAllowedIncognitoAccess()` returned `true`.
- A real Chrome incognito window and its private tab were visible to the extension.
- Popup inspected that private tab and created a private, origin-only Once override. The stored
  override had `incognito: true`; its generated pattern contained only the loopback hostname and
  optional port, not the `/private?secret=canary` path/query used by the test.
- Closing the last real incognito window removed the private override while leaving the normal
  Chrome window open.
- The temporary Chrome profiles and the temporary unpacked-build symlink were deleted after the
  checks.

## Stable-only defect found and fixed

The first private-tab run exposed a Chrome Stable behavior not reproduced by the normal Playwright
Chromium fixture: `tabs.query()` returned the private tab, but `tabs.get(privateTabId)` in the
spanning service worker returned `No tab with id`. Target-tab resolution now falls back to the
visible tab list when that direct lookup fails, preserves the original error if no matching tab
exists, and has five focused unit tests. Rebuilding and repeating the fresh-profile check produced
the successful private-popup and cleanup results above.

## Evidence boundary

The run did not sign install-warning variations, enterprise policy, the full latest±2 Chrome
matrix, manual screen-reader behavior or a long-session memory check. PL-121 and PL-124 therefore
remain open release-owner gates.
