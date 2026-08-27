/**
 * The road back into the issue (walkthrough audit G1).
 *
 * Home lays the week's pieces down as a trail when it composes the edition;
 * tapping a piece marks where the reader entered. The Portrait — where
 * every piece lands and every wander deepens — can then offer the NEXT
 * piece as one tap, instead of leaving back-button archaeology as the only
 * way home. Session-scoped on purpose: the trail is "this sitting's
 * reading", not state worth persisting.
 */

export interface TrailPiece {
  key: 'on-this-day' | 'ancestor' | 'story' | 'family-graph' | 'archives';
  /** As the band prints it: "NEXT: THE PATTERN". */
  label: string;
  destination: { pathname: string; params?: Record<string, string> };
}

let editionNumber: number | null = null;
let pieces: TrailPiece[] = [];
let cursor = -1; // index of the piece the reader most recently opened
let dismissed = false;

/** Home, on composing the edition. Re-laying the same trail keeps the cursor. */
export function layIssueTrail(number: number, items: TrailPiece[]): void {
  const sameEdition = editionNumber === number && pieces.length === items.length;
  editionNumber = number;
  pieces = items;
  if (!sameEdition) {
    cursor = -1;
    dismissed = false;
  }
}

/** Home, when the reader taps into a piece. */
export function openTrailPiece(key: TrailPiece['key']): void {
  const index = pieces.findIndex((piece) => piece.key === key);
  if (index >= 0) cursor = index;
}

/**
 * The band's content: the piece after the one the reader is inside, or null
 * when they aren't reading the issue (never entered, dismissed, or done).
 */
export function nextTrailPiece(): { number: number; piece: TrailPiece } | null {
  if (dismissed || cursor < 0 || editionNumber === null) return null;
  const piece = pieces[cursor + 1];
  return piece ? { number: editionNumber, piece } : null;
}

/** The band was followed: the reader is now inside the next piece. */
export function advanceTrail(key: TrailPiece['key']): void {
  openTrailPiece(key);
}

/** The reader waved the band away; stay quiet for the rest of the session. */
export function dismissTrail(): void {
  dismissed = true;
}
