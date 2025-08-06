export function generateTownId(name: string): string {
  return name
    .trim()
    .replace(/\bTown\b/i, '') // Remove 'Town' suffix if present
    .toLowerCase()
    .normalize('NFKD') // Normalize unicode
    .replace(/[^\w\s]/g, '') // Remove non-word characters except spaces
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/_+/g, '-') // Collapse multiple hyphens
    .replace(/^-+|-+$/g, ''); // Trim leading/trailing hyphens
}
