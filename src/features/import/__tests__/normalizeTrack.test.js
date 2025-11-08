// @ts-nocheck
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

  it('sanitizes album and drops empty values', () => {
    const trackWithAlbum = normalizeTrack({ title: 'Song', artist: 'Artist', album: '  Album  ' }, 3, 'spotify');
    expect(trackWithAlbum.album).toBe('Album');

    const trackWithoutAlbum = normalizeTrack({ title: 'Song', artist: 'Artist', album: '   ' }, 4, 'spotify');
    expect(trackWithoutAlbum.album).toBeUndefined();
  });

  it('normalizes dateAdded and removes invalid timestamps', () => {
    const fromNumber = normalizeTrack({ title: 'Song', artist: 'Artist', dateAdded: Date.UTC(2024, 0, 1) }, 0, 'spotify');
    expect(fromNumber.dateAdded).toBe(new Date(Date.UTC(2024, 0, 1)).toISOString());

    const fromString = normalizeTrack({ title: 'Song', artist: 'Artist', addedAt: '2024-02-02T05:06:07Z' }, 1, 'spotify');
    expect(fromString.dateAdded).toBe('2024-02-02T05:06:07.000Z');
    expect(fromString.addedAt).toBeUndefined();

    const invalidDate = normalizeTrack({ title: 'Song', artist: 'Artist', dateAdded: 'not-a-date' }, 2, 'spotify');
    expect(invalidDate.dateAdded).toBeUndefined();
  });
});
