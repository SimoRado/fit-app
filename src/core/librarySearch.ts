/** Normalize names and queries consistently for local library relevance. */
export function normalizeLibrarySearchText(value: string): string {
  return value.normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Lower scores are more relevant. Input order is retained for ties and alias-only hits. */
export function librarySearchRelevance(name: string, query: string): number {
  const normalizedName = normalizeLibrarySearchText(name);
  const normalizedQuery = normalizeLibrarySearchText(query);
  if (!normalizedQuery) return 0;
  if (normalizedName === normalizedQuery) return 0;
  if (normalizedName.startsWith(normalizedQuery)) return 1;

  const nameWords = normalizedName.split(' ');
  const queryWords = normalizedQuery.split(' ');
  if (queryWords.every(word => nameWords.some(nameWord => nameWord.startsWith(word)))) return 2;
  if (normalizedName.includes(normalizedQuery) || queryWords.every(word => normalizedName.includes(word))) return 3;
  return 4;
}

export function rankLibrarySearchResults<T>(items: readonly T[], query: string, getName: (item: T) => string): T[] {
  if (!normalizeLibrarySearchText(query)) return [...items];
  return items.map((item, index) => ({ item, index, relevance: librarySearchRelevance(getName(item), query) }))
    .sort((left, right) => left.relevance - right.relevance || left.index - right.index)
    .map(entry => entry.item);
}

/** Guards async local searches when a newer keystroke or filter change wins the race. */
export class SearchRequestGate {
  private generation = 0;

  start() { return ++this.generation; }
  isCurrent(request: number) { return request === this.generation; }
  cancel(request: number) {
    if (this.isCurrent(request)) this.generation += 1;
  }
}
