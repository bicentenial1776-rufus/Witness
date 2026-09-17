// Mirrored at supabase/functions/_shared/family/paginate.ts — keep in sync
// (portSync.test.ts enforces byte equality outside this header).

// Equal to the project's PostgREST max_rows (raised from 1,000 on 2026-09-17).
// A page the server capped below this would read as the last page and the
// fetch would silently truncate, so never raise this ahead of that setting.
export const PAGE_SIZE = 10000;

type PageResult<T> = { data: T[] | null; error: { message: string } | null };

interface SeekableQuery {
  gt(column: string, value: unknown): this;
  or(filters: string): this;
}

/**
 * Filters a query to rows sorting strictly after `after`'s values on
 * `columns`, in the same order the caller's `.order(...)` chain uses.
 * PostgREST has no operator for a tuple comparison, so two or more columns
 * compose the equivalent lexicographic OR-of-ANDs:
 *   c1 > v1  OR  (c1 = v1 AND c2 > v2)  OR  (c1 = v1 AND c2 = v2 AND c3 > v3) ...
 */
export function seekAfter<Q extends SeekableQuery>(query: Q, columns: string[], after: unknown[]): Q {
  if (columns.length === 1) return query.gt(columns[0]!, after[0]);
  const clauses = columns.map((column, i) => {
    const equalities = columns.slice(0, i).map((c, j) => `${c}.eq.${after[j]}`);
    const parts = [...equalities, `${column}.gt.${after[i]}`];
    return parts.length === 1 ? parts[0] : `and(${parts.join(',')})`;
  });
  return query.or(clauses.join(','));
}

/**
 * Drains a Supabase query in keyset ("seek") pages: each page asks for rows
 * after the last one the previous page returned, rather than an OFFSET.
 *
 * OFFSET pagination (the old `.range(from, to)` approach) makes Postgres
 * walk and discard every row before the offset on every single page, so
 * total cost grows with the *square* of the table size. That was invisible
 * at ordinary tree sizes but reliably blew the API role's 8s statement
 * timeout on Rich Douglass's 61,773-person tree (158k individual_events
 * rows): page ~150 alone took 2-3s of scan-and-discard before returning a
 * single row, and "Tree Tools" (which load a whole tree at once) failed or
 * hung as a result (2026-09-16). A keyset page costs the same regardless of
 * how deep into the table it is, because it seeks by index instead of
 * counting past rows.
 *
 * `buildQuery` receives the last row of the previous page (`null` for the
 * first) and must return the query for rows strictly after it, in the same
 * order as always -- ascending on whichever column(s) the caller filters by
 * (a plain `.gt(column, after.column)` for one column; `seekAfter` for
 * more), with `.limit(PAGE_SIZE)` instead of `.range(...)`. The ordered
 * column(s) must be present in the selected row shape so the next page can
 * read them back off.
 */
export async function fetchAllPages<T>(
  buildQuery: (after: T | null) => PromiseLike<PageResult<T>>,
  errorPrefix: string,
): Promise<T[]> {
  const rows: T[] = [];
  let after: T | null = null;
  for (;;) {
    const { data, error } = await buildQuery(after);
    if (error) throw new Error(`${errorPrefix}: ${error.message}`);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
    after = page[page.length - 1]!;
  }
}
