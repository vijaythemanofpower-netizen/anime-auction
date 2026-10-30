import { describe, expect, it } from 'vitest';
import { canonFor } from '../src/engine/data/canonByName';

describe('canon stat sheets by name', () => {
  it('finds sheets for AniList names, in any name order and spelling of long vowels', () => {
    expect(canonFor({ id: 'anilist:1', name: 'Kokushibou' })?.technique).toBe(98);
    expect(canonFor({ id: 'anilist:2', name: 'Gojo Satoru' })?.defense).toBe(99);
    expect(canonFor({ id: 'anilist:3', name: 'Muichiro Tokito' })?.speed).toBe(92);
  });
  it('does not match on a shared one-word nickname', () => {
    expect(canonFor({ id: 'anilist:4', name: 'Some Other Jojo', aliases: ['JoJo'] })).toBeNull();
    expect(canonFor({ id: 'anilist:5', name: 'Joseph Joestar', aliases: ['JoJo'] })?.battleIQ).toBe(96);
  });
});
