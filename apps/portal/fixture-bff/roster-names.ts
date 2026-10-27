/**
 * WORLD (QA4 R1-11): ONE roster of people. The generated universe and the suite name owners with its own seed words (`Bobby-001`, `Lan-002` ...);
 * in the positive world every served body names them as the people of the roster (`Bobby Vu`, `Lan Tran` ...), the very names the Users list,
 * the grants, the approvals and the audit feed print. Applied to the serialised body, so no double has to know it.
 */
const SEED_OWNER_TO_PERSON: Readonly<Record<string, string>> = {
  "Bobby-001": "Bobby Vu",
  "Lan-002": "Lan Tran",
  "Minh-003": "Minh Pham",
  "Hana-004": "Stan Le",
  "Ivo-005": "Hoa Nguyen",
  "Sora-006": "Tuan Do",
};
const PATTERN = new RegExp(`\\b(${Object.keys(SEED_OWNER_TO_PERSON).join("|")})\\b`, "g");

export function rosterNames<T>(body: T): T {
  if (body === null || typeof body !== "object") return body;
  const text = JSON.stringify(body);
  if (!PATTERN.test(text)) return body;
  PATTERN.lastIndex = 0;
  return JSON.parse(text.replace(PATTERN, (word) => SEED_OWNER_TO_PERSON[word] ?? word)) as T;
}
