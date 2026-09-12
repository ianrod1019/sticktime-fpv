/**
 * ID scrubbing for client-side exports (CSV). Every UUID value — row ids,
 * foreign keys, user ids — is replaced with a small sequential integer from
 * a shared map, so cross-row references survive while the platform's
 * internal identifiers never leave the browser. Mirrors the server-side
 * scrubbing inside `export_my_data` (JSON export).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function scrubUuidsFromRows(rows: Record<string, unknown>[]) {
  const idMap = new Map<string, number>();
  let next = 0;

  const mapId = (raw: string): number => {
    let seq = idMap.get(raw);
    if (seq === undefined) {
      seq = ++next;
      idMap.set(raw, seq);
    }
    return seq;
  };

  return rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        typeof value === "string" && UUID_RE.test(value) ? mapId(value) : value,
      ]),
    ),
  );
}
