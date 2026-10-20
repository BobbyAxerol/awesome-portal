/**
 * The status lookup of a receipt id (UXM-09, fixture lane): what a read of one command or one F0 operation found.
 *
 * A lookup is a READ: it never sends, never reconciles and never changes the receipt the screen holds. It is answered by two published
 * routes, and the body (not the id) decides which reader runs:
 *
 * - `GET /capital-commands/{id}` -> `portal.execution.command-status.v1` (the four dimensions);
 * - `GET /operations/f0/{id}` -> `execution.command-operation.v1` (a blocked intent: nothing was sent).
 *
 * 401/403/404 stop the screen disclosing: an unknown receipt and one the reader may not see are the SAME answer. A 503 or an
 * unverified receipt is not proof of no effect. Nothing here prints a server message; the words are this file's.
 */
import { readCommandStatusV1, type CommandStatusV1 } from "../../readers/commandCurrency";
import { readCommandProblemV1, readF0BlockedOperationV1, type CommandOperationV1 } from "../../readers/commandOperation";
import type { PortResponse } from "./port";

export type LookupView =
  | { kind: "command"; status: CommandStatusV1 }
  | { kind: "operation"; operation: CommandOperationV1 }
  | { kind: "not_found" }
  | { kind: "access_stopped"; httpStatus: 401 | 403 }
  | { kind: "unverified" }
  | { kind: "unreadable"; httpStatus: number | null }
  | { kind: "no_response" }
  | { kind: "refused"; code: string | null };

export function classifyLookup(answer: PortResponse): LookupView {
  if (answer.kind === "no_response") return { kind: "no_response" };
  const { status, body } = answer;
  // 404 is "unknown or hidden": one answer, so a probe learns nothing about which.
  if (status === 404) return { kind: "not_found" };
  if (status === 401 || status === 403) return { kind: "access_stopped", httpStatus: status };
  if (status >= 200 && status < 300) {
    const command = readCommandStatusV1(body);
    if (command !== null && command.kind === "command_status") return { kind: "command", status: command.status };
    const operation = readF0BlockedOperationV1(body);
    if (operation !== null && operation.kind === "command_operation") return { kind: "operation", operation: operation.operation };
    return { kind: "unreadable", httpStatus: status };
  }
  const problem = readCommandProblemV1(body);
  if (problem !== null && problem.code === "COMMAND_STATUS_UNVERIFIED") return { kind: "unverified" };
  if (status >= 500) return { kind: "unverified" };
  if (status >= 400) return { kind: "refused", code: problem?.code ?? null };
  return { kind: "unreadable", httpStatus: status };
}
