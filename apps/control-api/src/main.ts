import "reflect-metadata";
import { loadConfig } from "./config";
import { buildPool } from "./db/pool";
import { createControlApiApp } from "./app";
import { nativeCoreRuntimeReference, prepareNativeCoreRuntime } from "./execution-v2/native-core-runtime";
import { composeOwnedNativeCoreRuntime, NativeCoreApplicationOwner } from "./execution-v2/native-core-bootstrap";
import { nativeResearchReview } from "./execution/native-review-profile";
import { assertRegisteredResearchCurrentHumanSchema } from "./execution-v2/current-human-schema";
import { currentViewRuntimeReference, prepareCurrentViewRuntime } from "./execution-v2/current-view-runtime";
import { financialSourceRuntimeReference, prepareFinancialSourceRuntime } from "./execution-v2/financial-source-runtime";
import { prepareFinancialSourceApplication, selectPrivateCorePoolProfile } from "./execution-v2/financial-source-bootstrap";

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const reference = nativeCoreRuntimeReference();
  const native = reference ? await prepareNativeCoreRuntime(reference) : undefined;
  const currentViewReference = currentViewRuntimeReference();
  const currentViewRuntime = currentViewReference ? await prepareCurrentViewRuntime(currentViewReference) : undefined;
  const financialReference=financialSourceRuntimeReference();
  const financialRuntime=financialReference?await prepareFinancialSourceRuntime(financialReference):undefined;
  const reviewTarget=nativeResearchReview(config)
    ? native?.researchReviewTarget(config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID!) : undefined;
  if(nativeResearchReview(config)&&!reviewTarget)throw new Error("NATIVE_RESEARCH_REVIEW_COMPOSITION_REQUIRED");
  const pool = buildPool(config.DATABASE_URL, selectPrivateCorePoolProfile(native,currentViewRuntime,financialRuntime));
  let financialSource: Awaited<ReturnType<typeof prepareFinancialSourceApplication>> | undefined;
  const nativeDependencies = native ? await composeOwnedNativeCoreRuntime({compose:async ownedPool=>{
    if(reviewTarget)await assertRegisteredResearchCurrentHumanSchema(ownedPool,reviewTarget);
    // Both factories finish before any listener starts. A failed schema or
    // financial preparation belongs to the same bootstrap-owned pool cleanup.
    financialSource=financialRuntime?await prepareFinancialSourceApplication(ownedPool,financialRuntime):undefined;
    return native.compose(ownedPool,financialSource?[financialSource.participant]:[]);
  }}, pool) : undefined;
  const dependencies = { ...nativeDependencies,...(currentViewRuntime?{currentViewRuntime}:{}),...(financialSource?{financialSource}:{}) };
  const owner = native ? new NativeCoreApplicationOwner(pool) : undefined;
  try {
    const app = await createControlApiApp(config, pool, undefined, dependencies, owner);
    const port = Number(process.env.CONTROL_API_PORT ?? 4000);
    await app.listen(port, "0.0.0.0");
    if (owner) {
      // Own exactly this standalone process. owner.close invokes ALL ordinary
      // app lifecycle phases, then Core end; a failed drain never calls pg.end.
      // A failed process exits for durable recovery, never claims rollback/ACK.
      for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => {
        void owner.close().then(() => process.exit(0), () => {
          process.stderr.write("CONTROL_API_NATIVE_SHUTDOWN_RECOVERY_REQUIRED\n");
          process.exit(1);
        });
      });
    } else app.enableShutdownHooks();
  } catch (error) {
    if (owner) return owner.failStartup(error);
    throw error;
  }
}

void bootstrap().catch(() => {
  // Never print a URL, credential, untrusted source exception or nested cause.
  // Pre-handle Nest failure is deliberately NOT_SAFE_TO_DISPOSE; OS process
  // teardown is not a successful application drain/COMMIT/rollback receipt.
  process.stderr.write("CONTROL_API_STARTUP_FAILED\n");
  process.exit(1);
});
