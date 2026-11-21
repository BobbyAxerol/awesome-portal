/** Bootstrap-only ownership boundary, before app/provider startup. Current
 * private compose awaits its read-only target query and starts no native work.
 * This is not an app shutdown/drain helper. If compose gains background work,
 * its actual work must be joined before this boundary may dispose the pool. */
import type { Pool } from "pg";
import type { INestApplicationContext } from "@nestjs/common";
import type { ControlApiDependencies } from "../app.module";
import type { PreparedNativeCoreRuntime } from "./native-core-runtime";

export async function composeOwnedNativeCoreRuntime(
  native: Pick<PreparedNativeCoreRuntime, "compose">,
  pool: Pool,
): Promise<ControlApiDependencies> {
  try {
    return await native.compose(pool);
  } catch (error) {
    // SAME bootstrap-owned pool; no retry, fallback or raw error replacement.
    try { await pool.end(); } catch { /* Preserve original sanitized error. */ }
    throw error;
  }
}

/** Main's private bootstrap owner ONLY. Generic createControlApiApp continues
 * to leave injected Core pools caller-owned. This owns no source authority. */
export class NativeCoreApplicationOwner {
  private constructionStarted = false;
  private application?: Pick<INestApplicationContext, "close">;
  private closing?: Promise<void>;
  private state: "NO_APPLICATION" | "CONSTRUCTING" | "APPLICATION_CAPTURED" |
    "DRAINING" | "CORE_ENDED" | "NOT_SAFE_TO_DISPOSE" | "CLOSE_FAILED" = "NO_APPLICATION";
  constructor(private readonly ownedCorePool: Pool) {}

  usesPool(pool: Pool): boolean { return pool === this.ownedCorePool; }
  status() { return Object.freeze({state: this.state}); }

  /** Call BEFORE AppModule.register/NestFactory.create may start construction. */
  beginApplicationConstruction(): void {
    if (this.constructionStarted || this.application || this.closing)
      throw new NativeCoreApplicationShutdownError();
    this.constructionStarted = true;
    this.state = "CONSTRUCTING";
  }

  /** Creator calls this immediately after receiving the genuine app handle,
   * BEFORE parser/plugin/init/ready awaits. No fake post-init-only callback. */
  captureApplication(app: Pick<INestApplicationContext, "close">): void {
    if (!this.constructionStarted || this.application || this.closing)
      throw new NativeCoreApplicationShutdownError();
    this.application = app;
    this.state = "APPLICATION_CAPTURED";
  }

  /** Used after complete app close, including its module-class domain-pool
   * finalizer. Cache the SAME promise before invoking any external callback. */
  close(): Promise<void> {
    if (this.closing) return this.closing;
    let resolve!: () => void, reject!: (error: unknown) => void;
    this.closing = new Promise<void>((done, failed) => { resolve = done; reject = failed; });
    void this.finishClose().then(resolve, reject);
    return this.closing;
  }

  /** Never replace the exact startup failure, log it, retry work, or authorize
   * disposal after failed drain. Main must inspect the finite status instead. */
  async failStartup(original: unknown): Promise<never> {
    try { await this.close(); } catch { /* Preserve original; owned resources are NOT declared closed. */ }
    throw original;
  }

  private async finishClose(): Promise<void> {
    if (!this.application && this.constructionStarted) {
      // Nest's public create API exposes no partial container on rejection.
      // Unknown sibling constructor work is not proved settled by rejection.
      this.state = "NOT_SAFE_TO_DISPOSE";
      throw new NativeCoreApplicationShutdownError();
    }
    this.state = "DRAINING";
    try {
      if (this.application) await this.application.close();
      // Complete app barrier succeeded; it is now safe for this explicit owner
      // to end its Core pool. Generic app lifecycle never ends injected Core.
      await this.ownedCorePool.end();
      this.state = "CORE_ENDED";
    } catch (error) {
      this.state = "CLOSE_FAILED";
      throw error;
    }
  }
}

export class NativeCoreApplicationShutdownError extends Error {
  readonly code = "CURRENT_HUMAN_NATIVE_APPLICATION_NOT_SAFE_TO_DISPOSE";
  constructor() { super("Native application shutdown is not established."); }
}
