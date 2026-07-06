export const PAGE_SIZE = 1000;

/**
 * Drains a Supabase range-paginated query. Every tree-scale fetch in the
 * query engine goes through this one loop so the pagination contract
 * (page size, error wrapping, end-of-data detection) lives in one place.
 */
export async function fetchAllPages<T>(
  buildQuery: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  errorPrefix: string,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${errorPrefix}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}
