/**
 * P23 qualification lane — typed stub builders for the fifteen Research screens.
 *
 * Fixture lane only. Nothing here is a backend: every body is one of the
 * repository's own fixtures (`e2e/research-foundation/*.json`, served by
 * `stubPortalApi` in `../fixtures`), a canonical contract fixture
 * (`packages/contracts/fixtures/*.valid.json`, re-keyed by `contractFixture`),
 * or a builder typed against the generated contract
 * (`packages/contracts/generated/*.d.ts`) the screen reads:
 *
 *  - S08 Execute replay  ← `src/research/executeReplay.test.tsx` fixture (P17)
 *  - S09 Run report      ← contract fixture `research-report.wfo-retained` (W6a, frozen core v2)
 *  - S10 Lineage         ← contract fixture `research-attempt-lineage.healthy` (W6b, lineage 1.1.0)
 *  - S11 Release cand.   ← P22 receipt probe `COMPOSE()` incl. `publication`/`mirror`
 *  - S13 Compare         ← contract fixtures `research-compare.{attempts,markets,pair-ok}` (W6a)
 *  - S03 terminal run    ← `research-foundation/progress-read.json` with a
 *                          contract-typed `run_completed` frame
 *
 * The compile-time `satisfies`/return types are the point: a contract change
 * that makes one of these bodies stale fails `tsc` before it fails a browser.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { BrowserContext, Page, Request, Route } from "@playwright/test";

import type { components as CompareC } from "../../../../../packages/contracts/generated/research-compare";
import type { components as LineageC } from "../../../../../packages/contracts/generated/research-attempt-lineage";
import type { components as PreflightC } from "../../../../../packages/contracts/generated/research-preflight";
import type { components as ProgressC } from "../../../../../packages/contracts/generated/research-progress";
import type { components as ReplayC } from "../../../../../packages/contracts/generated/research-replay";
import type { components as ReportC } from "../../../../../packages/contracts/generated/research-report";
import type { RcCompose as PortalRcCompose, RcMirror as PortalRcMirror } from "../../src/research/releaseCandidateClient";

import { stubPortalApi } from "../fixtures";

type Replay = ReplayC["schemas"]["Replay"];
type ReportDetail = ReportC["schemas"]["ReportDetail"];
type Lineage = LineageC["schemas"]["AttemptLineageResponse"];
type Compare = CompareC["schemas"]["CompareResponse"];
type RcCompose = PortalRcCompose;
type RcMirror = PortalRcMirror;
type ProgressRead = ProgressC["schemas"]["ProgressRead"];
type DatasetCatalog = PreflightC["schemas"]["DatasetCatalog"];
type ProgressStreamEvent = ProgressC["schemas"]["ProgressStreamEvent"];
type RcFieldKey = RcCompose["fields"][number]["key"];
type RcPackKey = RcCompose["pack"][number]["key"];

const HERE = dirname(fileURLToPath(import.meta.url));
const FOUNDATION = join(HERE, "..", "research-foundation");

/** One of the repository's own fixture bodies as committed bytes. */
export function foundationRaw(name: string): string {
  return readFileSync(join(FOUNDATION, name), "utf8");
}

/** One of the repository's own fixture bodies, parsed fresh (callers may mutate). */
export function foundation<T = Record<string, unknown>>(name: string): T {
  return JSON.parse(readFileSync(join(FOUNDATION, name), "utf8")) as T;
}

const CONTRACT_FIXTURES = join(HERE, "..", "..", "..", "..", "..", "packages", "contracts", "fixtures");

/**
 * A canonical contract fixture (`packages/contracts/fixtures/<name>.valid.json`),
 * with each `[from, to]` literal replaced throughout its bytes before parsing.
 * The contracts suite validates these files against Zod and OpenAPI, so the
 * cast below is backed by a schema check, not by trust.
 */
export function contractFixture<T>(name: string, replace: readonly (readonly [string, string])[] = []): T {
  let raw = readFileSync(join(CONTRACT_FIXTURES, `${name}.valid.json`), "utf8");
  for (const [from, to] of replace) raw = raw.replaceAll(from, to);
  return JSON.parse(raw) as T;
}

/* ------------------------------------------------------------------ ids */

/** The run every committed S04–S07 fixture describes. */
export const EVIDENCE_RUN = "R-WFO-118";
/** The run `progress-read.json` describes. */
export const PROGRESS_RUN = "run_01HZQ7PROBE";
export const RC_RUN = "run_rc_0917";
export const RC_ID = "rc_01J9P21SEAL0000000001";
export const ALPHA = "alpha-momentum-btc";
const RC_ATT = "att_rc_0917";
const AV_ID = "alphaver_093";
const APPROVAL = "apr_01J9P22R1000000000001";

/**
 * A server sentence no screen may print. Stubbed refusals carry it so a
 * matrix cell can prove the copy it shows is the screen's own. The test never
 * asserts what the prose says — only that it is absent.
 */
export const SERVER_PROSE_SENTINEL = "zq_P23_SERVER_PROSE_SENTINEL alice@example.invalid";

/* --------------------------------------------------------------- helpers */

const AV = { state: "AVAILABLE", reason_code: null } as const;
const np = (reason: string) => ({ state: "NOT_PUBLISHED" as const, reason_code: reason });
const na = (reason: string) => ({ state: "NOT_APPLICABLE" as const, reason_code: reason });
const pa = (reason: string) => ({ state: "PARTIAL" as const, reason_code: reason });
const hex = (c: string) => c.repeat(64);
const dg = (c: string) => `sha256:${hex(c)}`;

type Json = Record<string, unknown>;

async function json(route: Route, body: unknown, headers: Record<string, string> = {}): Promise<void> {
  try {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "cache-control": "private, no-store", ...headers },
      body: JSON.stringify(body),
    });
  } catch {
    /* the page aborted this request (navigation or a superseded read) */
  }
}

