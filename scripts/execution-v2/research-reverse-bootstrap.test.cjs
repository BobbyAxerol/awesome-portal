'use strict';
// PRIVATE OFFLINE MODEL TESTS ONLY. No DB, OS socket, app service, environment,
// credential or installed-runtime mutation. Actual bootstrap command/IPC/save
// source is extracted from the hash-pinned preimage + reviewed patch IN MEMORY.
// DI seams below are explicitly fake; PASS is NOT physical IPC/DB/PM ACK proof.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { test } = require('node:test');

const PINS = Object.freeze({
  preimage: 'e997debdcbc0500dd91252f6ff5a79ad31f5571d3ddbd6caae077ec2fb298cea',
  bootstrapPatch: '3b49fc2aea7e27fe2d21e5253acb372912f17e63481292fb9d8fa172b7fd7f60',
  sourcePatch: 'e587cf796f886304adec1ba6736442da1e6923a6a0068d13b2380e5aa09f4086',
  patchedSource: 'cc6ae429c0283105818b1c8ab7133a5380fbe49f6834fe5910daa1eb9dd1c5f4',
  ownedTerminal: 'e0f5413f145b6d1559488764e9a9f9f6677167d8190fddd3a015996867c0b47a',
  lifecycleTail: '0109e309e896248d38db0377740d191aa20d600788160d63e9c55507e339f328',
});
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const clone = value => JSON.parse(JSON.stringify(value));
const safeError = code => Object.assign(new Error(code), { code });
function pinned(file, expected) {
  const bytes = fs.readFileSync(file);
  assert.equal(sha(bytes), expected, 'reviewed input pin changed: ' + path.basename(file));
  return bytes.toString('utf8');
}
function patchInMemory(source, patch) {
  const original = source.split('\n'), out = [], lines = patch.split('\n');
  let at = 0, offset = 0, seen = 0;
  assert.equal(lines[0], 'diff --git a/reverse-runtime-v1/reverse-bootstrap.cjs b/reverse-runtime-v1/reverse-bootstrap.cjs');
  assert.equal(lines.filter(line => line.startsWith('diff --git ')).length, 1);
  for (let i = 0; i < lines.length; i++) {
    const m = /^@@ -(\d+),(\d+) \+(\d+),(\d+) @@/.exec(lines[i]);
    if (!m) continue;
    const old = [], next = [];
    for (i++; i < lines.length && !lines[i].startsWith('@@') && !lines[i].startsWith('diff --git'); i++) {
      const line = lines[i];
      if (!line) continue;
      assert.ok(['+', '-', ' '].includes(line[0]), 'unsupported patch body');
      if (line[0] !== '+') old.push(line.slice(1));
      if (line[0] !== '-') next.push(line.slice(1));
    }
    i--;
    const start = Number(m[1]) - 1;
    assert.equal(old.length, Number(m[2])); assert.equal(next.length, Number(m[4]));
    assert.ok(start >= at); assert.equal(Number(m[3]), Number(m[1]) + offset);
    assert.deepEqual(original.slice(start, start + old.length), old);
    out.push(...original.slice(at, start), ...next);
    at = start + old.length; offset += next.length - old.length; seen++;
  }
  assert.equal(seen, 7);
  out.push(...original.slice(at));
  return out.join('\n');
}
function between(source, start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, 'extraction markers missing');
  assert.equal(source.indexOf(start, a + 1), -1, 'ambiguous start marker');
  return source.slice(a, b);
}
// CI/default mode needs only the tracked, non-secret sibling full source.
// Optional: node this.test.cjs --source /absolute/path/to/staged-full-source.cjs
// Proposal-only: --proposal /absolute/preimage /absolute/bootstrap.patch /absolute/source.patch
const args = process.argv.slice(2);
let patched;
if (args.length === 0 || args.length === 2 && args[0] === '--source') {
  const sourcePath = args.length ? args[1] : path.join(__dirname, 'research-reverse-bootstrap.cjs');
  assert.ok(path.isAbsolute(sourcePath), 'explicit source path must be absolute');
  patched = pinned(sourcePath, PINS.patchedSource);
} else {
  assert.equal(args.length, 4, 'unsupported harness arguments');
  assert.equal(args[0], '--proposal', 'unsupported harness mode');
  assert.ok(args.slice(1).every(file => path.isAbsolute(file)));
  const original = pinned(args[1], PINS.preimage), bootstrapPatch = pinned(args[2], PINS.bootstrapPatch);
  pinned(args[3], PINS.sourcePatch);
  patched = patchInMemory(original, bootstrapPatch);
  assert.equal(sha(patched), PINS.patchedSource);
}
const helpers = between(patched, 'const fail = code =>', 'let startupCleanup =');
const actualOrchestration = between(patched, '  const save = next => {', '  async function stop() {');
const compatibilityGuard = "  if (typeof candidate.finishUnusedIdentityDrain!=='function') fail('UNUSED_IDENTITY_FINISH_MODULE_REQUIRED');";
assert.equal(patched.split(compatibilityGuard).length - 1, 1);
const terminalSlice = source => between(source, '  const ownedTerminal = async()=>{', '\n  const ');
assert.equal(sha(terminalSlice(patched)), PINS.ownedTerminal, 'ownedTerminal must remain byte-identical');
assert.equal(sha(patched.slice(patched.indexOf('  async function stop() {'))), PINS.lifecycleTail,
  'stop/listen/readiness/signal/main-catch lifecycle must remain byte-identical');

