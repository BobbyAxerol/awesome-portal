/** The private wire messages are flat string/boolean objects. Reject duplicate
 * keys (including escaped aliases), nested JSON and invalid UTF-8 BEFORE schema
 * validation; JSON.parse alone would silently choose a different last value. */
export function parseCurrentHumanWire(bytes: Uint8Array): Record<string, string | boolean> {
  const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const quoted = /"(?:[^"\\\u0000-\u001f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"/y;
  let i = 0;
  const ws = () => { while (/[\x20\t\n\r]/.test(source[i] ?? "!") && i < source.length) i++; };
  const fail = (): never => { throw new Error("CURRENT_HUMAN_WIRE_INVALID"); };
  const string = () => {
    quoted.lastIndex = i;
    const match = quoted.exec(source);
    if (!match) return fail();
    i = quoted.lastIndex;
    return JSON.parse(match[0]) as string;
  };
  const result: Record<string, string | boolean> = Object.create(null);
  ws(); if (source[i++] !== "{") fail(); ws();
  if (source[i] !== "}") {
    while (true) {
      const key = string();
      if (Object.hasOwn(result, key)) fail();
      ws(); if (source[i++] !== ":") fail(); ws();
      if (source[i] === '"') result[key] = string();
      else if (source.slice(i, i + 4) === "true") { result[key] = true; i += 4; }
      else if (source.slice(i, i + 5) === "false") { result[key] = false; i += 5; }
      else fail();
      ws();
      if (source[i] !== ",") break;
      i++; ws();
    }
  }
  if (source[i++] !== "}") fail(); ws();
  if (i !== source.length) fail();
  return result;
}
