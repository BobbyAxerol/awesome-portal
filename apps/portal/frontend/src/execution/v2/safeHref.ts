/**
 * A server-supplied link that is safe to hand to the router: an in-app path with exactly one leading
 * slash. react-router treats `//host`, `/\host` (browsers read a backslash as a slash) and any
 * `scheme:` as external, so all of those, and any control character, a tab or newline browsers strip
 * before parsing, are refused. Anything else is not linked at all.
 */
export function safeInternalHref(href: string | null | undefined): string | null {
  if (typeof href !== "string" || href.length === 0 || href.length > 512) return null;
  if (!href.startsWith("/") || href.startsWith("//") || /[\u0000-\u001f\u007f\\]/.test(href)) return null;
  return href;
}