function harness(options = {}) {
  const monitor = options.monitor || {};
  const model = {
    trace: [], files: new Map(), fds: new Map(), nextFd: 1, nextUuid: 0, netCalls: 0,
    issueCalls: 0, sessionIssues: 0, endCalls: [], unusedCalls: [], beginCalls: [], recoverCalls: 0,
    logoutTokens: [], auditCount: 0, rows: new Map(), lease: null, events: [], unresolved: 0,
    callbacks: options.callbacks === undefined ? { in_flight: 0, accepted: 0, denied: 0, timed_out: 0 } : clone(options.callbacks),
    originalRevision: 17, currentRevision: 91, drainId: null, durableRecord: null,
    issueSaveFaultUsed: false, logoutFaultUsed: false, readbackFaultUsed: false, preIssueFaultUsed: false,
    finishAckFaultUsed: false,
  };
  monitor.model = model;
  const target = { protected_owner_user_id: 'TEST_ONLY-user', workspace_id: 'TEST_ONLY-workspace' };
  const trust = { pm: { workload_id: 'TEST_ONLY-pm' } };
  const d = { state_path: '/TEST_ONLY-private/state.json', mutation_limits: { maximum_recoveries_per_request: 2 } };
  const user = { userId: target.protected_owner_user_id, status: 'ACTIVE', archivedAt: null,
    mustChangePassword: false, sessionVersion: 7 };
  const fixtureSession = () => ({ sessionId: 'TEST_ONLY-session', token: 'TEST_ONLY-ONE-VIEW-BEARER' });
  const fakeFs = {
    constants: { O_WRONLY: 1, O_CREAT: 2, O_EXCL: 4, O_NOFOLLOW: 8, O_RDONLY: 16, O_DIRECTORY: 32 },
    openSync(name, flags) {
      const fd = model.nextFd++, directory = Boolean(flags & 32);
      if (!directory) assert.ok(!model.files.has(name), 'exclusive test state file');
      model.fds.set(fd, { name, directory, synced: false, text: null }); return fd;
    },
    writeFileSync(fd, text) {
      const file = model.fds.get(fd), value = JSON.parse(text);
      if (options.issueSaveFault && value.state === 'ISSUED' && !model.issueSaveFaultUsed) {
        model.issueSaveFaultUsed = true; throw safeError('TEST_ONLY_ORIGINAL_SAVE_FAILED');
      }
      file.text = text; model.trace.push({ event: 'state-write', state: value.state,
        issue_started: value.identity_issue_started, authority_revision: value.authority_revision });
    },
    fsyncSync(fd) {
      const file = model.fds.get(fd); assert.ok(file);
      if (file.directory) {
        const current = model.files.get(d.state_path);
        model.durableRecord = current ? JSON.parse(current.text) : null;
        model.trace.push({ event: 'directory-fsync', state: model.durableRecord?.state,
          issue_started: model.durableRecord?.identity_issue_started });
      } else { file.synced = true; model.trace.push({ event: 'file-fsync' }); }
    },
    closeSync(fd) {
      const file = model.fds.get(fd); assert.ok(file);
      if (!file.directory && file.text !== null) model.files.set(file.name, file);
      model.fds.delete(fd);
    },
    renameSync(from, to) {
      const file = model.files.get(from); assert.ok(file?.synced, 'file fsync precedes rename');
      model.files.set(to, file); model.files.delete(from);
      model.trace.push({ event: 'state-rename' });
    },
  };
  const pool = { async query(sql, params = []) {
    if (sql.includes('SELECT count(*)::int AS n FROM elp210_candidate.obligations')) return { rows: [{ n: model.unresolved }] };
    if (sql.includes('FROM elp210_candidate.leases')) {
      const r = model.lease;
      if (!r || JSON.stringify(params) !== JSON.stringify([r.lease_id, r.subject_id, r.session_id, r.session_revision,
        r.workspace_id, r.workload_id, r.request_digest])) return { rows: [] };
      return { rows: [{ phase: r.phase, attempt_id: r.attempt_id, terminal_receipt_digest: r.terminal_receipt_digest }] };
    }
    if (sql.includes("phase='SOURCE_ROLLED_BACK_UNENTERED'")) return { rows: model.unenteredTerminal
      ? [{ attempt_id: 'TEST_ONLY-unentered', terminal_receipt_digest: 'sha256:' + '9'.repeat(64) }] : [] };
    throw new Error('HARNESS_UNKNOWN_QUERY'); // no actual DB connection exists
  } };
  const candidate = {
    async issue(actor, binding) {
      model.issueCalls++; model.trace.push({ event: 'issue-call' });
      assert.equal(model.durableRecord?.state, 'SESSION');
      assert.equal(model.durableRecord?.identity_issue_started, true, 'intent must fsync before real issue could commit');
      model.lease = { lease_id: 'TEST_ONLY-lease', authority_revision: model.originalRevision,
        subject_id: actor.user_id, session_id: actor.session_id, session_revision: actor.session_generation,
        ...clone(binding), phase: 'ISSUED', attempt_id: null, terminal_receipt_digest: null };
      model.events.push('ISSUED'); model.trace.push({ event: 'MODEL-issue-commit' });
      if (options.issueOutcome === 'commit-ack-lost' || options.issueOutcome === 'signing-failed')
        throw safeError('TEST_ONLY_' + options.issueOutcome.toUpperCase());
      return { token: 'TEST_ONLY-HUMAN-TOKEN', lease_id: model.lease.lease_id,
        authority_revision: options.badRevision ? undefined : model.originalRevision, expires_at_ms: 1234567890000 };
    },
    async beginDrain(id) {
      assert.ok(!model.drainId || model.drainId === id); model.drainId = id; model.beginCalls.push(id);
      if (model.lease?.phase === 'ISSUED') { model.lease.phase = 'RETIRED'; model.events.push('RETIRED'); }
      return { status: model.unresolved ? 'DRAIN_PENDING' : 'DRAIN_READY', pending: model.unresolved,
        authority_revision: model.currentRevision };
    },
    async recoverableAttempts() { return model.unresolved ? [{ lease_id: model.lease?.lease_id }] : []; },
    async endDrain(id, revision) {
      assert.equal(id, model.drainId); assert.equal(revision, model.currentRevision); assert.equal(model.unresolved, 0);
      model.endCalls.push({ id, revision }); model.drainId = null;
    },
    async finishUnusedIdentityDrain(id, revision, input, witness) {
      model.unusedCalls.push({ id, revision, input: clone(input) });
      assert.equal(id, model.drainId); assert.equal(revision, model.currentRevision);
      assert.equal(model.unresolved, 0);
      const r = model.lease;
      assert.deepEqual(clone(input), { lease_id: r.lease_id, authority_revision: r.authority_revision,
        actor: { user_id: r.subject_id, session_id: r.session_id, session_generation: r.session_revision },
        binding: { workspace_id: r.workspace_id, environment: r.environment, workload_id: r.workload_id, request_digest: r.request_digest } });
      if (r.phase !== 'RETIRED' || r.attempt_id !== null || r.terminal_receipt_digest !== null)
        throw safeError('CURRENT_HUMAN_UNUSED_IDENTITY_NOT_ELIGIBLE');
      witness(); // actual bootstrap witness; Core transactional guard is NOT mocked as a receipt
      model.drainId = null;
      if (options.finishAckLoss && !model.finishAckFaultUsed) {
        model.finishAckFaultUsed = true; throw safeError('TEST_ONLY_FINISH_ACK_LOST');
      }
    },
  };
  if (options.missingMethod) delete candidate.finishUnusedIdentityDrain;
  const auth = {
    users: { async findByUsername(name) { assert.equal(name, 'bobby'); return clone(user); } },
    async previewAutoSession() {
      model.sessionIssues++; const s = fixtureSession();
      model.rows.set(s.token, { sessionId: s.sessionId, userId: user.userId, sessionVersion: user.sessionVersion, state: 'ACTIVE' });
      return s;
    },
    async sessionFromToken(token) {
      if (options.preIssueFailure && !model.preIssueFaultUsed && model.logoutTokens.length === 0) {
        model.preIssueFaultUsed = true; return null;
      }
      if (options.readbackLoss && model.logoutTokens.length && !model.readbackFaultUsed) {
        model.readbackFaultUsed = true; throw safeError('TEST_ONLY_REVOKE_READBACK_LOST');
      }
      const row = model.rows.get(token); return row ? clone(row) : null;
    },
    async logout(token) {
      model.logoutTokens.push(token);
      const row = model.rows.get(token); assert.ok(row, 'exact existing bearer only');
      if (options.logoutBeforeCommitLoss && !model.logoutFaultUsed) {
        model.logoutFaultUsed = true; throw safeError('TEST_ONLY_LOGOUT_NOT_COMMITTED');
      }
      if (row.state !== 'REVOKED') { row.state = 'REVOKED'; model.auditCount++; }
      if (options.logoutAckLoss && !model.logoutFaultUsed) {
        model.logoutFaultUsed = true; throw safeError('TEST_ONLY_LOGOUT_ACK_LOST');
      }
    },
  };
  let acceptConnection;
  const net = { createServer(fn) { model.netCalls++; acceptConnection = fn; return { maxConnections: 0 }; } };
  const context = vm.createContext({
    Buffer, fs: fakeFs, path, crypto: { randomUUID: () => 'TEST_ONLY-uuid-' + (++model.nextUuid) },
    process: { argv: ['TEST_ONLY-node', 'TEST_ONLY-bootstrap', 'TEST_ONLY-descriptor', 'f'.repeat(64)] },
    candidate, auth, d, target, trust, pool, net,
    callback: { snapshot: () => Object.freeze(clone(model.callbacks)) },
    recovery: { async recover() { model.recoverCalls++; } },
    req(name) {
      assert.equal(name, './execution-v2/pm-http-request-binding.js');
      return { pmHttpRequestDigest: () => 'sha256:' + 'e'.repeat(64) }; // codec is outside this DI test
    },
  }, { codeGeneration: { strings: false, wasm: false } });
  const code = [
    "'use strict';", helpers,
    "let record={state:'READY'},session,ipc,busy=false,closing=false,shutdownDrain;",
    compatibilityGuard, actualOrchestration,
    "async function stop(){throw new Error('HARNESS_RUNTIME_SHUTDOWN_NOT_IMPLEMENTED');}",
    "globalThis.__harness={record:()=>record,hasSession:()=>Boolean(session),loseBearer:()=>{session=undefined;},",
    "editRecord:fn=>fn(record)};",
  ].join('\n');
  new vm.Script(code, { filename: 'TEST_ONLY-actual-patched-bootstrap-orchestration.cjs' })
    .runInContext(context, { timeout: 1000 });
  const api = context.__harness;
  class MemorySocket extends EventEmitter {
    constructor(drop) {
      super(); this.drop = drop; this.ended = false;
      this.result = new Promise(resolve => { this.resolve = resolve; });
    }
    setTimeout(ms) { assert.ok(ms === 3000 || ms === 30000); return this; } // no OS timer, not a timeout test
    end(payload) {
      assert.equal(this.ended, false); this.ended = true;
      model.trace.push({ event: 'MODEL-ipc-end', delivered: !this.drop, record: clone(model.durableRecord) });
      this.resolve({ delivered: !this.drop, response: this.drop ? null : JSON.parse(payload) });
      queueMicrotask(() => this.emit('close')); return this;
    }
    destroy() {
      if (!this.ended) { this.ended = true; this.resolve({ delivered: false, response: null }); this.emit('close'); }
      return this;
    }
  }
  return {
    model, record: () => clone(api.record()), hasSession: api.hasSession, loseBearer: api.loseBearer,
    editRecord: api.editRecord,
    async send(command, { dropResponse = false } = {}) {
      const socket = new MemorySocket(dropResponse);
      acceptConnection(socket); socket.emit('data', Buffer.from(JSON.stringify({ command }) + '\n'));
      return socket.result;
    },
    setPhase(phase) {
      assert.ok(model.lease); model.lease.phase = phase;
      model.unresolved = ['ENTERED', 'UNKNOWN'].includes(phase) ? 1 : 0;
      if (['COMMITTED', 'ROLLED_BACK'].includes(phase)) {
        model.lease.attempt_id = 'TEST_ONLY-attempt'; model.lease.terminal_receipt_digest = 'sha256:' + '8'.repeat(64);
      }
    },
  };
}
const response = async (h, command) => (await h.send(command)).response;
const issue = async h => { assert.equal((await response(h, 'issue-identity')).state, 'ISSUED'); };
const isFinished = result => assert.equal(result.state, 'FINISHED');

