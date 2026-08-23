/**
 * The comparable half of a correction's snapshot.
 *
 * current_value holds the rich display text of what the record said when the
 * correction was written ("12 Mar 1841 · Trumbull Co., Ohio") and is never
 * compared against anything. snapshot_key is this: a canonical year-level
 * string for the three vital subjects, computed identically at authoring
 * (from the individuals row) and at refresh (from HealthIndividual), so
 * equality is meaningful and the refresh can say, honestly, "the file has
 * changed the fact behind this correction — it may have been adopted".
 * Free-text subjects get null: they are never guessed at.
 */

export interface SnapshotPerson {
  full_name: string;
  birth_year: number | null;
  death_year: number | null;
}

export function correctionSnapshot(subjectKey: string, person: SnapshotPerson): string | null {
  switch (subjectKey) {
    case 'name':
      return person.full_name.trim().replace(/\s+/g, ' ');
    case 'birth':
      return person.birth_year === null ? '' : String(person.birth_year);
    case 'death':
      return person.death_year === null ? '' : String(person.death_year);
    default:
      return null;
  }
}
