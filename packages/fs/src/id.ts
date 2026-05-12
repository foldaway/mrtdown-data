import { IssueIdSchema } from '@mrtdown/core';

export function slugifyIssueTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');

  if (slug.length === 0) {
    throw new Error(
      'Issue title must contain at least one ASCII letter or digit',
    );
  }

  return slug;
}

export function buildIssueId(date: string, titleOrSlug: string): string {
  const slug = slugifyIssueTitle(titleOrSlug);
  return IssueIdSchema.parse(`${date}-${slug}`);
}
