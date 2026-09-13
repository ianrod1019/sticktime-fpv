/**
 * Input sanitization for user-authored strings BEFORE they are stored.
 *
 * Not HTML escaping (React already escapes on render) — this strips the
 * control characters and injection-adjacent junk that would otherwise sit in
 * the DB forever: zero-width/bidi override characters (invisible spoofing),
 * C0/C1 control codes, and trailing whitespace. Length caps bound storage and
 * render cost.
 */

// C0 controls (0x00-0x1F except \n \t which callers may keep), DEL (0x7F),
// C1 controls (0x80-0x9F), zero-width & bidi override characters, BOM.
// no-control-regex is silenced for the whole file: stripping control
// characters from untrusted input is precisely this module's job, and the
// rule has no per-pattern exception.
/* eslint-disable no-control-regex */
const STRIP_RE = new RegExp(
  "[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F\\u0080-\\u009F\\u200B-\\u200F\\u202A-\\u202E\\u2060-\\u206F\\uFEFF]",
  "g",
);
/* eslint-enable no-control-regex */

/**
 * Trim and strip invisible/control characters. Collapses interior runs of
 * whitespace to single spaces (input fields shouldn't carry "\n\n\n\n").
 */
export function sanitizeText(value: unknown): string {
  if (typeof value !== "string") return "";

  return value.replace(STRIP_RE, "").replace(/\s+/g, " ").trim();
}

/** sanitizeText with a hard length cap (applied after stripping). */
export function sanitizeTextCapped(value: unknown, maxLength: number): string {
  return sanitizeText(value).slice(0, maxLength);
}

/** Multi-line variant: keeps single newlines, strips everything else. */
export function sanitizeMultiline(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/\r\n?/g, "\n")
    .replace(STRIP_RE, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxLength);
}

/**
 * Sanitize the free-text fields of a bench part before insert/update.
 * Kept here (not in the hooks) so the personal and squadron benches share
 * one implementation — the drift between those twins is exactly the kind of
 * bug a shared sanitizer prevents.
 */
export function sanitizePartInput<
  T extends { name?: string; brand?: string | null; vendor?: string | null },
>(input: T): T {
  return {
    ...input,
    name: input.name == null ? input.name : sanitizeTextCapped(input.name, 80),
    brand:
      input.brand == null ? input.brand : sanitizeTextCapped(input.brand, 60),
    vendor:
      input.vendor == null
        ? input.vendor
        : sanitizeTextCapped(input.vendor, 80),
  };
}
