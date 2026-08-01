import { access, readFile } from 'node:fs/promises'

const targets = [
  {
    directory: '.output/chrome-mv3',
    forbiddenPermission: 'webRequestBlocking',
    requiredPermission: 'webRequestAuthProvider',
  },
  {
    directory: '.output/firefox-mv3',
    forbiddenPermission: 'webRequestAuthProvider',
    requiredPermission: 'webRequestBlocking',
  },
]

for (const target of targets) {
  const manifest = JSON.parse(await readFile(`${target.directory}/manifest.json`, 'utf8'))
  const permissions = new Set(manifest.permissions ?? [])
  if (manifest.manifest_version !== 3) throw new Error(`${target.directory}: expected MV3`)
  if (manifest.default_locale !== 'en') throw new Error(`${target.directory}: locale missing`)
  if (!permissions.has('proxy') || !permissions.has('scripting')) {
    throw new Error(`${target.directory}: required runtime permission missing`)
  }
  if (!permissions.has(target.requiredPermission)) {
    throw new Error(`${target.directory}: target auth permission missing`)
  }
  if (permissions.has(target.forbiddenPermission)) {
    throw new Error(`${target.directory}: wrong-target auth permission present`)
  }
  if (!(manifest.host_permissions ?? []).includes('<all_urls>')) {
    throw new Error(`${target.directory}: routing host permission missing`)
  }
  if (manifest.options_ui?.page !== 'options.html' || manifest.options_ui?.open_in_tab !== true) {
    throw new Error(`${target.directory}: options must open in a standalone tab`)
  }
  for (const size of ['16', '32', '48', '128']) {
    const icon = manifest.icons?.[size]
    const actionIcon = manifest.action?.default_icon?.[size]
    if (icon !== `icon-${size}.png` || actionIcon !== icon) {
      throw new Error(`${target.directory}: ${size}px manifest/action icon mismatch`)
    }
    await access(`${target.directory}/${icon}`)
  }
  const csp = manifest.content_security_policy?.extension_pages ?? ''
  if (csp.includes('unsafe-eval') || csp.includes('unsafe-inline')) {
    throw new Error(`${target.directory}: unsafe extension CSP`)
  }
}

process.stdout.write('Chromium and Firefox build manifests validated.\n')