/** Answers 304 when the page revalidates the exact copy it holds, else the body. */
async function withEtag(route: Route, body: { etag: string | null }): Promise<void> {
  const inm = route.request().headers()["if-none-match"] ?? null;
  if (body.etag && inm === body.etag) {
    try {
      await route.fulfill({ status: 304, headers: { etag: body.etag, "cache-control": "private, no-store" } });
    } catch {
      /* aborted */
    }
    return;
  }
  await json(route, body, body.etag ? { etag: body.etag } : {});
}

/* ======================================================================
 * S08 — Execute replay (P17). Shape from `executeReplay.test.tsx`.
 * ==================================================================== */

export const REPLAY_TOTAL = 240;
export const REPLAY_WINDOW = 100;
const REPLAY_T0 = 1_725_000_000_000;
const HOUR = 3_600_000;
const replayToken = (kind: string, n: number) => `kc1.${kind}-k1.${String(n).padStart(32, "a")}.${"b".repeat(43)}`;

const REPLAY_REASON: Record<keyof Replay["route_capabilities"], string> = {
  orders: "P04_SOURCE_DID_NOT_PUBLISH_EXECUTION_ORDER_LEDGER",
  fills: "P04_SOURCE_DID_NOT_PUBLISH_AUDITED_FILLS",
  trades: "P04_SOURCE_DID_NOT_PUBLISH_EXECUTION_TRADE_LEDGER",
  positions: "P04_SOURCE_DID_NOT_PUBLISH_POSITION_STATE_SNAPSHOTS",
  execution_events: "P04_SOURCE_DID_NOT_PUBLISH_EXECUTION_EVENT_STREAM",
  candle_windows: "P04_SOURCE_DID_NOT_PUBLISH_REPLAY_CANDLE_WINDOWS",
  sl_tp_ambiguity: "P04_SOURCE_DID_NOT_PUBLISH_INTRABAR_SL_TP_AMBIGUITY",
  oco_tree: "P04_SOURCE_DID_NOT_PUBLISH_OCO_PARENT_CHILD_RELATIONSHIPS",
  multi_leg: "P04_SOURCE_DID_NOT_PUBLISH_MULTI_LEG_EXECUTION_FACTS",
  funding: "P04_SOURCE_DID_NOT_PUBLISH_FUNDING",
  mae_mfe: "P04_SOURCE_DID_NOT_PUBLISH_MAE_MFE_INPUTS",
  fold_capital: "P04_SOURCE_DID_NOT_PUBLISH_FOLD_CAPITAL_CONVENTION",
  child_audit_provenance: "P04_SOURCE_DID_NOT_PUBLISH_CHILD_AUDIT_REPLAY_PROVENANCE",
};
const EXEC_STATE = "P04_SOURCE_DID_NOT_PUBLISH_EXECUTION_STATE_SNAPSHOTS";
const gap = (reason: string) => ({ state: "NOT_PUBLISHED" as const, reason_code: reason, availability: np(reason) });

/** One bounded window starting at `start`; `selected` pins `state_at_cursor`. */
export function replayWindow(runId: string, start: number, selected: number | null = null): Replay {
  const first = Math.max(0, Math.min(start, REPLAY_TOTAL - 1));
  const count = Math.min(REPLAY_WINDOW, REPLAY_TOTAL - first);
  const items = Array.from({ length: count }, (_, i) => {
    const ordinal = first + i;
    return {
      playback_ordinal: ordinal,
      at_utc_ms: REPLAY_T0 + ordinal * HOUR,
      equity: (100 + ordinal * 0.25).toFixed(2),
      drawdown_fraction: ordinal % 5 === 0 ? "0.0125" : "0",
      playback_cursor: replayToken("at", ordinal),
    };
  });
  const point = selected === null ? null : items.find((p) => p.playback_ordinal === selected) ?? null;
  const revision = `p17r1_${hex("a")}`;
  const capabilities = Object.fromEntries(
    (Object.keys(REPLAY_REASON) as (keyof Replay["route_capabilities"])[]).map((key) => [key, gap(REPLAY_REASON[key])]),
  ) as Replay["route_capabilities"];
  return {
    schema_version: "research.replay.v1",
    read_authority: "PORTAL_PERSISTED_RESEARCH",
    run_id: runId,
    revision,
    etag: `"${revision}"`,
    availability: AV,
    readiness: "PARTIAL",
    as_of_utc_ms: 1_726_000_000_000,
    provenance: {
      source_adapter_id: "p04.delta-rsi.v1",
      evidence_revision: `p13r1_${hex("b")}`,
      source_transform_digest: hex("c"),
      input_scope: "P08_OPTIONAL_WARMUP_PLUS_IS_OOS_ONLY",
    },
    route: {
      id: "signal_notional",
      state: "RETROSPECTIVE_EQUITY_ONLY",
      replay_contract: "P17_CURRENT_P04_EQUITY_SAMPLE_V1",
      availability: AV,
    },
    equity_replay: {
      state: "AVAILABLE",
      source_observation_count: REPLAY_TOTAL,
      emitted_point_count: REPLAY_TOTAL,
      sampling: "FULL",
      items,
      page: {
        limit: REPLAY_WINDOW,
        next_cursor: first + count < REPLAY_TOTAL ? replayToken("next", first + count) : null,
        prev_cursor: first > 0 ? replayToken("prev", Math.max(0, first - REPLAY_WINDOW)) : null,
        has_more: first + count < REPLAY_TOTAL,
        has_previous: first > 0,
        order: "SOURCE_CHRONOLOGICAL_SAMPLE_ORDINAL_ASC",
      },
      state_at_cursor: point
        ? {
            state: "AVAILABLE_RETROSPECTIVE_EQUITY_SAMPLE",
            semantics: "RETROSPECTIVE_EQUITY_NOT_EXECUTION_STATE",
            playback_ordinal: point.playback_ordinal,
            at_utc_ms: point.at_utc_ms,
            equity: point.equity,
            drawdown_fraction: point.drawdown_fraction,
            source_sampling: "FULL",
            execution_state: gap(EXEC_STATE),
            availability: AV,
          }
        : {
            state: "NOT_SELECTED",
            semantics: "NO_SELECTED_PLAYHEAD",
            playback_ordinal: null,
            at_utc_ms: null,
            equity: null,
            drawdown_fraction: null,
            source_sampling: null,
            execution_state: gap(EXEC_STATE),
            availability: AV,
          },
      availability: AV,
    },
    route_capabilities: capabilities,
    source_absences: {
      execution_state: gap(EXEC_STATE),
      cross_stream_order: {
        state: "NOT_ASSERTED",
        reason_code: "P04_SOURCE_DID_NOT_PUBLISH_CROSS_STREAM_EXECUTION_ORDER",
        availability: np("P04_SOURCE_DID_NOT_PUBLISH_CROSS_STREAM_EXECUTION_ORDER"),
      },
    },
  };
}

