import { describe, expect, it } from 'vitest';
import { normalizePageInfo } from '../useImportPlaylist.js';

describe('normalizePageInfo', () => {
  it('treats empty string cursor as null', () => {
    const result = normalizePageInfo({ cursor: '' });
    expect(result.cursor).toBeNull();
    expect(result.hasMore).toBe(false);
  });

  it('treats whitespace cursor as null', () => {
    const result = normalizePageInfo({ cursor: '   ' });
    expect(result.cursor).toBeNull();
    expect(result.hasMore).toBe(false);
  });

  it('treats undefined cursor as null', () => {
    const result = normalizePageInfo({ cursor: undefined });
    expect(result.cursor).toBeNull();
    expect(result.hasMore).toBe(false);
  });

  it('treats null cursor as null', () => {
    const result = normalizePageInfo({ cursor: null });
    expect(result.cursor).toBeNull();
    expect(result.hasMore).toBe(false);
  });

  it('returns trimmed cursor string', () => {
    const result = normalizePageInfo({ cursor: ' abc ', hasMore: true });
    expect(result.cursor).toBe('abc');
    expect(result.hasMore).toBe(true);
  });
});

