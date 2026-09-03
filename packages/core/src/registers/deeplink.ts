/**
 * Prefilled search URLs from a register's template + person facts.
 * Templates carry `{token}` placeholders; every substituted value is
 * URL-encoded, and a missing value substitutes as empty rather than
 * blocking — a lone surname still searches (the Find A Grave rule).
 *
 * Every template MUST be verified against the live target before its
 * register ships: FamilySearch's parameters verified, the Ellis Island
 * Foundation's did not exist, GLO and LAC are unverified until proven.
 */
export function fillDeepLink(
  template: string,
  values: Record<string, string | number | null | undefined>,
): string {
  return template.replace(/\{([a-zA-Z_]+)\}/g, (_, token: string) => {
    const value = values[token];
    return value === null || value === undefined ? '' : encodeURIComponent(String(value));
  });
}
