import { describe, it, expect } from 'vitest';
import { formatRelativeDate, summariseChanges } from '../../src/web/components/StalenessBanner';

describe('formatRelativeDate', () => {
  const now = new Date('2026-05-04T12:00:00.000Z');

  it('returns "just now" for sub-minute differences', () => {
    expect(formatRelativeDate('2026-05-04T11:59:30.000Z', now)).toBe('just now');
  });

  it('returns minutes when under an hour', () => {
    expect(formatRelativeDate('2026-05-04T11:45:00.000Z', now)).toBe('15 min ago');
  });

  it('returns hours when under a day (singular and plural)', () => {
    expect(formatRelativeDate('2026-05-04T11:00:00.000Z', now)).toBe('1 hour ago');
    expect(formatRelativeDate('2026-05-04T07:00:00.000Z', now)).toBe('5 hours ago');
  });

  it('returns days when under a month', () => {
    expect(formatRelativeDate('2026-05-01T12:00:00.000Z', now)).toBe('3 days ago');
    expect(formatRelativeDate('2026-05-03T12:00:00.000Z', now)).toBe('1 day ago');
  });

  it('falls back to a locale date when older than 30 days', () => {
    expect(formatRelativeDate('2026-01-01T12:00:00.000Z', now)).toMatch(/\d/);
  });
});

describe('summariseChanges', () => {
  it('returns null when undefined', () => {
    expect(summariseChanges(undefined)).toBeNull();
  });

  it('returns null when all categories are empty', () => {
    expect(summariseChanges({ added: [], removed: [], changed: [] })).toBeNull();
  });

  it('summarises a single category', () => {
    expect(summariseChanges({ added: ['a'], removed: [], changed: [] })).toBe('1 added');
    expect(summariseChanges({ added: [], removed: ['x', 'y'], changed: [] })).toBe('2 removed');
    expect(summariseChanges({ added: [], removed: [], changed: ['c'] })).toBe('1 changed');
  });

  it('joins multiple categories with middle dots', () => {
    expect(summariseChanges({ added: ['a'], removed: ['r'], changed: ['c', 'd'] })).toBe('1 added · 2 changed · 1 removed');
  });
});
