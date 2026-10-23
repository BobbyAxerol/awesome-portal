/** Research-only, dependency-injected inactive mapper staging. No Docker, DB,
 * files, network, grant/session writer or source activation lives in this module.
 * The operator adapter must observe real state and durably preserve receipts.
 */
import { createHash } from 'node:crypto';

export const CORE009_INACTIVE_PINS = Object.freeze({
  old_image: 'sha256:a96c754dfbd52801f6d451dfa329eeeb3ab37fe9e467db145e201c9fa9acf121',
  new_image: 'sha256:3cb7f24af12d8228406eca9f2b800b458067bbcd1616995f51438cfa9d58d069',
  runtime_sha256: 'a8142e41fd134907251497035124cf7ad8fefe7296ac08b466a4244fd49ec168',
  old_compose_sha256: 'ce33906393df4a3de6e7e3758e02d014b822a9d559fda73863de56220ae66bc4',
  workspace_id: 'ws_06G19F61YB8CFR7TEWMS7HQ660',
  schema_version: 'research-current-human.v1',
  schema_digest: '826e4e083c8db536fc80a0f0ec272e3a71387a5e5d53a9cde48563f41fe32728',
  nano_cpus: 1_500_000_000,
  memory_bytes: 1_073_741_824,
});
const P = CORE009_INACTIVE_PINS;
const hex = /^[a-f0-9]{64}$/;
const sha = text => createHash('sha256').update(text).digest('hex');
const clone = value => structuredClone(value);
const safeCode = error => error instanceof InactiveStageError ? error.code : 'INACTIVE_STAGE_EFFECT_FAILED';
export class InactiveStageError extends Error {
  constructor(code, receipt) { super(code); this.code = code; this.receipt = receipt; }
}
const refuse = code => { throw new InactiveStageError(code); };

/** Explicit operator-only image rollout pins. Nothing here can widen the
 * immutable Research/config/schema/resource/authority envelope below. Defaults
 * retain the historical mapper rollout; another qualified image needs its own
 * exact old/new image and original raw-Compose hash, never an ENV/request flag. */
function installPins(input) {
  if (input === undefined) return P;
  const keys = ['old_image', 'new_image', 'old_compose_sha256'];
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(input)) ||
      Reflect.ownKeys(input).length !== keys.length ||
      Reflect.ownKeys(input).some(key => !keys.includes(key)) ||
      keys.some(key => !Object.hasOwn(Object.getOwnPropertyDescriptor(input, key) ?? {}, 'value')))
    refuse('INACTIVE_STAGE_INSTALL_PINS_INVALID');
  const {old_image, new_image, old_compose_sha256} = input;
  if (![old_image, new_image].every(image => typeof image === 'string' && /^sha256:[a-f0-9]{64}$(?![\s\S])/.test(image)) ||
      old_image === new_image || typeof old_compose_sha256 !== 'string' || !hex.test(old_compose_sha256) || old_compose_sha256.length !== 64)
    refuse('INACTIVE_STAGE_INSTALL_PINS_INVALID');
  return Object.freeze({...P, old_image, new_image, old_compose_sha256});
}

/** Only public observations belong here. Never pass config content, credentials,
 * rows, session identifiers, raw errors or command output to this function. */
