export function normalizeSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function matchesSearch(haystack: string, needle: string): boolean {
  if (!needle) return true;
  return normalizeSearch(haystack).includes(normalizeSearch(needle));
}

export function matchesAnySearch(haystack: string[], needle: string): boolean {
  if (!needle) return true;
  const normalizedNeedle = normalizeSearch(needle);
  return haystack.some(h => normalizeSearch(h).includes(normalizedNeedle));
}