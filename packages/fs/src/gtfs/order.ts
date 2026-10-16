// Use code-point ordering rather than locale-dependent collation in hashed reports.
export function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Normalize digit-only integers without converting them to floating point. */
export function normalizeDecimalString(value: string): string {
  return value.replace(/^0+(?=\d)/, '');
}

/** Valid sequences sort numerically; malformed values sort last for diagnostics. */
export function compareStopSequences(a: string, b: string): number {
  const aValid = /^\d+$/.test(a);
  const bValid = /^\d+$/.test(b);
  if (aValid !== bValid) return aValid ? -1 : 1;
  if (!aValid) return compareStrings(a, b);
  const left = normalizeDecimalString(a);
  const right = normalizeDecimalString(b);
  return left.length - right.length || compareStrings(left, right);
}
