import { z } from "zod";
import { OperationalReadError } from "../operations/current-operational-read";

// Source-only preparation for the four WP-K sibling readers. This is not an
// authorization provider or a mounted HTTP route. In particular, a fixture or
// a count is not a source for a per-record body.
const id = z.string().min(1).max(191).regex(/^[A-Za-z0-9._:-]+$/);
const ms = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const dec = z.string().max(80).regex(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/);
const text = (max: number) => z.string().min(1).max(max).regex(/^[^\u0000-\u001f\u007f]+$/);
const code = z.string().regex(/^[A-Z][A-Z0-9_]{1,63}$/);
const sec = <T extends z.ZodTypeAny>(v: T) => v.nullable().optional();
const subject = z.object({ type: z.enum(["ALPHA", "PORTFOLIO", "ACCOUNT", "DEPLOYMENT", "OPERATION", "INCIDENT", "APPROVAL"]), id }).strict();
const money = z.object({ currency: text(32), value: dec }).strict();
const head = <T extends string>(name: T) => ({ schema_version: z.literal(`portal.execution.${name}.v1`),
  workspace_id: text(256), record_authority: z.literal("PORTAL_PROJECTION"), read_at_ms: ms });
const order = z.object({ ...head("order-detail"), order_id: id, deployment_id: sec(id), filled_quantity: sec(dec),
  average_fill_price: sec(dec), fee: sec(money), fee_absence: sec(z.enum(["NO_FILLS", "FILL_WITHOUT_COMMISSION", "MIXED_FEE_CURRENCIES"])),
  ack_latency_ms: sec(integer), intent: sec(z.object({ intent_id: id, idempotency_scope: z.enum(["ACTOR_REQUEST_KEY", "WORKSPACE_REQUEST_KEY"]) }).strict()) }).strict()
  .refine(v => !(v.fee != null && v.fee_absence != null));
const figure = z.object({ currency: text(32), value: dec, as_of_ms: ms }).strict();
const account = z.object({ ...head("account-profile"), account_id: id, product: sec(text(128)),
  network: sec(z.object({ name: text(64), proof_at_ms: ms.nullable() }).strict()),
  margin_mode: sec(z.enum(["CROSS", "ISOLATED", "PORTFOLIO", "NONE"])),
  margin_ratio: sec(z.object({ percent: dec, as_of_ms: ms }).strict()), wallet_balance: sec(figure), native_equity: sec(figure) }).strict();
const reconciliation = z.object({ ...head("reconciliation"), subject,
  runs: sec(z.array(z.object({ run_id: id, state: z.enum(["RUNNING", "MATCHED", "BREAKS_FOUND", "FAILED"]),
    started_at_ms: ms, finished_at_ms: ms.nullable(), breaks_open: integer }).strict()).max(100)),
  breaks: sec(z.array(z.object({ break_id: id, run_id: id, state: z.enum(["OPEN", "RESOLVING", "RESOLVED"]),
    kind: z.enum(["POSITION", "BALANCE", "ORDER", "FILL"]), resolution_revision: integer.min(1).nullable(), detected_at_ms: ms }).strict()).max(200)) }).strict();
const obligations = z.object({ ...head("obligations"), subject,
  items: sec(z.array(z.object({ obligation_id: id, kind: z.enum(["OPEN_POSITION", "WORKING_ORDER", "RESERVATION", "UNKNOWN_OUTCOME", "SETTLEMENT_PENDING"]),
    state: code, recovery_id: id.nullable(), order_id: id.nullable(), operation_id: id.nullable(), opened_at_ms: ms }).strict()).max(200)) }).strict();

export const siblingSchemas = { "order-detail": order, "account-profile": account, reconciliation, obligations } as const;
export type SiblingKind = keyof typeof siblingSchemas;
export type SiblingScope = Readonly<{ workspaceId: string; principalId: string; sessionId: string;
  environment: "paper" | "sandbox" | "live"; kind: SiblingKind; targetType: string; targetId: string }>;
export type SiblingSourceResult = Readonly<{ scope: SiblingScope; body: unknown; complete: boolean }>;
export interface SiblingSourcePort { read(scope: SiblingScope): Promise<SiblingSourceResult>; }
export interface SiblingAuthority { check(scope: SiblingScope): Promise<boolean>; }

/** Deny by default: do not manufacture an empty/available response. */
export const sourceNotCommissioned: SiblingSourcePort = { async read() {
  throw new OperationalReadError("SIBLING_SOURCE_NOT_COMMISSIONED");
} };

/** The caller must bind an exact current-human/field authority and source
 * custody through HTTP egress before mounting. This two-check seam is not an
 * atomic egress fence and deliberately cannot commission a provider itself.
 * V1 has no continuation contract, so incomplete populations are refused. */
export class SiblingSourceSeam {
  constructor(private readonly authority: SiblingAuthority, private readonly source: SiblingSourcePort = sourceNotCommissioned) {}
  async read(input: SiblingScope): Promise<unknown> {
    const scope = Object.freeze({ ...input });
    if (!id.safeParse(scope.targetId).success || !text(256).safeParse(scope.workspaceId).success ||
        !id.safeParse(scope.principalId).success || !id.safeParse(scope.sessionId).success ||
        !["paper", "sandbox", "live"].includes(scope.environment) || !Object.prototype.hasOwnProperty.call(siblingSchemas, scope.kind) ||
        scope.kind === "order-detail" && scope.targetType !== "ORDER" ||
        scope.kind === "account-profile" && scope.targetType !== "ACCOUNT" ||
        (scope.kind === "reconciliation" || scope.kind === "obligations") &&
          !subject.shape.type.options.includes(scope.targetType as typeof subject.shape.type.options[number]))
      throw new OperationalReadError("SIBLING_INPUT_INVALID", 400);
    if (!(await this.authority.check(scope))) throw new OperationalReadError("SIBLING_ACCESS_DENIED", 404);
    let source: SiblingSourceResult;
    try { source = await this.source.read(scope); }
    catch (error) {
      if (!(await this.authority.check(scope))) throw new OperationalReadError("SIBLING_ACCESS_DENIED", 404);
      if (error instanceof OperationalReadError) throw error;
      throw new OperationalReadError("SIBLING_SOURCE_UNAVAILABLE");
    }
    if (!(await this.authority.check(scope))) throw new OperationalReadError("SIBLING_ACCESS_DENIED", 404);
    if (!source || !source.scope || Object.keys(scope).some(k => scope[k as keyof SiblingScope] !== source.scope[k as keyof SiblingScope]))
      throw new OperationalReadError("SIBLING_SOURCE_SCOPE_MISMATCH");
    if (source.complete !== true) throw new OperationalReadError("SIBLING_PAGINATION_NOT_COMMISSIONED");
    const parsed = siblingSchemas[scope.kind].safeParse(source.body);
    if (!parsed.success || parsed.data.workspace_id !== scope.workspaceId) throw new OperationalReadError("SIBLING_SOURCE_INVALID");
    const data = parsed.data;
    if (scope.kind === "order-detail" && (!("order_id" in data) || data.order_id !== scope.targetId) ||
        scope.kind === "account-profile" && (!("account_id" in data) || data.account_id !== scope.targetId) ||
        (scope.kind === "reconciliation" || scope.kind === "obligations") && (!("subject" in data) || data.subject.id !== scope.targetId || data.subject.type !== scope.targetType))
      throw new OperationalReadError("SIBLING_SOURCE_SCOPE_MISMATCH");
    return data;
  }
}