export function captureInactiveState(observation, {
  nowMs = Date.now(), expectedImage = P.old_image,
  expectedComposeSha256 = P.old_compose_sha256,
} = {}) {
  const s = clone(observation);
  if (!Number.isSafeInteger(nowMs) || nowMs < 1) refuse('INACTIVE_STAGE_CLOCK_INVALID');
  if (s?.image !== expectedImage || s.runtime_sha256 !== P.runtime_sha256 ||
      s.compose_sha256 !== expectedComposeSha256) refuse('INACTIVE_STAGE_PIN_MISMATCH');
  if (s.schema?.version !== P.schema_version || s.schema?.schema_digest !== P.schema_digest ||
      s.schema?.migration149_applied !== true) refuse('INACTIVE_STAGE_SCHEMA_MISMATCH');
  if (s.resources?.nano_cpus !== P.nano_cpus || s.resources?.memory_bytes !== P.memory_bytes)
    refuse('INACTIVE_STAGE_RESOURCE_MISMATCH');
  const c = s.config;
  if (c?.workspace_id !== P.workspace_id || c.environment !== 'paper' || c.profile_id !== 'PAPER_BINANCE_USDM' ||
      ![c.source_expires_at_ms, c.installation_expires_at_ms].every(n => Number.isSafeInteger(n) && n > 0 && n <= nowMs))
    refuse('INACTIVE_STAGE_CONFIG_NOT_INACTIVE');
  if (['effective_read_grants', 'effective_stream_grants', 'active_acceptance_sessions']
      .some(key => s.authority?.[key] !== 0)) refuse('INACTIVE_STAGE_ACTIVE_AUTHORITY');
  if (s.active_children !== 0 || ['pending', 'unresolved', 'unreconciled', 'active_native_leases']
      .some(key => s.custody?.[key] !== 0)) refuse('INACTIVE_STAGE_UNSETTLED');
  const names = s.tables && Object.keys(s.tables);
  if (!names || names.length !== 21 || names.some(name => !/^[a-z_][a-z0-9_.]*$/u.test(name) || !hex.test(s.tables[name])))
    refuse('INACTIVE_STAGE_TABLE_CAPTURE_INVALID');
  if (typeof s.healthy !== 'boolean' || typeof s.running !== 'boolean' ||
      !Number.isSafeInteger(s.pid) || s.pid < 0 || s.running !== (s.pid > 0))
    refuse('INACTIVE_STAGE_PROCESS_STATE_UNKNOWN');
  return s;
}

/** The adapter verifies the original raw compose hash before parsing. The new
 * artifact is exactly JSON.stringify(result). On rollback restore the preserved
 * original bytes, not a newly interpreted target or reconstructed environment. */
export function imageOnlyCompose(compose, {pins} = {}) {
  const selected = installPins(pins);
  const next = clone(compose);
  if (!next?.services?.['control-api'] || next.services['control-api'].image !== selected.old_image)
    refuse('INACTIVE_STAGE_COMPOSE_INVALID');
  next.services['control-api'].image = selected.new_image;
  return next;
}
const sorted = value => JSON.stringify(Object.fromEntries(Object.keys(value).sort().map(k => [k, value[k]])));
function sameImmutable(before, after) {
  if (sorted(before.tables) !== sorted(after.tables) || JSON.stringify(before.config) !== JSON.stringify(after.config) ||
      JSON.stringify(before.schema) !== JSON.stringify(after.schema)) refuse('INACTIVE_STAGE_IMMUTABLE_STATE_CHANGED');
}
function graceful(proof) {
  if (proof?.running !== false || proof.pid !== 0 || proof.exit_code !== 0 ||
      proof.signal !== 'SIGTERM' || proof.forced !== false) refuse('INACTIVE_STAGE_GRACEFUL_STOP_UNPROVEN');
}
function runningHealthy(state) {
  if (!state.running || !state.healthy) refuse('INACTIVE_STAGE_HEALTH_NOT_ESTABLISHED');
}

/** Effects are supplied by the sole operator. All writes are durable checkpoints
 * before a destructive effect. No new attempt or recovery intent is created.
 * Failure is thrown WITH its public receipt even after a verified rollback.
 */