/** Maps the four navigation inputs of `replayClient.ts` onto a window. */
function replayFor(url: URL, runId: string): Replay {
  const q = url.searchParams;
  const ordinalOf = (token: string) => Number(token.split(".")[2]?.replace(/^a+/, "") || "0");
  if (q.has("at_ordinal")) {
    const ordinal = Number(q.get("at_ordinal"));
    return replayWindow(runId, Math.floor(ordinal / REPLAY_WINDOW) * REPLAY_WINDOW, ordinal);
  }
  if (q.has("at")) {
    const ordinal = ordinalOf(q.get("at")!);
    return replayWindow(runId, Math.floor(ordinal / REPLAY_WINDOW) * REPLAY_WINDOW, ordinal);
  }
  if (q.has("cursor")) return replayWindow(runId, ordinalOf(q.get("cursor")!));
  if (q.has("before")) return replayWindow(runId, ordinalOf(q.get("before")!));
  return replayWindow(runId, 0);
}

/* ======================================================================
 * S09 — Run report (P18) and S10 — Attempt lineage (P19).
 *
 * Both bodies are the contract's own canonical fixtures
 * (`packages/contracts/fixtures/*.valid.json`, validated against Zod and the
 * OpenAPI schema on every contracts run), re-keyed to the run / Alpha the
 * page addresses. Nothing is hand-typed, so a contract change reaches this
 * lane through the fixture, not through a stale copy of it.
 * ==================================================================== */

/** The seeded report revision tag for the fixture run; a distinct one for any other run. */
export function reportTagFor(runId: string): string {
  return runId === EVIDENCE_RUN ? "7" : "8";
}

/** S09: the W6a retained-WFO report (frozen core v2), re-keyed to `runId` and revision tag `tag`. */
export function reportDetail(runId: string, tag = "7"): ReportDetail {
  const base = contractFixture<ReportDetail>("research-report.wfo-retained");
  return contractFixture<ReportDetail>("research-report.wfo-retained", [
    [base.run_id, runId],
    [base.report_revision, `p18r1_${hex(tag)}`],
  ]);
}

/** S10: the P19 healthy lineage (W6b lineage 1.1.0 fields included), re-keyed to `alphaId`. */
export function lineage(alphaId: string = ALPHA): Lineage {
  const base = contractFixture<Lineage>("research-attempt-lineage.healthy");
  return contractFixture<Lineage>("research-attempt-lineage.healthy", [[base.alpha.alpha_id, alphaId]]);
}

/* ======================================================================
 * S11 — Release candidate compose (P21 + P22 publication/mirror).
 * ==================================================================== */

const RC_T0 = 1_785_000_000_000;
const RC_SEALED_AT = RC_T0 + 3_600_000;
const RC_PUBLISHED_AT = RC_SEALED_AT + 3_600_000;
const DECL = { known: "fees modelled at taker; funding not modelled", restr: "research only — no capital until P22 review" };
const declDigest = (t: string) => `sha256:decl_${t.length.toString(16).padStart(4, "a")}${hex("d").slice(8)}`;

export function rcMirror(rcId: string = RC_ID): RcMirror {
  return {
    schema_version: "research.release-candidate-approval-mirror.v1",
    release_candidate_id: rcId,
    approval_id: APPROVAL,
    href: `/governance/approvals/${APPROVAL}/r1`,
    availability: AV,
    gate: "R1",
    subject_id: ALPHA,
    subject_label: `${rcId} — ${ALPHA} ${AV_ID}`,
    status: "PENDING",
    effective_status: "PENDING",
    sla_due_at: "2026-07-26T10:40:00.000Z",
    expires_at: "2026-07-28T10:40:00.000Z",
    created_at: "2026-07-25T10:40:00.000Z",
    quorum_met: 0,
    quorum_required: 1,
    approval_version: 1,
    evidence_set_hash: dg("9"),
    blocker_count: 0,
    condition_count: 0,
    conditions: [],
    decision_outcomes: [],
    rc_superseded: false,
    as_of_utc_ms: RC_PUBLISHED_AT,
  };
}

/** The seeded candidate for `RC_RUN`; any other run gets its own id (stale-response scenarios). */
export function rcIdFor(runId: string): string {
  return runId === RC_RUN ? RC_ID : `rc_01J9P23STALE${runId.replace(/[^A-Za-z0-9]/g, "").slice(-8).toUpperCase().padStart(8, "0")}`;
}

