/**
 * Accounts and Account 360, V2 (flag key `account`).
 *
 * One mount, two screens, chosen the way V1's route chose them:
 * - no `accountId`: Accounts, the list of physical bindings (`GET /broker-bindings`)
 *   with a peek drawer per binding. A `binding` prop (the V1 `?binding=` deep link)
 *   opens that binding's peek;
 * - `accountId`: Account 360 for that logical sleeve (`GET /resources/accounts/{id}`),
 *   with `view=physical` swapping the sleeve for the physical binding. V1's Binding
 *   Detail lives there and in the peek (D4); it is not a screen of its own.
 *
 * Sandbox and Live keep their own V1 inline Triad; this package does not touch them.
 *
 * Access: the screen needs `execution.accounts.read` (roleNav `V2_CAPABILITY`, FE-037).
 * A session without it sees the denial, which names the missing area and links My
 * access, never a role. Binding actions (rotate, sync, dry-run) are off for everyone
 * today and say why: nothing publishes a grant for them (FE-015) or a command for them
 * (FE-020).
 *
 * Scale-refine (CLAUDE.md s8), one row per screen:
 *
 * | Screen | Cardinality | Break point | Degradation | Server contract | Invariant | Perf budget |
 * | --- | --- | --- | --- | --- | --- | --- |
 * | Accounts | hi-fi 6 bindings; real 10-10^2 bindings, 1-6 sleeves each | >200 DOM rows; 8 columns unreadable under 660px | keyset `Load more` at 50, stop at 200 with "Top 200 of N"; cards under 660px | `limit` + `after`/`next_cursor`, `environment`, `search`, `venue` (all exist); credential and Issues narrow loaded rows only and say so | counts are the server's (`filtered_count`); no equity or headroom is invented; broker reference never printed | <=200 DOM rows; one list read, one detail and one exposure read per open peek |
 * | Account 360 | 1 account, 1-6 sleeves, 1-4 currencies, <=200 rows per relation | >200 positions or sync rows; multi-currency ledger reads as one number | caps at 200 rows each (`ROW_CAP`), sync shows newest 10, activity keyset `Load more`; one currency at a time (`ccy`) | `/resources/accounts/{id}` bounded to 200 rows per relation; `getBindingExposure`; subject-activity cursor; equity chart is server-downsampled and says so | no sum across currencies or sleeves; Difference is the source's `delta` only; native balance is never attributed to a sleeve (R10) | one resource read, one exposure, one detail; equity and activity read only when their tab is open |
 */
import { useMemo } from "react";

import type { ExecutionApi } from "../../../api/ports";
import { useSession } from "../../../../auth/session";
import { PanelSkeleton, PanelState } from "../../../components/states";
import { withContext } from "../../urlState";
import { Link, useSearchParams } from "react-router-dom";
import { holds } from "../../shell/roleNav";
import { Account360 } from "./Account360";
import { AccountsList } from "./AccountsList";
import { ACCESS_PATH, ACCOUNT_NEEDS } from "./model";

import "../../css/account.css";

export const ACCOUNT_SCREEN_KEY = "account" as const;

export interface AccountScreenProps {
  api: ExecutionApi;
  /** `/deployments/accounts/:accountId`. Absent: the Accounts list. */
  accountId?: string;
  /** The V1 `?binding=` deep link: opens that binding's peek on the list. */
  binding?: string | null;
  /**
   * The capabilities the caller holds. The mount leaves this out and the
   * session's own list is used; a test or an embedding page may pass one.
   */
  capabilities?: ReadonlySet<string>;
}

function Denied() {
  const [params] = useSearchParams();
  return (
    <div className="exec-acct-v2" data-screen="accounts-denied">
      <PanelState
        status="denied"
        title="You can't open this page"
        reason="Your access does not include Accounts."
        actions={<Link className="exec-acct-link" to={withContext(ACCESS_PATH, params)}>See what you can access</Link>}
      />
    </div>
  );
}

export default function AccountScreen({ api, accountId, binding = null, capabilities }: AccountScreenProps) {
  const { access } = useSession();
  const held = useMemo<ReadonlySet<string> | null>(() => {
    if (capabilities !== undefined) return capabilities;
    return access.kind === "ready" ? new Set(access.access.capabilities) : null;
  }, [capabilities, access]);

  if (held === null) {
    if (access.kind === "loading") return <div className="exec-acct-v2"><PanelSkeleton label="Reading your access" /></div>;
    return (
      <div className="exec-acct-v2">
        <PanelState status="unavailable" title="Access not read" reason="Your access could not be read, so this page cannot tell what you may open. This is not a denial." />
      </div>
    );
  }
  if (!holds(held, ACCOUNT_NEEDS.read)) return <Denied />;
  return accountId !== undefined && accountId !== ""
    ? <Account360 api={api} accountId={accountId} capabilities={held} />
    : <AccountsList api={api} binding={binding} capabilities={held} />;
}
