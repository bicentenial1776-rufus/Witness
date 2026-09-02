// Web variant of share-story: the browser's share sheet where one exists
// (Safari, mobile browsers), otherwise a plain .txt download — expo-sharing
// and the new expo-file-system File API are native-only stubs on web (see
// AGENTS.md), so this speaks DOM directly.

export const STORY_SHARE_LABEL = 'Download story ›';

export function renderStoryText(name: string, years: string, story: string, note?: string): string {
  // The reader's own note travels labeled as theirs — the footer's AI
  // attribution covers the story alone.
  const noteBlock = note?.trim() ? `\n\nFamily note, in the reader's own words:\n${note.trim()}` : '';
  return `${name}\n${years}\n\n${story}${noteBlock}\n\n—\nStory written by AI from this family's documented record · Witness · witnesslives.com`;
}

export function storyFileName(name: string): string {
  const safe = name.replace(/[^\p{L}\p{N} ]+/gu, '-').replace(/-+/g, '-').trim();
  return `${safe || 'Ancestor'} - Witness story.txt`;
}

export async function shareStory(name: string, years: string, story: string, note?: string): Promise<void> {
  const text = renderStoryText(name, years, story, note);
  if (typeof navigator !== 'undefined' && 'share' in navigator) {
    try {
      await navigator.share({ title: `${name} — story`, text });
      return;
    } catch (error) {
      // A canceled sheet is a decision, not a failure; anything else falls
      // through to the download path so the reader still gets their file.
      if ((error as Error).name === 'AbortError') return;
    }
  }
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = storyFileName(name);
  anchor.click();
  URL.revokeObjectURL(url);
}

export const LINE_SHARE_LABEL = 'Download this line ›';

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
  const text = renderLineText(arc);
  if (typeof navigator !== 'undefined' && 'share' in navigator) {
    try {
      await navigator.share({ title: arc.title, text });
      return;
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;
    }
  }
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = storyFileName(arc.title);
  a.click();
  URL.revokeObjectURL(url);
}
