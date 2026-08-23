/**
 * The fact a correction is about, as a key that survives re-import.
 *
 * A correction must point at "her birth", not at a database row — event rows
 * are reassigned on every import, so an individual_events id would strand the
 * annotation the first time the tree refreshes. The subject key is instead a
 * small stable vocabulary: the singular facts by name, and dated events by
 * type and year ('event:census:1900'), which is how a researcher refers to
 * them anyway.
 */

export type CorrectionSubjectKind =
  | 'name'
  | 'birth'
  | 'death'
  | 'burial'
  | 'event'
  | 'parents'
  | 'spouse'
  | 'other';

export interface CorrectionSubject {
  kind: CorrectionSubjectKind;
  /** individual_events.event_type, only when kind === 'event'. */
  eventType?: string;
  /** The event's date_year when known — disambiguates two censuses. */
  year?: number | null;
}

const SINGULAR_KINDS: ReadonlySet<string> = new Set([
  'name',
  'birth',
  'death',
  'burial',
  'parents',
  'spouse',
  'other',
]);

/** 'birth' | 'event:census:1900' | 'event:residence' — stable across imports. */
export function subjectKey(subject: CorrectionSubject): string {
  if (subject.kind !== 'event') return subject.kind;
  const type = (subject.eventType ?? 'custom').trim().toLowerCase();
  return subject.year != null ? `event:${type}:${subject.year}` : `event:${type}`;
}

/** The inverse of subjectKey; anything unrecognisable lands safely on 'other'. */
export function parseSubjectKey(key: string): CorrectionSubject {
  if (SINGULAR_KINDS.has(key)) return { kind: key as CorrectionSubjectKind };
  const [head, eventType, yearPart] = key.split(':');
  if (head === 'event' && eventType) {
    const year = yearPart ? Number.parseInt(yearPart, 10) : null;
    return { kind: 'event', eventType, year: Number.isNaN(year as number) ? null : year };
  }
  return { kind: 'other' };
}

const KIND_LABELS: Record<Exclude<CorrectionSubjectKind, 'event'>, string> = {
  name: 'Name',
  birth: 'Birth',
  death: 'Death',
  burial: 'Burial',
  parents: 'Parents',
  spouse: 'Spouse',
  other: 'Other',
};

/** 'Birth' | 'Census · 1900' — the mono eyebrow and the worksheet wording. */
export function subjectLabel(key: string): string {
  const subject = parseSubjectKey(key);
  if (subject.kind !== 'event') return KIND_LABELS[subject.kind];
  const type = subject.eventType ?? 'event';
  const title = type.charAt(0).toUpperCase() + type.slice(1);
  return subject.year != null ? `${title} · ${subject.year}` : title;
}
