// Sharing/downloading a generated story (2026-08-18). The story is written
// to a cache-directory text file and handed to the OS share sheet — a file
// (not bare text) so "Save to Files" appears alongside Messages, Mail, and
// AirDrop: sharing and downloading are the same door on iOS. Only ever
// reachable from a non-living person's story panel, so the living-person
// doctrine is enforced by the caller's rendering, not re-checked here.

import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export const STORY_SHARE_LABEL = 'Share story ›';

/** Header + prose + a plain provenance footer, ready for any medium. */
export function renderStoryText(name: string, years: string, story: string, note?: string): string {
  // The reader's own note travels labeled as theirs — the footer's AI
  // attribution covers the story alone.
  const noteBlock = note?.trim() ? `\n\nFamily note, in the reader's own words:\n${note.trim()}` : '';
  return `${name}\n${years}\n\n${story}${noteBlock}\n\n—\nStory written by AI from this family's documented record · Witness · witnesslives.com`;
}

/** A filesystem-safe name: letters, digits, spaces; everything else folds to a hyphen. */
export function storyFileName(name: string): string {
  const safe = name.replace(/[^\p{L}\p{N} ]+/gu, '-').replace(/-+/g, '-').trim();
  return `${safe || 'Ancestor'} - Witness story.txt`;
}

export async function shareStory(name: string, years: string, story: string, note?: string): Promise<void> {
  const file = new File(Paths.cache, storyFileName(name));
  try {
    if (file.exists) file.delete();
  } catch {}
  file.create();
  file.write(renderStoryText(name, years, story, note));
  await Sharing.shareAsync(file.uri, {
    mimeType: 'text/plain',
    dialogTitle: `${name} — story`,
  });
}

export const LINE_SHARE_LABEL = 'Share this line ›';

/**
 * A generational line, rendered for sharing. The house rule governs the
 * cut: nothing shareable includes a living person, and the line runs
 * founder-to-reader — so the shared text stops at the last deceased
 * generation and says so.
 */
export function renderLineText(arc: {
  title: string;
  dek: string;
  generations: {
    name: string;
    birth: number | null;
    death: number | null;
    living: boolean;
    relationLabel: string | null;
    factLine: string | null;
    story: string | null;
  }[];
}): string {
  const shareable = arc.generations.filter((g) => !g.living);
  const omitted = arc.generations.length - shareable.length;
  const blocks = shareable.map((g) => {
    const years = `${g.birth ?? '?'}–${g.death ?? '?'}`;
    const head = g.relationLabel ? `${g.name} (${years}) — ${g.relationLabel}` : `${g.name} (${years})`;
    return [head, g.factLine, g.story].filter(Boolean).join('\n');
  });
  const privacyNote =
    omitted > 0
      ? `\n\nThe line continues to the present day — living generations stay private and are not included.`
      : '';
  return (
    `${arc.title}\n${arc.dek}\n\n${blocks.join('\n\n')}${privacyNote}` +
    `\n\n—\nEvery name, date, and place is from this family's documented record; the connecting prose is written by AI from it · Witness · witnesslives.com`
  );
}

export async function shareLine(arc: Parameters<typeof renderLineText>[0]): Promise<void> {
  const file = new File(Paths.cache, storyFileName(arc.title));
  try {
    if (file.exists) file.delete();
  } catch {}
  file.create();
  file.write(renderLineText(arc));
  await Sharing.shareAsync(file.uri, {
    mimeType: 'text/plain',
    dialogTitle: arc.title,
  });
}
