/** Never treat an API row cap as a complete dataset for indicators/export. */
export async function fetchAllRows<T>(page: (from: number, to: number) => PromiseLike<{
  data: T[] | null; error: { message: string } | null; count?: number | null;
}>): Promise<T[]> {
  const rows: T[] = [];
  for (let attempt = 0; attempt < 1000; attempt++) {
    const result = await page(rows.length, rows.length + 499);
    if (result.error) throw new Error(result.error.message);
    const batch = result.data ?? [];
    rows.push(...batch);
    if (result.count != null) {
      if (rows.length >= result.count) return rows;
      if (!batch.length) throw new Error('A lista mudou durante a consulta. Atualize para tentar novamente.');
    } else if (batch.length < 500) return rows;
  }
  throw new Error('Volume acima do limite de consulta. Reduza o período e tente novamente.');
}
