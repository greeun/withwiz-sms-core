import { describe, expect, it } from 'vitest';
import { chunkRecipients } from '../src/chunk';

describe('chunkRecipients', () => {
  it('splits the list into the given size', () => {
    expect(chunkRecipients(['a', 'b', 'c', 'd', 'e'], 2)).toEqual([['a', 'b'], ['c', 'd'], ['e']]);
  });

  it('keeps a list shorter than the size as a single chunk', () => {
    expect(chunkRecipients(['a', 'b'], 5)).toEqual([['a', 'b']]);
  });

  it('returns an empty result for an empty list', () => {
    expect(chunkRecipients([], 10)).toEqual([]);
  });

  it('throws when the size is below 1', () => {
    expect(() => chunkRecipients(['a'], 0)).toThrow('Chunk size must be at least 1.');
  });
});
