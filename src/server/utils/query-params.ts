/**
 * Express query/param values can arrive as string | string[] (e.g. ?id=a&id=b).
 * These helpers normalize them so Prisma filters receive plain strings.
 */
export function qstr(value: unknown): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  if (v === undefined || v === null) return undefined;
  return String(v);
}

/** Like qstr but throws-free required variant: returns '' when absent. */
export function qstrReq(value: unknown): string {
  return qstr(value) ?? '';
}