/** `published: false` is the sealed local candidate (publish offered); `true` carries the mirror. */
export function rcCompose(runId: string = RC_RUN, rcId: string = RC_ID, published = false): RcCompose {
  const FP = dg("f");
  const f = (key: RcFieldKey, label: string, value: string, tone: "ink" | "gold" = "ink") => ({ key, label, value, availability: AV, tone });
  const fields = [
    f("release_candidate_id", "Release candidate ID", rcId),
    f("alpha_id", "Alpha ID", ALPHA),
    f("alpha_version_id", "Alpha version ID", AV_ID),
    f("alpha_code_digest", "Alpha code digest", dg("a")),
    f("alpha_entrypoint", "Alpha entrypoint", "alphas.momentum_btc:Alpha"),
    f("final_audit_run_id", "Final audit run ID", runId),
    f("final_audit_attempt_id", "Final audit attempt ID", RC_ATT),
    f("requested_spec_digest", "Requested spec digest", dg("1")),
    f("effective_spec_digest", "Effective spec digest", dg("2")),
    f("dataset_binding_digest", "Dataset binding digest", dg("3")),
    f("manifest_digest", "Manifest digest", dg("4")),
    f("source_transform_digest", "Source transform digest", dg("5")),
    f("engine_release_id", "Engine release", "quantbt-1.1.1"),
    f("adapter_contract_digest", "Adapter contract digest", dg("6")),
    f("parameter_bundle_digest", "Parameter bundle digest", dg("7")),
    f("evidence_revision", "Evidence revision", "evrev_7"),
    f("report_revision", "Report revision", "rprev_3"),
  ];
  const runHref = `/research/quantbt/runs/${runId}`;
  const C = (key: RcPackKey, n: number, item: string, label: string, href: string | null, digest: string, note: string) => ({
    key, n, item, status: "COMPLETE" as const, digest, source: { label, href }, note, availability: AV,
  });
  const I = (key: RcPackKey, n: number, item: string, value: string, note: string) => ({
    key, n, item, status: "INPUT" as const, digest: declDigest(value), source: { label: "Researcher declaration", href: null }, note, availability: AV,
  });
  const pack = [
    C("ALPHA_VERSION_PASSPORT", 1, "Alpha Version passport", "Alpha 360°", `/research/alphas/${ALPHA}`, dg("a"), "Exact Alpha version identity is retained."),
    C("ENGINE_CAPABILITY_BACKEND", 2, "Engine/capability/backend", "Engine Atlas", "/research/quantbt", dg("6"), "Pinned adapter contract and engine release are retained."),
    C("DATASET_UNIVERSE_SNAPSHOTS", 3, "Dataset & universe snapshots", "Data snapshots", runHref, dg("3"), "Dataset binding and exact manifest identities agree across retained source facts."),
    C("METHODOLOGY_CLAIM", 4, "Methodology claim", "Evidence Flow", `${runHref}/evidence`, dg("8"), "Source-issued methodology claim and certificate are retained without a browser-generated interpretation."),
    C("SELECTED_PARAMS_LINEAGE", 5, "Selected params lineage", "Search & diagnostics", `${runHref}/search`, dg("7"), "Selected trial and parameter bundle are retained."),
    C("FINAL_AUDIT_REPLAY", 6, "Final audit replay", "Replay", `${runHref}/replay`, dg("9"), "Exact READY AUDIT_OF_SELECTION run has retained evidence and chronology revisions."),
    C("METRICS_SEMANTICS", 7, "Metrics semantics", "Run report", `${runHref}/report`, dg("9"), "Immutable evidence projection is complete."),
    C("EXECUTION_ASSUMPTIONS", 8, "Execution assumptions", "Split & chronology", `${runHref}/split`, dg("6"), "Declared adapter route is an assumption only; this pack makes no deployment decision."),
    {
      key: "ROBUSTNESS_PARAM_STABILITY_REGIME" as const, n: 9, item: "Robustness/param stability/regime", status: "DEGRADED" as const, digest: dg("9"),
      source: { label: "Compare", href: `/research/alphas/${ALPHA}/compare` },
      note: "Current source publishes bounded evidence but not a complete stability/regime certificate; the degraded state travels unchanged.",
      availability: pa("P21_SOURCE_DEGRADED_EVIDENCE"),
    },
    I("KNOWN_LIMITATIONS_WAIVERS", 10, "Known limitations & waivers", DECL.known, "Researcher-signed declaration; it cannot hide a missing mandatory item."),
    C("REPRODUCIBILITY_PARITY_CHECKSUMS", 11, "Reproducibility/parity checksums", "Freeze & integrity", `${runHref}/freeze`, dg("b"), "Retained manifest, transform and sealed Report checksum are all explicitly pinned."),
    I("PROPOSED_USE_RESTRICTIONS", 12, "Proposed use restrictions", DECL.restr, "Researcher-signed declaration; downstream approval policy belongs to P22."),
  ];
  const count = (s: string) => pack.filter((p) => p.status === s).length;
  const actor = { user_id: "usr_researcher", username: "researcher@bobby" };
  const absences: RcCompose["source_absences"] = published
    ? { alpha_binding: AV, execution_deployment: na("P21_EXECUTION_DEPLOYMENT_OUT_OF_SCOPE") }
    : { alpha_binding: AV, approval_mirror: np("P22_NOT_PUBLISHED"), execution_deployment: na("P21_EXECUTION_DEPLOYMENT_OUT_OF_SCOPE") };
  const body = {
    schema_version: "research.release-candidate-compose.v1",
    read_authority: "PORTAL_PERSISTED_RESEARCH",
    run_id: runId,
    state: published ? "PUBLISHED" : "DRAFT",
    availability: AV,
    as_of_utc_ms: RC_T0,
    source_fingerprint: FP,
    run: { id: runId, attempt: RC_ATT, binding: { alpha_id: ALPHA, alpha_version_id: AV_ID, lifecycle_state: "ACTIVE" } },
    rail: [
      { key: "alpha", value: ALPHA, detail: "mom_breakout_v3", tone: "ink" },
      { key: "alpha_version", value: AV_ID, detail: `sha256:${hex("a").slice(0, 12)}`, tone: "ink" },
      { key: "run", value: runId, detail: RC_ATT, tone: "ink" },
      { key: "selected_params", value: dg("7"), detail: "TRIAL", tone: "ink" },
      { key: "release_candidate", value: rcId, detail: published ? "published · immutable" : "sealed locally — not delivered", tone: "green" },
    ],
    taxonomy: [
      { what: "code / entrypoint (av_)", state: "UNSET", consequence: "No published predecessor is available, so no code-change or gate conclusion is inferred." },
      { what: "selected strategy params", state: "UNSET", consequence: "Current exact parameter bundle is pinned, but no predecessor comparison is published." },
      { what: "data contract / dataset snapshot", state: "UNSET", consequence: "Current dataset binding is pinned, but no predecessor comparison is published." },
    ],
    published_comparison: { last_release_candidate_id: null, availability: np("P22_NO_PUBLISHED_PREDECESSOR") },
    certification_axes: {
      methodology_claim: { value: "B", availability: AV },
      engine_execution_contract: { value: null, availability: np("P21_ENGINE_EXECUTION_CERTIFICATION_NOT_PUBLISHED") },
    },
    gate_verdict: published
      ? { title: "published — immutable · R1 review in Approval Inbox", body: "Any further change creates a new candidate." }
      : { title: "local seal ready — publish to Approval Inbox", body: "The pack is sealed; publishing creates the R1 approval in the governance store." },
    draft: {
      draft_id: "rcd_01J9P21DRAFT00001", revision: 1, source_fingerprint: FP, known_limitations: DECL.known,
      proposed_use_restrictions: DECL.restr, state: "PERSISTED", updated_at_utc_ms: RC_T0 + 60_000,
    },
    fields,
    yaml: fields,
    pack,
    pack_counts: { complete: count("COMPLETE"), degraded: count("DEGRADED"), input: count("INPUT"), missing: count("MISSING") },
    local_seal: {
      state: "SEALED_LOCAL", release_candidate_id: rcId, pack_digest: dg("c"), sealed_at_utc_ms: RC_SEALED_AT,
      delivery_state: published ? "DELIVERED" : "NOT_DELIVERED", approval_state: published ? "PENDING" : "NOT_APPROVED", availability: AV,
    },
    actions: {
      may_edit_draft: !published,
      may_seal: false,
      seal_blocked_reason: published ? "P22_ALREADY_PUBLISHED" : "P21_ALREADY_SEALED",
      publish: { enabled: !published, blocked_reason: published ? "P22_ALREADY_PUBLISHED" : null, release_candidate_id: rcId },
    },
    publication: published
      ? {
          availability: AV, state: "DELIVERED", release_candidate_id: rcId, approval_id: APPROVAL, conflicting_approval_id: null,
          downstream_code: null, downstream_receipt_digest: dg("0"), attempt_count: 1, intent_actor: actor,
          updated_at_utc_ms: RC_PUBLISHED_AT, reconcile_allowed: false, claim_candidates: ["mclaim_01J9"],
        }
      : {
          availability: np("P22_NOT_PUBLISHED"), state: null, release_candidate_id: rcId, approval_id: null, conflicting_approval_id: null,
          downstream_code: null, downstream_receipt_digest: null, attempt_count: null, intent_actor: null, updated_at_utc_ms: null,
          reconcile_allowed: false, claim_candidates: ["mclaim_01J9"],
        },
    mirror: published ? rcMirror(rcId) : null,
    source_absences: absences,
  } satisfies RcCompose;
  return body;
}

