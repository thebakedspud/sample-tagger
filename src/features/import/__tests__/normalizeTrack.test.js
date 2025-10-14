import { describe, it, expect } from 'vitest';
import { normalizeTrack } from '../normalizeTrack.js';

describe('normalizeTrack', () => {
  it('preserves provided identifier', () => {
    const track = normalizeTrack({ id: 'explicit-id', title: 'Song', artist: 'Artist' }, 5, 'spotify');
    expect(track.id).toBe('explicit-id');
  });

  it('creates a provider-prefixed identifier when missing', () => {
    const track = normalizeTrack({ title: 'Song', artist: 'Artist' }, 0, 'spotify');
    expect(track.id).toBe('spotify-1');
  });

  it('falls back to friendly title and artist defaults', () => {
    const track = normalizeTrack({}, 1, 'youtube');
    expect(track.title).toBe('Untitled Track 2');
    expect(track.artist).toBe('Unknown Artist');
  });

  it('retains additional metadata fields', () => {
    const raw = { title: 'S', artist: 'A', durationMs: 1234, thumbnailUrl: 'thumb.jpg' };
    const track = normalizeTrack(raw, 2, 'soundcloud');
    expect(track.durationMs).toBe(1234);
    expect(track.thumbnailUrl).toBe('thumb.jpg');
  });
});
