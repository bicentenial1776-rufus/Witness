// Ported from packages/core/src/query/orphanRecords.ts — keep the two
// in sync (only the soundex function; the rest of orphanRecords stays
// app-side).

/** Classic Soundex — coarse, but Howe/How/Howes land together. */
export function soundex(name: string): string {
  const s = name.toUpperCase().replace(/[^A-Z]/g, '');
  if (!s) return '';
  const code = (c: string) =>
    'BFPV'.includes(c) ? '1'
    : 'CGJKQSXZ'.includes(c) ? '2'
    : 'DT'.includes(c) ? '3'
    : c === 'L' ? '4'
    : 'MN'.includes(c) ? '5'
    : c === 'R' ? '6'
    : '';
  let out = s[0]!;
  let previous = code(s[0]!);
  for (const c of s.slice(1)) {
    const digit = code(c);
    if (digit && digit !== previous) out += digit;
    if (!'HW'.includes(c)) previous = digit;
    if (out.length === 4) break;
  }
  return out.padEnd(4, '0');
}