/* ======================================================================
 * S13 — Compare (P20). The W6a canonical fixtures (attempts / markets /
 * pair-ok), re-keyed to the Alpha and — for a pair — the two runs the URL
 * names. Each distinct key answers its own revision, so a validator for one
 * key never matches another.
 * ==================================================================== */

function compareRekeyed(name: string, alphaId: string, pairs: readonly (readonly [string, string])[] = [], key: string = name): Compare {
  const base = contractFixture<Compare>(name);
  const revision = `p20r1_${createHash("sha256").update(`${key}|${alphaId}`).digest("hex")}`;
  const body = contractFixture<Compare>(name, [[base.revision, revision], ...pairs]);
  return { ...body, alpha: { ...body.alpha, alpha_id: alphaId } };
}

export function compareAttempts(alphaId: string = ALPHA): Compare {
  return compareRekeyed("research-compare.attempts", alphaId);
}

export function compareMarkets(alphaId: string = ALPHA): Compare {
  return compareRekeyed("research-compare.markets", alphaId);
}

export function comparePair(alphaId: string, left: string, right: string): Compare {
  const base = contractFixture<Compare>("research-compare.pair-ok");
  if (base.result.mode !== "pair" || base.result.pair === null) throw new Error("research-compare.pair-ok is not a comparable pair");
  const [a, b] = base.result.pair.runs;
  return compareRekeyed("research-compare.pair-ok", alphaId, [[a!.run_id, left], [b!.run_id, right]], `pair|${left}|${right}`);
}

function compareFor(url: URL, alphaId: string): Compare | null {
  const mode = url.searchParams.get("mode");
  const runs = url.searchParams.get("runs");
  if (mode === "markets") return compareMarkets(alphaId);
  if (mode === "pair" || (mode === null && runs)) {
    const [left, right] = (runs ?? "").split(",");
    return left && right ? comparePair(alphaId, left, right) : null;
  }
  return compareAttempts(alphaId);
}

/* ======================================================================
 * S02 — the W4 dataset catalog (CG-P08-04). No canonical contract fixture is
 * published for it, so the body is typed against `research-preflight.d.ts`
 * and names the dataset `split-detail.json` already uses.
 * ==================================================================== */

