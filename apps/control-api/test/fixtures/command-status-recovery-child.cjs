/* TEST_ONLY subprocess for a guarded disposable PostgreSQL cell. Synthetic
 * source relations/original and ephemeral test keys arrive solely over IPC.
 * Never start this helper against an unguarded or shared database. */
const { createJiti } = require("jiti");
const { Pool } = require("pg");
const jiti = createJiti(__filename, { fsCache: false });
const { AuthService } = jiti("../../src/auth/auth.service.ts");
const { ExecutionAccessService } = jiti("../../src/execution-v2/access.service.ts");
const { CurrentHumanCandidate } = jiti("../../src/execution-v2/current-human-candidate.ts");
const { CommandSourceAssertionAuthority } = jiti("../../src/execution-v2/command-source-assertion.ts");
const { createCommandSourceAssertionTransport } = jiti("../../src/execution-v2/command-source-assertion-transport.ts");
const { EdgeCommandStatusTransport } = jiti("../../src/execution-v2/edge-command-status-transport.ts");
const { PgCommandStatusOriginalFingerprints } = jiti("../../src/execution-v2/command-status-original-fingerprints.ts");
let pool, server, authority, edgePort;
const stop = async () => {
  authority?.shutdown();
  if (server?.listening) await new Promise(resolve => server.close(resolve));
  await pool?.end();
};
process.on("message", async message => {
  try {
    if (message.type === "STOP") { await stop(); process.exit(0); }
    if (message.type === "PREPARE" && authority) {
      try {
        const result = await authority.prepare({ ...message.input, signal: new AbortController().signal }, message.body);
        process.send?.({ type: "PREPARED", result });
      } catch (error) {
        process.send?.({ type: "PREPARE_REFUSED", code: error?.code });
      }
      return;
    }
    if (message.type === "EDGE_PREPARE" && edgePort) {
      try {
        const input = { ...message.input, signal: new AbortController().signal };
        await edgePort.original(input);
        const result = await edgePort.prepareStatus(input);
        process.send?.({ type: "EDGE_PREPARED", result });
      } catch (error) {
        process.send?.({ type: "EDGE_PREPARE_REFUSED", code: error?.code ?? error?.message });
      }
      return;
    }
    if (message.type === "EDGE_STATUS" && edgePort) {
      try {
        const result = await edgePort.status({ ...message.input, prepared: message.prepared, signal: new AbortController().signal });
        process.send?.({ type: "EDGE_STATUS_RESULT", result });
      } catch (error) {
        process.send?.({ type: "EDGE_STATUS_REFUSED", code: error?.code ?? error?.message });
      }
      return;
    }
    if (message.type !== "START" || pool) throw Error("TEST_ONLY_INVALID_MESSAGE");
    const target = new URL(message.database);
    const restored = /^control-api-test-postgres-([a-f0-9]{8})$/.exec(target.hostname);
    const allowedRestore = message.restoreTestOnly === "TEST_ONLY_DISPOSABLE_RESTORE" && restored &&
      target.pathname === `/portal_ack_restore_${restored[1]}`;
    if (!/^control-api-test-postgres-[a-zA-Z0-9_-]+$/.test(target.hostname) ||
        (target.pathname !== "/portal_control_test" && !allowedRestore) ||
        target.protocol !== "postgres:" || target.username !== "portal" || target.search || target.hash)
      throw Error("COMMAND_STATUS_DISPOSABLE_DATABASE_REQUIRED");
    const { importPKCS8, importSPKI } = await import("jose");
    const humanPrivate = await importPKCS8(message.humanPrivate, "EdDSA");
    const sourcePublic = await importSPKI(message.sourcePublic, "EdDSA");
    pool = new Pool({ connectionString: message.database, max: 3, connectionTimeoutMillis: 2000,
      statement_timeout: 5000, query_timeout: 6000, idle_in_transaction_session_timeout: 5000 });
    const auth = new AuthService(pool, { AUTH_MODE: "dev" }, {});
    const relations = new Map(message.relations);
    const trust = { verifyPolicy: async () => null, verifyReceipt: async () => null,
      relations: async principalId => {
        const source = relations.get(principalId);
        if (!source) throw Error("TEST_ONLY_RELATION_MISSING");
        return { qualified: true, revision: "TEST_ONLY:current-observation", own_alpha_ids: [],
          member_portfolio_ids: [message.portfolio], roots: {}, membership: null, current_authority: source };
      },
      verifiedHumanMapping: async principalId => {
        const source = relations.get(principalId);
        if (!source) throw Error("TEST_ONLY_MAPPING_MISSING");
        return { ts_user_id: source.ts_user_id, revision: source.mapping_revision };
      } };
    const access = new ExecutionAccessService(pool, auth, trust, true);
    const candidate = await CurrentHumanCandidate.create(pool, { ...message.candidate,
      private_key: humanPrivate, source: { ...message.candidate.source, public_key: sourcePublic } });
    authority = new CommandSourceAssertionAuthority(pool, access, candidate, { ...message.authority, key: humanPrivate });
    if (message.edgeTransport) {
      const config = message.edgeTransport;
      edgePort = new EdgeCommandStatusTransport(authority, { ...config, tls: {
        key: Buffer.from(config.tls.key, "base64"), cert: Buffer.from(config.tls.cert, "base64"), ca: Buffer.from(config.tls.ca, "base64"),
      } }, new PgCommandStatusOriginalFingerprints(pool));
      authority.bindRecoverySource(edgePort, message.contract);
    } else authority.bindRecoverySource({ original: async () => structuredClone(message.original) }, message.contract);
    const t = createCommandSourceAssertionTransport(authority, { tls: {
      key: Buffer.from(message.core.key, "base64"), cert: Buffer.from(message.core.cert, "base64"), ca: Buffer.from(message.core.ca, "base64") },
      peer: message.peer, limits: { maximum_in_flight: 2, request_bytes: 131072, response_bytes: 65536, deadline_ms: 5000 } });
    server = t.server;
    server.on("tlsClientError", () => undefined);
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    process.send?.({ type: "READY", port: server.address().port });
  } catch (error) {
    // Only a code/message; never emit IPC input, credential, key or token.
    process.send?.({ type: "ERROR", message: String(error?.message ?? error) });
    await stop(); process.exit(1);
  }
});
