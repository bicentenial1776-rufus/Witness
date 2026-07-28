export const PAGE_SIZE = 1000;

/** Default number of page requests kept in flight for large tables. */
export const PAGE_CONCURRENCY = 8;

type PageResult<T> = { data: T[] | null; error: { message: string } | null };

/**
 * Drains a Supabase range-paginated query. Every tree-scale fetch in the
 * query engine goes through this one loop so the pagination contract
 * (page size, error wrapping, end-of-data detection) lives in one place.
 *
 * The first page is fetched alone: a tree that fits in one page — the common
 * case — costs exactly one round-trip, as before. Only once a full page comes
 * back (a large tree) do we fan out, requesting `concurrency` pages at a time
 * in parallel. A big tree's events table is ~30k rows / 30+ pages; fetching
 * those sequentially is dominated by round-trip latency (painful on cellular),
 * so parallelising collapses the wall-clock without changing the result:
 * pages are appended in range order, exactly as the sequential loop produced.
 */
export async function fetchAllPages<T>(
  buildQuery: (from: number, to: number) => PromiseLike<PageResult<T>>,
  errorPrefix: string,
  options: { concurrency?: number } = {},
): Promise<T[]> {
  const concurrency = Math.max(1, options.concurrency ?? PAGE_CONCURRENCY);
  const page = (index: number) =>
    Promise.resolve(buildQuery(index * PAGE_SIZE, index * PAGE_SIZE + PAGE_SIZE - 1));
  const take = ({ data, error }: PageResult<T>): T[] => {
    if (error) throw new Error(`${errorPrefix}: ${error.message}`);
    return data ?? [];
  };

  // First page alone — one round-trip for the common single-page tree.
  const first = take(await page(0));
  const rows: T[] = [...first];
  if (first.length < PAGE_SIZE) return rows;

  // Full first page: a large tree. Fan out the rest in ordered parallel batches.
  for (let base = 1; ; base += concurrency) {
    const batch = await Promise.all(
      Array.from({ length: concurrency }, (_, i) => page(base + i)),
    );
    let last = false;
    for (const result of batch) {
      const data = take(result);
      rows.push(...data);
      if (data.length < PAGE_SIZE) last = true; // short page → no rows beyond it exist
    }
    if (last) return rows;
  }
}