export function datasetCatalog(): DatasetCatalog {
  return {
    schema_version: "research.dataset-catalog.v1",
    coverage_rule: "Coverage is the month partitions present in the approved reader's storage layout.",
    datasets: [
      {
        dataset_id: "crypto-binance-1m",
        venue: "BINANCE",
        availability: "available",
        unavailable_reason: null,
        source_class: "historical_market_data",
        usage_scopes: ["backtest", "research"],
        excluded_scopes: [],
        source_timezone: "UTC",
        calendar_policy: "CRYPTO_24_7",
        timeframes: ["1min", "1h", "4h", "1D"],
        symbols: {
          state: "PUBLISHED",
          reason: null,
          total: 1,
          truncated: false,
          items: [
            { symbol: "BTCUSDT", contract_kind: "PERPETUAL", coverage: { first_month: "2020-01", last_month: "2026-09", months: 81, granularity: "MONTH_PARTITION" } },
          ],
        },
      },
    ],
  };
}

/* ======================================================================
 * S03 — progress, running and terminal.
 * ==================================================================== */

export function progressRead(status: "RUNNING" | "COMPLETED"): ProgressRead {
  const base = foundation<ProgressRead>("progress-read.json");
  if (status === "RUNNING") return base;
  const done = { ...base.progress!, status: "COMPLETED" as const, latest_sequence: 41 };
  done.stages = done.stages.map((s) => ({ ...s, state: "DONE" as const, started_at_utc_ms: s.started_at_utc_ms ?? base.progress!.created_at_utc_ms, completed_at_utc_ms: s.completed_at_utc_ms ?? base.progress!.updated_at_utc_ms }));
  done.overall = { ...done.overall, pct: 100, eta_s: 0 };
  done.folds = done.folds.map((fold) => ({ ...fold, state: "DONE" as const, completed_at_utc_ms: fold.completed_at_utc_ms ?? base.progress!.updated_at_utc_ms }));
  return {
    ...base,
    current: { ...base.current, job_state: "completed", effective_status: "COMPLETED", terminal_resolution: "SOURCE", source_latest_sequence: 41, may_cancel: false },
    progress: done,
  };
}

/** The contract's `run_completed` frame, typed against `ProgressStreamEvent`. */
export function runCompletedFrame(runId: string = PROGRESS_RUN): ProgressStreamEvent {
  return {
    event: {
      schema_version: "research.progress-event.v1",
      run_id: runId,
      sequence: 41,
      event_type: "run_completed",
      occurred_at_utc_ms: 1_789_836_590_000,
      payload: { usage: { peak_rss_bytes: 512_000_000, cpu_seconds: 610, scratch_bytes: 0, fd_peak: 32 } },
    },
    snapshot: null,
  } as ProgressStreamEvent;
}

/* ======================================================================
 * Lane installation
 * ==================================================================== */

export interface LaneOptions {
  /** Distinct stub identity (`qual-user-NN`) answered by `/api/auth/context`. */
  identity?: string;
  /** S03: `terminal-after-event` answers RUNNING, streams `run_completed`, then answers COMPLETED. */
  progress?: "running" | "terminal-after-event";
  /** Per-request stub delay in ms (stale-response scenarios). */
  delayMs?: (url: URL) => number;
}

const RE = {
  replay: /\/api\/v1\/quantbt\/runs\/([^/?]+)\/execute\/replay(\?|$)/,
  report: /\/api\/v1\/quantbt\/runs\/([^/?]+)\/report(\?|$)/,
  compose: /\/api\/v1\/quantbt\/runs\/([^/?]+)\/release-candidate(\?|$)/,
  mirror: /\/api\/v1\/research\/release-candidates\/([^/?]+)\/mirror(\?|$)/,
  lineage: /\/api\/v1\/research\/alphas\/([^/?]+)\/lineage(\?|$)/,
  compare: /\/api\/v1\/research\/alphas\/([^/?]+)\/compare(\?|$)/,
  datasets: /\/api\/v1\/research\/datasets(\?|$)/,
  progress: /\/api\/v1\/research\/runs\/([^/?]+)\/progress(\?|$)/,
  events: /\/api\/v1\/research\/runs\/([^/?]+)\/events(\?|$)/,
} as const;

const delay = (ms: number) => (ms > 0 ? new Promise<void>((resolve) => setTimeout(resolve, ms)) : Promise.resolve());

/**
 * Installs the whole fixture lane on one page: the repository's Portal stubs,
 * then the per-screen builders above (registered later, so they win).
 */
