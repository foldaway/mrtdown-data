export function generateLandmarkId(
  name: string,
  options?: { stripSuffixes?: boolean },
): string {
  const suffixesToRemove = [
    'Mall',
    'Park',
    'Plaza',
    'Building',
    'Centre',
    'Center',
    'Tower',
    'Complex',
  ];

  let processed = name.trim();

  if (options?.stripSuffixes) {
    for (const suffix of suffixesToRemove) {
      const regex = new RegExp(`\\b${suffix}\\b`, 'i');
      processed = processed.replace(regex, '');
    }
  }

  return processed
    .toLowerCase()
    .normalize('NFKD') // Handle accents like é → e
    .replace(/[^\w\s]/g, '') // Remove punctuation/symbols except alphanumerics & spaces
    .replace(/\s+/g, '-') // Convert spaces to hyphens
    .replace(/_+/g, '-') // Collapse multiple hyphens
    .replace(/^-+|-+$/g, ''); // Trim leading/trailing hyphens
}
