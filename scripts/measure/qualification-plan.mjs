#!/usr/bin/env node
/** node scripts/measure/qualification-plan.mjs --public-plan PUBLIC.json
 * The file embeds ONLY the four workload structural fields (schema_version,
 * seed, sets, stages), explicit M2/M5 reservation inputs, proposed_window and
 * retained scenarios. Never pass authorization, cookie, session or trust files.
 * No network, credentials, collectors, timers, load or file writes are used.
 */
import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { planQualificationReservation } from './lib/qualification-reservation.mjs';

export function runQualificationPlan(args, { stdout = text => process.stdout.write(text), stderr = text => process.stderr.write(text) } = {}) {
  try {
    if (args.length !== 2 || args[0] !== '--public-plan' || typeof args[1] !== 'string' || !args[1] || /[\u0000-\u001f\u007f]/.test(args[1]))
      throw new Error('QUALIFICATION_PLAN_REFUSED:PUBLIC_PLAN_ARGUMENT_REQUIRED');
    const fd = openSync(args[1], constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    let bytes;
    try {
      const stat = fstatSync(fd);
      if (!stat.isFile() || stat.size < 1 || stat.size > 1048576) throw new Error('QUALIFICATION_PLAN_REFUSED:PUBLIC_PLAN_FILE_INVALID');
      // An input can grow after fstat. Never let that race turn the declared
      // 1MiB ceiling into an unbounded read; the extra byte detects growth.
      const buffer = Buffer.alloc(stat.size + 1);
      let length = 0;
      while (length < buffer.length) {
        const count = readSync(fd, buffer, length, buffer.length - length, null);
        if (!count) break;
        length += count;
      }
      const after = fstatSync(fd);
      if (length !== stat.size || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs)
        throw new Error('QUALIFICATION_PLAN_REFUSED:PUBLIC_PLAN_FILE_CHANGED');
      bytes = buffer.subarray(0, length);
    } finally { closeSync(fd); }
    const input = JSON.parse(bytes.toString('utf8'));
    stdout(JSON.stringify(planQualificationReservation(input)) + '\n');
    return 0;
  } catch (error) {
    // Never echo raw JSON, file paths, user strings or underlying fs/parser errors.
    const message = typeof error?.message === 'string' && /^(QUALIFICATION_RESERVATION|QUALIFICATION_PLAN)_REFUSED:[A-Z_]+$/.test(error.message)
      ? error.message : 'QUALIFICATION_PLAN_REFUSED:INVALID_PUBLIC_INPUT';
    stderr(message + '\n'); return 3;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  process.exitCode = runQualificationPlan(process.argv.slice(2));
