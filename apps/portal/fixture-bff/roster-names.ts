/**
 * WORLD (QA4 R1-11, R3-04, R3-05): ONE roster of people and ONE set of alphas. The generated universe and the suite name owners with their own seed words
 * (`Bobby-001`, `Lan-002` ...), the approval fixtures name their people `usr_stan` and their subjects `Carry v3.2`; in the positive world every served body
 * names them as the people of the roster (`Bobby Vu`, `usr_0004` ...) and the subjects as alphas the fleet holds (`Carry A`, `Basis B` ...), the very names the
 * Users list, the grants, Cmd K and the Fleet print. Applied to the serialised body, so no double has to know it.
 */
import { scaled } from "../frontend/e2e/bffScale";

const SEED_OWNER_TO_PERSON: Readonly<Record<string, string>> = {
  "Bobby-001": "Bobby Vu",
  "Lan-002": "Lan Tran",
  "Minh-003": "Minh Pham",
  "Hana-004": "Stan Le",
  "Ivo-005": "Hoa Nguyen",
  "Sora-006": "Tuan Do",
};
/** The fixture approvals' people are the roster's (same ids, same user names). */
const USER_ID: Readonly<Record<string, string>> = { usr_bobby: "usr_0001", usr_lan: "usr_0002", usr_minh: "usr_0003", usr_stan: "usr_0004", usr_hoa: "usr_0005", usr_tuan: "usr_0006" };
const NATIVE_SUBJECT: Readonly<Record<string, string>> = { "Carry v3.2": "Carry A", "Carry v3.1": "Carry A", "RSI v1.7": "Basis B", "RSI v0.9": "Basis B", "Momentum v4": "Momentum C", "Grid v2.1": "Grid D" };
const SUBJECT_WORD = /\b(?:Carry|RSI|Grid|Momentum|Basis|MeanRev|Spread|Vol-Target) v\d+(?:\.\d+)?\b/g;
const OWNER = new RegExp(`\\b(${Object.keys(SEED_OWNER_TO_PERSON).join("|")})\\b`, "g");
const USER = new RegExp(`\\b(${Object.keys(USER_ID).join("|")})\\b`, "g");

function hash(text: string): number {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
}
/** A subject name that is not one of the native five is one of the generated fleet's alphas, chosen by the name itself so it never changes. */
function subjectOf(name: string): string {
  const native = NATIVE_SUBJECT[name];
  if (native !== undefined) return native;
  const labels = scaled().alphas.map((alpha) => alpha.label);
  return labels.length === 0 ? "Carry A" : labels[hash(name) % labels.length]!;
}

/** A closed approval has its quorum: an approved record met what it required. */
function closeQuorum(value: unknown): void {
  if (Array.isArray(value)) { for (const item of value) closeQuorum(item); return; }
  if (value === null || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  if (record.status === "APPROVED" && typeof record.quorum_required === "number" && typeof record.quorum_met === "number") record.quorum_met = record.quorum_required;
  for (const child of Object.values(record)) closeQuorum(child);
}

export function rosterNames<T>(body: T): T {
  if (body === null || typeof body !== "object") return body;
  const text = JSON.stringify(body);
  const changed = text.replace(OWNER, (word) => SEED_OWNER_TO_PERSON[word] ?? word).replace(USER, (word) => USER_ID[word] ?? word).replace(SUBJECT_WORD, subjectOf);
  const next = changed === text ? body : (JSON.parse(changed) as T);
  if (/"status":"APPROVED"/.test(changed)) closeQuorum(next);
  return next;
}
