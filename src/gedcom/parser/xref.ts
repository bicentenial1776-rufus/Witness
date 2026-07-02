/** Strips the @...@ pointer wrapper GEDCOM uses for cross-references. */
export function stripXref(pointer: string): string {
  return pointer.replace(/^@/, '').replace(/@$/, '');
}
