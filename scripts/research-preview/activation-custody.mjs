/** Preview activation only: preserve the single documented undispatched
 * P24 historical fixture, never relax the guard for a new/live queued job. */
import assert from 'node:assert/strict';
export const HISTORICAL_UNDISPATCHED_RUN='rrun_5e1185f847dddd418bdbd1f9f32b87c7';
export function assertPreviewActivationIdle(rows){
 assert(Array.isArray(rows),'PREVIEW_JOB_SNAPSHOT_REQUIRED');
 for(const row of rows){
  assert(row.run_id===HISTORICAL_UNDISPATCHED_RUN&&row.run_state==='QUEUED'
   &&row.job_state==='QUEUED'&&row.dispatch_state==='PENDING'
   &&row.worker_attempt_id===null&&row.attempts===0,
   'PREVIEW_CHILD_IN_FLIGHT_DO_NOT_RESTART');
  for(const key of ['run_md5','job_md5','producer_md5'])
   assert(/^[a-f0-9]{32}$/.test(row[key]),'HISTORICAL_FIXTURE_CUSTODY_REQUIRED');
 }
 assert(rows.length<=1,'DUPLICATE_HISTORICAL_FIXTURE');
 return rows;
}