export async function stageInactiveMapper({ effects, nowMs = Date.now, pins }) {
  const selected = installPins(pins);
  const capturedImagePins = Object.freeze({old_image:selected.old_image,new_image:selected.new_image,
    old_compose_sha256:selected.old_compose_sha256});
  for (const key of ['readState', 'readCompose', 'preserveReceipt', 'gracefulStop', 'install', 'waitHealthy'])
    if (typeof effects?.[key] !== 'function') refuse('INACTIVE_STAGE_EFFECTS_REQUIRED');
  const receipt = { schema_version: 'portal.core009-inactive-stage.v1', state: 'PREFLIGHT',
    pins: selected, steps: [], connected_acceptance: 'NOT_RUN', grants_created: false, sessions_created: false };
  const record = async (state, facts = {}) => {
    receipt.state = state;
    receipt.steps.push({ state, observed_at_ms: nowMs(), ...facts });
    await effects.preserveReceipt(clone(receipt));
  };
  let baseline, originalCompose, nextCompose, nextHash, mutationStarted = false, gracefulEstablished = false;
  const read = async (image, composeHash) => captureInactiveState(await effects.readState(), {
    nowMs: nowMs(), expectedImage: image, expectedComposeSha256: composeHash,
  });
  try {
    baseline = await read(selected.old_image, selected.old_compose_sha256);
    runningHealthy(baseline);
    originalCompose = clone(await effects.readCompose());
    nextCompose = imageOnlyCompose(originalCompose, {pins:capturedImagePins});
    nextHash = sha(JSON.stringify(nextCompose));
    await record('PREINSTALL_VERIFIED', { candidate_compose_sha256: nextHash,
      tables_sha256: sha(sorted(baseline.tables)) });
    await record('GRACEFUL_STOP_REQUESTED');
    mutationStarted = true;
    graceful(await effects.gracefulStop());
    gracefulEstablished = true;
    const stopped = await read(selected.old_image, selected.old_compose_sha256);
    sameImmutable(baseline, stopped);
    if (stopped.running) refuse('INACTIVE_STAGE_PROCESS_NOT_STOPPED');
    await record('STOPPED_VERIFIED');
    await record('CANDIDATE_INSTALL_REQUESTED');
    await effects.install(clone(nextCompose));
    await effects.waitHealthy(selected.new_image);
    const installed = await read(selected.new_image, nextHash);
    sameImmutable(baseline, installed); runningHealthy(installed);
    await record('INACTIVE_MAPPER_INSTALLED_HEALTHY');
    return clone(receipt);
  } catch (error) {
    receipt.failure_code = safeCode(error);
    try { await record(mutationStarted ? 'INSTALL_FAILED' : 'PREFLIGHT_REFUSED'); }
    catch { throw new InactiveStageError('INACTIVE_STAGE_RECEIPT_NOT_PRESERVED', clone(receipt)); }
    if (!mutationStarted) throw new InactiveStageError(receipt.failure_code, clone(receipt));
    try {
      if (!gracefulEstablished) refuse('INACTIVE_STAGE_GRACEFUL_STOP_UNPROVEN');
      // Unknown/modified state never authorizes rollback. Both approved images
      // are permitted only with either exact approved compose artifact.
      const actual = await effects.readState();
      if (![selected.old_image, selected.new_image].includes(actual?.image) ||
          ![selected.old_compose_sha256, nextHash].includes(actual?.compose_sha256))
        refuse('INACTIVE_STAGE_ROLLBACK_TARGET_UNKNOWN');
      const current = captureInactiveState(actual, { nowMs: nowMs(),
        expectedImage: actual.image, expectedComposeSha256: actual.compose_sha256 });
      sameImmutable(baseline, current);
      await record('ROLLBACK_VERIFIED');
      if (current.running) {
        gracefulEstablished = false;
        graceful(await effects.gracefulStop());
        gracefulEstablished = true;
        const stopped = await read(current.image, current.compose_sha256);
        sameImmutable(baseline, stopped);
        if (stopped.running) refuse('INACTIVE_STAGE_PROCESS_NOT_STOPPED');
      }
      await record('ROLLBACK_INSTALL_REQUESTED');
      await effects.install(clone(originalCompose));
      await effects.waitHealthy(selected.old_image);
      const restored = await read(selected.old_image, selected.old_compose_sha256);
      sameImmutable(baseline, restored); runningHealthy(restored);
      await record('ROLLBACK_HEALTHY');
    } catch (rollbackError) {
      receipt.rollback_failure_code = safeCode(rollbackError);
      try { await record('NOT_SAFE_OR_NOT_CONFIRMED_ROLLBACK'); }
      catch { throw new InactiveStageError('INACTIVE_STAGE_RECEIPT_NOT_PRESERVED', clone(receipt)); }
    }
    throw new InactiveStageError(receipt.failure_code, clone(receipt));
  }
}