export async function installLane(page: Page, options: LaneOptions = {}): Promise<void> {
  await stubPortalApi(page, "healthy");
  const wait = (route: Route) => delay(options.delayMs?.(new URL(route.request().url())) ?? 0);

  if (options.identity) {
    const username = options.identity;
    await page.route("**/api/auth/context", (route) =>
      json(route, {
        state: "AUTHENTICATED",
        principal: {
          principalId: `principal-${username}`,
          username,
          /* Same role the baseline `/api/admin/access/self` stub answers for;
             only the identity differs per context. */
          role: "ADMIN",
          sessionId: `session-${username}`,
          mustChangePassword: false,
          authnMethods: ["access", "password"],
          issuedAt: "2026-08-17T09:00:00+00:00",
          exp: 2000000000,
        },
        access_identity: { sub: `access-${username}`, email: `${username}@qualification.invalid` },
      }),
    );
  }

  await page.route(RE.datasets, (route) => json(route, datasetCatalog()));
  await page.route(RE.replay, async (route) => {
    const url = new URL(route.request().url());
    await wait(route);
    await json(route, replayFor(url, decodeURIComponent(url.pathname.match(RE.replay)![1]!)));
  });
  await page.route(RE.report, async (route) => {
    const url = new URL(route.request().url());
    await wait(route);
    const runId = decodeURIComponent(url.pathname.match(RE.report)![1]!);
    await withEtag(route, reportDetail(runId, reportTagFor(runId)));
  });
  await page.route(RE.compose, async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const url = new URL(route.request().url());
    await wait(route);
    const runId = decodeURIComponent(url.pathname.match(RE.compose)![1]!);
    await json(route, rcCompose(runId, rcIdFor(runId)));
  });
  await page.route(RE.mirror, async (route) => {
    const url = new URL(route.request().url());
    await json(route, rcMirror(decodeURIComponent(url.pathname.match(RE.mirror)![1]!)));
  });
  await page.route(RE.lineage, async (route) => {
    const url = new URL(route.request().url());
    await wait(route);
    await json(route, lineage(decodeURIComponent(url.pathname.match(RE.lineage)![1]!)));
  });
  await page.route(RE.compare, async (route) => {
    const url = new URL(route.request().url());
    await wait(route);
    const body = compareFor(url, decodeURIComponent(url.pathname.match(RE.compare)![1]!));
    if (body === null) {
      return refuse(route, 404, "RESEARCH_COMPARE_NOT_FOUND");
    }
    await withEtag(route, body);
  });

  if (options.progress === "terminal-after-event") {
    let reads = 0;
    let streamed = false;
    await page.route(RE.progress, async (route) => {
      reads += 1;
      /* RUNNING until the stream has delivered the terminal event; the
         snapshot the client then reads is authoritative for COMPLETED. */
      await json(route, progressRead(streamed ? "COMPLETED" : "RUNNING"));
      void reads;
    });
    await page.route(RE.events, async (route) => {
      streamed = true;
      try {
        await route.fulfill({
          status: 200,
          contentType: "text/event-stream",
          headers: { "cache-control": "no-store" },
          body: `data: ${JSON.stringify(runCompletedFrame())}\n\n`,
        });
      } catch {
        /* aborted */
      }
    });
  }
}

/** A refusal in the contract's Problem shape, carrying the sentinel prose. */
export async function refuse(route: Route, status: number, code: string): Promise<void> {
  try {
    await route.fulfill({
      status,
      contentType: "application/json",
      headers: { "cache-control": "private, no-store", "x-request-id": `req_p23_hdr_${status}` },
      body: JSON.stringify({ error: { code, message: SERVER_PROSE_SENTINEL }, request_id: `req_p23_${status}` }),
    });
  } catch {
    /* aborted */
  }
}

/** Overrides one screen's primary read(s) with a refusal; returns the route handle to remove it. */
export async function refusePrimary(page: Page, primary: RegExp, status: number): Promise<() => Promise<void>> {
  const code = { 401: "UNAUTHENTICATED", 403: "RESEARCH_FORBIDDEN", 404: "RESEARCH_NOT_FOUND", 503: "RESEARCH_UNAVAILABLE" }[status] ?? "RESEARCH_REFUSED";
  const handler = async (route: Route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await refuse(route, status, code);
  };
  await page.route(primary, handler);
  return () => page.unroute(primary, handler);
}

/* ======================================================================
 * Screens
 * ==================================================================== */

export interface ScreenDef {
  /** Two-digit spec screen number. */
  id: string;
  title: string;
  /** Deep link, including the cursor hash for 04–08. */
  path: string;
  /** The screen's own root, inside the Portal shell. */
  root: string;
  /** The read(s) the denied/unavailable/expired cells refuse. Matched on the full URL. */
  primary: RegExp;
  /** 04–08 share the evidence cursor in the hash. */
  cursor: boolean;
}

const RUN_BASE = `/research/quantbt/runs/${EVIDENCE_RUN}`;
const CURSOR_HASH = "#stage=split&fold=2&params=prm_3b81c7";

export const SCREENS: readonly ScreenDef[] = [
  { id: "00", title: "journey map", path: "/research/quantbt/journey", root: "[data-screen='journey-map']", primary: /\/api\/v1\/research\/journey(\?|$)/, cursor: false },
  { id: "12", title: "engine atlas", path: "/research/quantbt/atlas", root: "[data-screen='engine-atlas']", primary: /\/api\/v1\/research\/quantbt\/atlas(\?|$)/, cursor: false },
  { id: "02", title: "new run", path: "/research/quantbt/runs/new", root: "[data-screen='new-run']", primary: /\/api\/v1\/research\/quantbt\/atlas(\?|$)/, cursor: false },
  { id: "14", title: "alpha import", path: "/research/quantbt/alpha-import", root: "[data-screen='alpha-import']", primary: /\/api\/v1\/research\/alphas(\?|$)/, cursor: false },
  { id: "01", title: "run library", path: "/research/quantbt/runs", root: "[data-screen='run-library']", primary: /\/api\/v1\/quantbt\/runs(\?|$)/, cursor: false },
  { id: "03", title: "run progress", path: `/research/quantbt/runs/${PROGRESS_RUN}/progress`, root: "[data-screen='run-progress']", primary: /\/api\/v1\/research\/runs\/[^/?]+\/(progress|events)(\?|$)/, cursor: false },
  { id: "04", title: "evidence hub", path: `${RUN_BASE}/evidence#stage=search&fold=3&params=prm_7c1a9e`, root: "[data-screen='evidence-flow']", primary: /\/api\/v1\/quantbt\/runs\/[^/?]+\/evidence(\?|$)/, cursor: true },
  { id: "05", title: "split", path: `${RUN_BASE}/split${CURSOR_HASH}`, root: "[data-screen='split-detail']", primary: /\/api\/v1\/quantbt\/runs\/[^/?]+\/split(\?|$)/, cursor: true },
  { id: "06", title: "search", path: `${RUN_BASE}/search${CURSOR_HASH}`, root: "[data-screen='search-detail']", primary: /\/api\/v1\/quantbt\/runs\/[^/?]+\/search(\?|$)/, cursor: true },
  { id: "07", title: "freeze", path: `${RUN_BASE}/freeze${CURSOR_HASH}`, root: "[data-screen='freeze-detail']", primary: /\/api\/v1\/quantbt\/runs\/[^/?]+\/freeze(\?|$)/, cursor: true },
  { id: "08", title: "execute replay", path: `${RUN_BASE}/execute#stage=execute&fold=2&params=prm_3b81c7&seq=5`, root: "[data-screen='execute-replay']", primary: RE.replay, cursor: true },
  { id: "09", title: "run report", path: `${RUN_BASE}/report`, root: "[data-screen='run-report']", primary: RE.report, cursor: false },
  { id: "10", title: "attempt lineage", path: `/research/quantbt/alphas/${ALPHA}/lineage`, root: "[data-screen='attempt-lineage']", primary: RE.lineage, cursor: false },
  { id: "11", title: "release candidate", path: `/research/quantbt/runs/${RC_RUN}/release-candidate`, root: "[data-screen='release-candidate']", primary: RE.compose, cursor: false },
  { id: "13", title: "compare", path: `/research/quantbt/alphas/${ALPHA}/compare`, root: "[data-screen='compare']", primary: RE.compare, cursor: false },
];

