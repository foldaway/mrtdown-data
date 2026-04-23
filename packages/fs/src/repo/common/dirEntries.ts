/**
 * Returns directory entry names excluding dotfiles and dot-directories
 * (e.g. `.DS_Store`, `.git`).
 */
export function visibleDirEntries(names: readonly string[]): string[] {
  return names.filter((name) => !name.startsWith('.'));
}
