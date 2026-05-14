import { describe, expect, it } from 'vitest';
import { IssueIdSchema } from './id.js';

describe('IssueIdSchema', () => {
  it('accepts issue ids with real calendar dates', () => {
    expect(IssueIdSchema.parse('2024-02-29-circle-line-delay')).toBe(
      '2024-02-29-circle-line-delay',
    );
  });

  it('rejects issue ids with impossible calendar dates', () => {
    expect(() => IssueIdSchema.parse('2026-99-99-circle-line-delay')).toThrow(
      'Issue id date must be a real calendar date',
    );
    expect(() => IssueIdSchema.parse('2025-02-29-circle-line-delay')).toThrow(
      'Issue id date must be a real calendar date',
    );
  });
});
