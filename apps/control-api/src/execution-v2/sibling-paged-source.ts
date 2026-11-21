import { OperationalReadError } from "../operations/current-operational-read";
import { isSiblingSourceCoordinate, SiblingPageCursorCodec, type SiblingPageBinding } from "./sibling-page-cursor";
import { SiblingSourceSeam, type SiblingAuthority, type SiblingScope, type SiblingSourceResult } from "./sibling-source-seam";

/** Internal pagination used by the versioned sibling composition, not a route.
 * The binding must be derived by the server from CURRENT authority and a
 * source-confirmed snapshot, never constructed from browser-provided claims.
 * The caller must still hold an authorized source/field egress fence while
 * actually transmitting the resulting bytes. */
export type SiblingPageSource = {
  read(scope: SiblingScope, input: Readonly<{ snapshot_id: string; position: string | null; page_size: number }>):
    Promise<SiblingSourceResult & { snapshot_id: string; next_source: string | null }>;
};
export class SiblingPagedSource {
  constructor(private readonly authority: SiblingAuthority, private readonly source: SiblingPageSource,
    private readonly codec: SiblingPageCursorCodec) {}

  async read(scope: SiblingScope, binding: SiblingPageBinding, cursor: string | null): Promise<{ body: unknown; next_cursor: string | null }> {
    const selected = Object.freeze({ ...scope }), b = Object.freeze({ ...binding });
    if ((selected.kind !== "reconciliation" && selected.kind !== "obligations") || b.kind !== selected.kind ||
        b.workspace_id !== selected.workspaceId || b.principal_id !== selected.principalId ||
        b.session_id !== selected.sessionId || b.session_generation !== selected.sessionGeneration || b.environment !== selected.environment ||
        b.target_type !== selected.targetType || b.target_id !== selected.targetId)
      throw new OperationalReadError("SIBLING_INPUT_INVALID", 400);
    let next: string | null = null;
    const seam = new SiblingSourceSeam(this.authority, { read: async captured => {
      // The seam's first authority check has already succeeded. Cursor
      // validity is query metadata: do not reveal it before access is checked.
      // The seam checks authority again even when validation fails.
      let position: string | null;
      try {
        // Validate every binding field for the first page too. This temporary
        // coordinate is never returned and is not an authorization grant.
        this.codec.encode(b, "first-page-validation");
        position = cursor === null ? null : this.codec.decode(cursor, b);
      } catch { throw new OperationalReadError("SIBLING_CURSOR_INVALID_OR_EXPIRED", 400); }
      const page = await this.source.read(captured, Object.freeze({ snapshot_id: b.snapshot_id, position, page_size: b.page_size }));
      if (!page || page.snapshot_id !== b.snapshot_id ||
          !(page.next_source === null || isSiblingSourceCoordinate(page.next_source)) ||
          page.complete !== (page.next_source === null) || page.next_source !== null && page.next_source === position ||
          !page.body || typeof page.body !== "object" || Object.hasOwn(page.body, "next_cursor"))
        throw new OperationalReadError("SIBLING_SOURCE_INVALID");
      next = page.next_source;
      // The V1 schema validates this page's record shape; completion here
      // applies to the page, not to the source population.
      return { scope: page.scope, body: page.body, complete: true };
    } });
    const body = await seam.read(selected);
    const record = body as { items?: { obligation_id: string }[] | null; runs?: { run_id: string }[] | null;
      breaks?: { break_id: string }[] | null };
    const size = (record.items?.length ?? 0) + (record.runs?.length ?? 0) + (record.breaks?.length ?? 0);
    if (size > b.page_size) throw new OperationalReadError("SIBLING_SOURCE_INVALID");
    const distinct = (ids: string[]) => new Set(ids).size === ids.length;
    if (!distinct((record.items ?? []).map(item => item.obligation_id)) ||
        !distinct((record.runs ?? []).map(run => run.run_id)) || !distinct((record.breaks ?? []).map(entry => entry.break_id)))
      throw new OperationalReadError("SIBLING_SOURCE_INVALID");
    return { body, next_cursor: next === null ? null : this.codec.encode(b, next) };
  }
}
