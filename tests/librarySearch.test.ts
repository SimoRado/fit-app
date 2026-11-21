import { describe, expect, it } from 'vitest';
import { librarySearchRelevance, normalizeLibrarySearchText, rankLibrarySearchResults, SearchRequestGate } from '../src/core/librarySearch';

const rows = ['Unrelated meal', 'Carrots', 'Carrot juice', 'Fresh carrot, cooked', 'car'];

describe('local library search ranking', () => {
  it('keeps the default order for an empty query and supports one character', () => {
    expect(rankLibrarySearchResults(rows, '', value => value)).toEqual(rows);
    expect(rankLibrarySearchResults(rows, 'c', value => value).slice(0, 3)).toEqual(['Carrots', 'Carrot juice', 'car']);
  });

  it('ranks exact names, name prefixes, word prefixes, then contains matches', () => {
    expect(rankLibrarySearchResults(rows, 'car', value => value)).toEqual([
      'car', 'Carrots', 'Carrot juice', 'Fresh carrot, cooked', 'Unrelated meal',
    ]);
    expect(librarySearchRelevance('Carrot juice', 'CARROT JUICE')).toBe(0);
    expect(librarySearchRelevance('Carrot, cooked', 'car')).toBe(1);
    expect(librarySearchRelevance('Fresh carrot', 'car')).toBe(2);
    expect(librarySearchRelevance('Fresh, finely chopped carrot', 'arr')).toBe(3);
  });

  it('normalizes case, accents, punctuation, whitespace, and multiword prefixes', () => {
    expect(normalizeLibrarySearchText('  Crème-brûlée  ')).toBe('creme brulee');
    expect(librarySearchRelevance('Crème brûlée', 'creme-brulee')).toBe(0);
    expect(librarySearchRelevance('Roast chicken breast', 'chick bre')).toBe(2);
  });

  it('broadens again after backspace and clear', () => {
    expect(librarySearchRelevance('Carrot juice', 'carro')).toBe(1);
    expect(librarySearchRelevance('Carrot juice', 'car')).toBe(1);
    expect(rankLibrarySearchResults(rows, '', value => value)).toEqual(rows);
  });
});

describe('async local search ordering', () => {
  it('ignores an older async response that resolves after a newer query', async () => {
    const gate = new SearchRequestGate();
    const accepted: string[] = [];
    let resolveOlder!: (value: string) => void;
    let resolveNewer!: (value: string) => void;
    const older = new Promise<string>(resolve => { resolveOlder = resolve; });
    const newer = new Promise<string>(resolve => { resolveNewer = resolve; });
    const olderRequest = gate.start();
    const olderCompletion = older.then(value => { if (gate.isCurrent(olderRequest)) accepted.push(value); });
    const newerRequest = gate.start();
    const newerCompletion = newer.then(value => { if (gate.isCurrent(newerRequest)) accepted.push(value); });
    resolveNewer('Carro');
    await newerCompletion;
    resolveOlder('Car');
    await olderCompletion;
    expect(accepted).toEqual(['Carro']);
  });

  it('invalidates a request when its search effect is cleaned up', () => {
    const gate = new SearchRequestGate();
    const request = gate.start();
    gate.cancel(request);
    expect(gate.isCurrent(request)).toBe(false);
  });
});
