import { err, ok, type Result } from '../../../domain/types/result'
import type { RoutingSnapshot } from '../../../domain/routing/snapshot'
import { buildPacProgramIR, type PacIrError, type PacProgramIR } from './ir'
import { validatePacSize } from './limits'
import { serializePacData } from './serialize'

export interface CompiledPac {
  readonly script: string
  readonly byteLength: number
  readonly revision: number
  readonly snapshotHash: string
}

export type PacCompileError =
  | PacIrError
  | {
      readonly code: 'PAC_TOO_LARGE'
      readonly entityId: null
      readonly byteLength: number
    }

const emitPacScript = (program: PacProgramIR): string => {
  const rules = serializePacData(program.rules)
  const overrides = serializePacData(program.overrides)
  const fallback = serializePacData(program.fallback)

  return `'use strict';
var PROXYLOOM_RULES = ${rules};
var PROXYLOOM_OVERRIDES = ${overrides};
var PROXYLOOM_FALLBACK = ${fallback};

function proxyLoomOrigin(url) {
  var match = /^([a-z]+):\\/\\/([^\\/?#]+)/i.exec(url);
  if (!match) return null;
  var scheme = match[1].toLowerCase();
  var authority = match[2];
  var at = authority.lastIndexOf('@');
  if (at >= 0) authority = authority.slice(at + 1);
  authority = authority.toLowerCase();
  if ((scheme === 'http' || scheme === 'ws') && /:80$/.test(authority)) {
    authority = authority.slice(0, -3);
  } else if ((scheme === 'https' || scheme === 'wss') && /:443$/.test(authority)) {
    authority = authority.slice(0, -4);
  }
  return { origin: scheme + '://' + authority + '/', scheme: scheme };
}

function proxyLoomDirective(route, scheme) {
  if (route.direct) return 'DIRECT';
  return scheme === 'http' || scheme === 'ws'
    ? route.httpDirective
    : route.httpsDirective;
}

function proxyLoomEvaluate(entries, target) {
  for (var index = 0; index < entries.length; index += 1) {
    var entry = entries[index];
    if (new RegExp(entry.pattern, entry.flags).test(target.origin)) {
      return proxyLoomDirective(entry, target.scheme);
    }
  }
  return null;
}

function FindProxyForURL(url, host) {
  var target = proxyLoomOrigin(url);
  if (!target) return 'DIRECT';
  var override = proxyLoomEvaluate(PROXYLOOM_OVERRIDES, target);
  if (override !== null) return override;
  var rule = proxyLoomEvaluate(PROXYLOOM_RULES, target);
  if (rule !== null) return rule;
  return proxyLoomDirective(PROXYLOOM_FALLBACK, target.scheme);
}
`
}

export const compilePac = (snapshot: RoutingSnapshot): Result<CompiledPac, PacCompileError> => {
  const ir = buildPacProgramIR(snapshot)
  if (!ir.ok) {
    return ir
  }
  const script = emitPacScript(ir.value)
  const size = validatePacSize(script)
  if (!size.ok) {
    return err({
      byteLength: size.error.byteLength,
      code: 'PAC_TOO_LARGE',
      entityId: null,
    })
  }
  return ok({
    byteLength: size.value.byteLength,
    revision: snapshot.revision,
    script,
    snapshotHash: snapshot.hash,
  })
}
