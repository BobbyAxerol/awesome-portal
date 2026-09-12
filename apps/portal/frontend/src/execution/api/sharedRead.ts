/** In-flight only, per client/session scope. No result or credential cache. */
type Flight = { controller: AbortController; users: number; response: Promise<Response> };
const scopes = new WeakMap<object, Map<string, Flight>>();
const buffers = new WeakMap<object, { bytes: number }>();
const MAX_FLIGHTS = 64;
const MAX_BYTES = 32 * 1024 * 1024;
const MAX_BUFFERED_BYTES = 64 * 1024 * 1024;
const aborted = () => new DOMException("Read cancelled", "AbortError");

export function sharedRead(scope: object, key: string, signal: AbortSignal | undefined,
  read: (signal: AbortSignal) => Promise<Response>): Promise<Response> {
  if (signal?.aborted) return Promise.reject(aborted());
  let flights = scopes.get(scope);
  if (!flights) { flights = new Map(); scopes.set(scope, flights); }
  let budget = buffers.get(scope);
  if (!budget) { budget = { bytes: 0 }; buffers.set(scope, budget); }
  let flight = flights.get(key);
  if (!flight) {
    if (flights.size >= MAX_FLIGHTS) return Promise.reject(new Error("PORTAL_READ_ADMISSION_LIMIT"));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    flight = { controller, users: 0, response: Promise.resolve(null as unknown as Response) };
    const current = flight;
    let retained = 0;
    const reserve = (bytes: number) => {
      if (retained + bytes > MAX_BYTES || budget.bytes + bytes > MAX_BUFFERED_BYTES) {
        controller.abort();
        throw new Error("PORTAL_READ_TOO_LARGE");
      }
      retained += bytes; budget.bytes += bytes;
    };
    flight.response = read(controller.signal).then(async response => {
      // Hold the single-flight through body completion, not just response headers.
      // Minimal doubles have json() only; production always uses a bounded reader.
      if (!response.body?.getReader) {
        const body = typeof response.text === "function" ? await response.text() : JSON.stringify(await response.json());
        reserve(new TextEncoder().encode(body).byteLength);
        return new Response([204,304].includes(response.status) ? null : body, { status: response.status, headers: response.headers });
      }
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = []; let bytes = 0;
      try {
        while (true) {
          const result = await reader.read();
          if (result.done) break;
          bytes += result.value.byteLength;
          reserve(result.value.byteLength);
          chunks.push(result.value);
        }
      } finally { reader.releaseLock(); }
      const body = new Uint8Array(bytes); let offset = 0;
      for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
      return new Response([204,304].includes(response.status) ? null : body, { status: response.status, headers: response.headers });
    }).finally(() => {
      clearTimeout(timer);
      budget.bytes -= retained;
      if (flights!.get(key) === current) flights!.delete(key);
    });
    flights.set(key, flight);
  }
  const current = flight; current.users++;
  return new Promise((resolve,reject) => {
    let finished = false;
    const finish = () => {
      if (finished) return false;
      finished = true; signal?.removeEventListener("abort", cancel); current.users--;
      if (!current.users) {
        current.controller.abort();
        if (flights!.get(key) === current) flights!.delete(key);
      }
      return true;
    };
    const cancel = () => { if (finish()) reject(aborted()); };
    signal?.addEventListener("abort", cancel, {once:true});
    current.response.then(value => { if (finish()) resolve(value.clone()); }, error => { if (finish()) reject(error); });
  });
}