export function screen(id: string): ScreenDef {
  const found = SCREENS.find((s) => s.id === id);
  if (!found) throw new Error(`no screen ${id}`);
  return found;
}

/* ======================================================================
 * Observation
 * ==================================================================== */

export const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export interface ApiRequest {
  method: string;
  /** pathname + search */
  url: string;
  startedAt: number;
  endedAt: number | null;
  status: number | null;
  failure: string | null;
}

export interface NetLog {
  requests: ApiRequest[];
  /** URLs answered >= 400 (deliberate stub refusals) — their Chrome resource-load line is expected. */
  refused: Set<string>;
  /** Requests the catch-all answered 501: a fixture gap, never a pass. */
  gaps: string[];
  pending: () => number;
  writes: () => ApiRequest[];
  /** Two identical GETs in flight at once where neither was aborted. */
  concurrentDuplicates: () => string[];
}

function isTopFrame(request: Request): boolean {
  try {
    return request.frame().parentFrame() === null;
  } catch {
    return false;
  }
}

/** Records every same-origin `/api/` request on a page or a whole context. */
export function watchNetwork(target: Page | BrowserContext): NetLog {
  const requests: ApiRequest[] = [];
  const byRequest = new Map<Request, ApiRequest>();
  const refused = new Set<string>();
  const gaps: string[] = [];
  const on = target as Page;
  on.on("request", (request: Request) => {
    /* A new top-level document replaces the old one. Requests the old
       document still had in flight (often parked in a stub handler) never
       report finished or failed once their page is gone, so they are closed
       here as orphans instead of counting as pending forever. */
    if (request.isNavigationRequest() && isTopFrame(request)) {
      const now = Date.now();
      for (const entry of requests) {
        if (entry.endedAt === null) {
          entry.endedAt = now;
          entry.failure = "document-replaced";
        }
      }
    }
    const url = new URL(request.url());
    if (!url.pathname.startsWith("/api/")) return;
    const entry: ApiRequest = { method: request.method(), url: url.pathname + url.search, startedAt: Date.now(), endedAt: null, status: null, failure: null };
    requests.push(entry);
    byRequest.set(request, entry);
  });
  on.on("requestfinished", async (request: Request) => {
    const entry = byRequest.get(request);
    if (!entry) return;
    entry.endedAt = Date.now();
    const response = await request.response().catch(() => null);
    entry.status = response?.status() ?? null;
    if (entry.status !== null && entry.status >= 400) refused.add(request.url());
    if (entry.status === 501) gaps.push(`${entry.method} ${entry.url}`);
  });
  on.on("requestfailed", (request: Request) => {
    const entry = byRequest.get(request);
    if (!entry) return;
    entry.endedAt = Date.now();
    entry.failure = request.failure()?.errorText ?? "failed";
  });
  return {
    requests,
    refused,
    gaps,
    pending: () => requests.filter((r) => r.endedAt === null).length,
    writes: () => requests.filter((r) => WRITE_METHODS.has(r.method)),
    concurrentDuplicates: () => {
      const out: string[] = [];
      const done = requests.filter((r) => r.method === "GET" && r.failure === null && r.endedAt !== null);
      for (let i = 0; i < done.length; i += 1) {
        for (let j = i + 1; j < done.length; j += 1) {
          const a = done[i]!;
          const b = done[j]!;
          if (a.url === b.url && b.startedAt < a.endedAt! && a.startedAt < b.endedAt!) out.push(a.url);
        }
      }
      return out;
    },
  };
}

/**
 * Console errors/warnings and page errors. A Chrome "Failed to load resource"
 * line is expected only for a URL the stub deliberately answered >= 400; any
 * other console output is noise and fails the cell.
 */
export function watchConsole(page: Page, net: NetLog): { noise: string[]; expected: string[] } {
  const noise: string[] = [];
  const expected: string[] = [];
  page.on("console", (message) => {
    if (message.type() !== "error" && message.type() !== "warning") return;
    const text = message.text();
    const at = message.location().url;
    if (text.startsWith("Failed to load resource") && at && net.refused.has(at)) {
      expected.push(`${message.type()}: ${text} @ ${new URL(at).pathname}`);
      return;
    }
    /* The refusal's response may be recorded a tick after Chrome logs it. */
    if (text.startsWith("Failed to load resource") && at && /status of (40[0134]|409|503)/.test(text)) {
      expected.push(`${message.type()}: ${text} @ ${new URL(at).pathname} (late)`);
      return;
    }
    noise.push(`${message.type()}: ${text.slice(0, 240)}${at ? ` @ ${at.replace(/^https?:\/\/[^/]+/, "")}` : ""}`);
  });
  page.on("pageerror", (error) => noise.push(`pageerror: ${String(error).slice(0, 240)}`));
  return { noise, expected };
}