test('all inputs are pinned; actual ownedTerminal remains byte-identical', () => {
  assert.ok(actualOrchestration.includes('async function command(input)'));
  assert.ok(actualOrchestration.includes("ipc = net.createServer(socket=>"));
  assert.ok(actualOrchestration.includes('finishUnusedIdentityDrain'));
  assert.ok(actualOrchestration.includes('identity_issue_started'));
});
test('old module refuses before IPC creation or session/lease issuance', () => {
  const monitor = {};
  assert.throws(() => harness({ missingMethod: true, monitor }), error => error.safeCode === 'UNUSED_IDENTITY_FINISH_MODULE_REQUIRED');
  assert.equal(monitor.model.netCalls, 0); assert.equal(monitor.model.sessionIssues, 0); assert.equal(monitor.model.issueCalls, 0);
});
test('lost simulated IPC response already has fsynced original revision, no durable bearer or second issuance', async () => {
  const h = harness(), result = await h.send('issue-identity', { dropResponse: true });
  assert.deepEqual(result, { delivered: false, response: null });
  assert.equal(h.record().authority_revision, 17); assert.equal(h.model.durableRecord.authority_revision, 17);
  assert.notEqual(h.record().authority_revision, h.model.currentRevision);
  assert.equal(JSON.stringify(h.model.durableRecord).includes('TEST_ONLY-ONE-VIEW-BEARER'), false);
  assert.equal(JSON.stringify(h.model.durableRecord).includes('TEST_ONLY-HUMAN-TOKEN'), false);
  const wireIndex = h.model.trace.findIndex(e => e.event === 'MODEL-ipc-end');
  assert.ok(h.model.trace.slice(0, wireIndex).some(e => e.event === 'directory-fsync' && e.state === 'ISSUED'));
  assert.equal((await response(h, 'status')).state, 'ISSUED');
  assert.equal((await response(h, 'issue-identity')).error, 'ISSUANCE_NOT_AVAILABLE');
  assert.equal(h.model.issueCalls, 1); assert.equal(h.model.sessionIssues, 1);
});
test('unused finish passes exact original binding, current drain revision and trusted zero callback closure', async () => {
  const h = harness(); await issue(h); isFinished(await response(h, 'finish'));
  const call = h.model.unusedCalls[0];
  assert.equal(call.input.authority_revision, 17); assert.equal(call.revision, 91);
  assert.equal(call.input.actor.session_id, 'TEST_ONLY-session'); assert.equal(call.input.binding.environment, 'paper');
  assert.deepEqual(h.model.events, ['ISSUED', 'RETIRED']);
  assert.equal(h.model.endCalls.length, 0); assert.equal(h.model.auditCount, 1);
  assert.equal(h.model.logoutTokens[0], 'TEST_ONLY-ONE-VIEW-BEARER');
  assert.equal(h.hasSession(), false); assert.equal(h.record().state, 'FINISHED');
});
test('lost guarded-finish ACK retries the same drain/lease, distinct from logout ACK loss', async () => {
  const h = harness({ finishAckLoss: true }); await issue(h);
  assert.ok((await response(h, 'finish')).error);
  assert.equal(h.record().state, 'ISSUED'); assert.equal(h.hasSession(), true); assert.equal(h.model.auditCount, 0);
  const drainId = h.record().finish_drain_id;
  isFinished(await response(h, 'finish'));
  assert.deepEqual(h.model.beginCalls, [drainId, drainId]); assert.equal(h.model.unusedCalls.length, 2);
  assert.equal(h.model.issueCalls, 1); assert.equal(h.model.logoutTokens.length, 1);
  assert.deepEqual(h.model.events, ['ISSUED', 'RETIRED']);
});
test('lost logout ACK retains LOGOUT/bearer and retries only the same session, no second audit or new-login revocation', async () => {
  const h = harness({ logoutAckLoss: true }); await issue(h);
  assert.ok((await response(h, 'finish')).error); assert.equal(h.record().state, 'LOGOUT'); assert.equal(h.hasSession(), true);
  h.model.rows.set('TEST_ONLY-NEW-LOGIN', { sessionId: 'TEST_ONLY-new-session', state: 'ACTIVE' });
  isFinished(await response(h, 'finish'));
  assert.deepEqual(h.model.logoutTokens, ['TEST_ONLY-ONE-VIEW-BEARER', 'TEST_ONLY-ONE-VIEW-BEARER']);
  assert.equal(h.model.auditCount, 1); assert.equal(h.model.rows.get('TEST_ONLY-NEW-LOGIN').state, 'ACTIVE');
  assert.equal(h.model.beginCalls.length, 1); assert.equal(h.model.unusedCalls.length, 1);
  isFinished(await response(h, 'finish')); assert.equal(h.model.logoutTokens.length, 2);
});
for (const option of ['logoutBeforeCommitLoss', 'readbackLoss']) {
  test(option + ' cannot write FINISHED or discard the bearer before exact readback', async () => {
    const h = harness({ [option]: true }); await issue(h);
    assert.ok((await response(h, 'finish')).error); assert.equal(h.record().state, 'LOGOUT'); assert.equal(h.hasSession(), true);
    isFinished(await response(h, 'finish')); assert.equal(h.model.auditCount, 1);
    assert.equal(h.model.unusedCalls.length, 1); assert.equal(h.model.logoutTokens.length, 2);
  });
}
for (const failure of ['commit-ack-lost', 'signing-failed', 'original-save-failed', 'missing-original-revision']) {
  test('ambiguous internal issue ' + failure + ' preserves SESSION custody and refuses before drain/logout', async () => {
    const h = harness({ issueOutcome: failure, issueSaveFault: failure === 'original-save-failed',
      badRevision: failure === 'missing-original-revision' });
    assert.ok((await response(h, 'issue-identity')).error);
    assert.equal(h.record().state, 'SESSION'); assert.equal(h.record().identity_issue_started, true);
    assert.equal(h.model.durableRecord.identity_issue_started, true); assert.equal(h.model.issueCalls, 1);
    assert.equal(h.model.lease.phase, 'ISSUED'); assert.equal(h.record().lease_id, undefined);
    assert.equal((await response(h, 'finish')).error, 'UNUSED_IDENTITY_ORIGINAL_REQUIRED');
    assert.equal(h.model.beginCalls.length, 0); assert.equal(h.model.unusedCalls.length, 0);
    assert.equal(h.model.logoutTokens.length, 0); assert.equal(h.hasSession(), true);
  });
}
test('explicit fsynced pre-issue false marker allows exact session-only cleanup without unused-lease classification', async () => {
  const h = harness({ preIssueFailure: true }); assert.equal((await response(h, 'issue-identity')).error, 'SESSION_CHANGED');
  assert.equal(h.record().identity_issue_started, false); assert.equal(h.model.durableRecord.identity_issue_started, false);
  assert.equal(h.model.issueCalls, 0); isFinished(await response(h, 'finish'));
  assert.equal(h.model.unusedCalls.length, 0); assert.equal(h.model.endCalls.length, 1); assert.equal(h.model.auditCount, 1);
});
test('old SESSION missing issue-start marker refuses before any drain or logout', async () => {
  const h = harness({ preIssueFailure: true }); await response(h, 'issue-identity');
  h.editRecord(record => { delete record.identity_issue_started; });
  assert.equal((await response(h, 'finish')).error, 'UNUSED_IDENTITY_ORIGINAL_REQUIRED');
  assert.equal(h.model.beginCalls.length, 0); assert.equal(h.model.logoutTokens.length, 0); assert.equal(h.hasSession(), true);
});
test('ISSUED without original lease never takes the pre-issue false-marker branch', async () => {
  const h = harness(); await issue(h);
  h.editRecord(record => { delete record.lease_id; record.identity_issue_started = false; });
  assert.equal((await response(h, 'finish')).error, 'UNUSED_IDENTITY_ORIGINAL_REQUIRED');
  assert.equal(h.model.beginCalls.length, 0); assert.equal(h.model.logoutTokens.length, 0);
});
for (const phase of ['COMMITTED', 'ROLLED_BACK', 'SOURCE_ROLLED_BACK_UNENTERED']) {
  test('existing genuine-terminal reader branch remains unchanged for model ' + phase, async () => {
    const h = harness(); await issue(h);
    if (phase === 'SOURCE_ROLLED_BACK_UNENTERED') { h.setPhase('RETIRED'); h.model.unenteredTerminal = true; }
    else h.setPhase(phase);
    h.editRecord(record => { delete record.authority_revision; });
    isFinished(await response(h, 'finish'));
    assert.equal(h.model.unusedCalls.length, 0); assert.equal(h.model.endCalls.length, 1); assert.equal(h.model.auditCount, 1);
  });
}
for (const phase of ['ENTERED', 'UNKNOWN']) {
  test('unresolved model ' + phase + ' retains existing terminal/recovery requirement', async () => {
    const h = harness(); await issue(h); h.setPhase(phase);
    assert.equal((await response(h, 'finish')).error, 'SOURCE_TERMINAL_REQUIRED');
    assert.equal(h.model.unusedCalls.length, 0); assert.equal(h.model.endCalls.length, 0);
    assert.equal(h.model.logoutTokens.length, 0); assert.equal(h.hasSession(), true);
    assert.equal(h.model.recoverCalls, 1); assert.ok(h.model.drainId);
  });
}
for (const key of ['in_flight', 'accepted', 'denied', 'timed_out']) {
  test('actual trusted witness refuses nonzero ' + key + ' and retains the drain', async () => {
    const callbacks = { in_flight: 0, accepted: 0, denied: 0, timed_out: 0 }; callbacks[key] = 1;
    const h = harness({ callbacks }); await issue(h);
    assert.equal((await response(h, 'finish')).error, 'UNUSED_CALLBACK_WITNESS_REQUIRED');
    assert.ok(h.model.drainId); assert.equal(h.model.logoutTokens.length, 0); assert.equal(h.hasSession(), true);
  });
}
for (const callbacks of [{}, { in_flight: 0, accepted: 0, denied: 0, timed_out: 0, unknown: 0 },
  { in_flight: -1, accepted: 0, denied: 0, timed_out: 0 }]) {
  test('actual trusted witness refuses incomplete/extra/negative callback shape ' + JSON.stringify(callbacks), async () => {
    const h = harness({ callbacks }); await issue(h);
    assert.equal((await response(h, 'finish')).error, 'UNUSED_CALLBACK_WITNESS_REQUIRED');
    assert.ok(h.model.drainId); assert.equal(h.model.logoutTokens.length, 0);
  });
}
test('restart-lost one-view bearer cannot be reconstructed or called FINISHED', async () => {
  const h = harness(); await issue(h); h.loseBearer();
  assert.equal((await response(h, 'status')).cookie_lost, true);
  assert.equal((await response(h, 'finish')).error, 'COOKIE_LOST_ONE_VIEW_REVIEW_REQUIRED');
  assert.equal(h.model.issueCalls, 1); assert.equal(h.model.sessionIssues, 1); assert.equal(h.model.logoutTokens.length, 0);
});
