/**
 * Research-owned read admission.  It intentionally sits above the shared
 * Control API pool so a slow Research viewer cannot alter Execution's pool
 * policy.  Queue timeout and pool-acquire timeout are separate failure
 * budgets; a late acquired client is released immediately.
 */

export class BoundedResearchReadAdmission<E extends Error> {
  private active = 0;
  private readonly waiters: Array<{
    resolve: () => void;
    reject: (error: E) => void;
    timer: NodeJS.Timeout;
    signal?: AbortSignal;
    onAbort?: () => void;
  }> = [];

  constructor(
    private readonly options: {
      maximumActive: number;
      maximumQueued: number;
      waitTimeoutMs: number;
      unavailable: () => E;
    },
  ) {}

  async acquire(signal?: AbortSignal): Promise<() => void> {
    if (signal?.aborted) throw this.options.unavailable();
    if (this.active < this.options.maximumActive) {
      this.active += 1;
      return () => this.release();
    }
    if (this.waiters.length >= this.options.maximumQueued) throw this.options.unavailable();
    await new Promise<void>((resolve, reject) => {
      const remove = () => {
        const index = this.waiters.indexOf(waiter);
        if (index >= 0) this.waiters.splice(index, 1);
        clearTimeout(waiter.timer);
        signal?.removeEventListener("abort", waiter.onAbort!);
      };
      const waiter = {
        resolve: () => { remove(); resolve(); },
        reject: (error: E) => { remove(); reject(error); },
        timer: undefined as unknown as NodeJS.Timeout,
        signal,
        onAbort: undefined as (() => void) | undefined,
      };
      waiter.timer = setTimeout(() => waiter.reject(this.options.unavailable()), this.options.waitTimeoutMs);
      if (signal) {
        waiter.onAbort = () => waiter.reject(this.options.unavailable());
        signal.addEventListener("abort", waiter.onAbort, { once: true });
      }
      this.waiters.push(waiter);
    });
    return () => this.release();
  }

  private release(): void {
    const next = this.waiters.shift();
    if (next) {
      next.resolve();
      return;
    }
    this.active = Math.max(0, this.active - 1);
  }
}

export async function acquireResearchPoolClient<T extends { release: () => void }>(
  connect: Promise<T>,
  timeoutMs: number,
  unavailable: () => Error,
  signal?: AbortSignal,
): Promise<T> {
  if (signal?.aborted) {
    // `pool.connect()` was already initiated by the caller. It cannot be
    // cancelled portably, so release the eventual client without retaining a
    // read-admission slot or waiting through the normal acquire deadline.
    void connect.then((client) => client.release()).catch(() => undefined);
    throw unavailable();
  }
  let settled = false;
  return new Promise<T>((resolve, reject) => {
    let onAbort: (() => void) | undefined;
    const clear = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort!);
    };
    const fail = () => {
      if (settled) return;
      settled = true;
      clear();
      reject(unavailable());
    };
    const timer = setTimeout(() => {
      // `pool.connect()` cannot be cancelled portably. The single completion
      // handler below releases its eventual result after this timeout; do not
      // attach a second handler here or a late client would be released twice.
      fail();
    }, timeoutMs);
    if (signal) {
      onAbort = fail;
      signal.addEventListener("abort", onAbort, { once: true });
    }
    void connect.then((client) => {
      if (settled) {
        client.release();
        return;
      }
      settled = true;
      clear();
      resolve(client);
    }).catch((error) => {
      if (settled) return;
      settled = true;
      clear();
      reject(error);
    });
  });
}
