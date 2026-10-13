// Use code-point ordering rather than locale-dependent collation in hashed reports.
export function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
