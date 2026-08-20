// Web variant of share-story: the browser's share sheet where one exists
// (Safari, mobile browsers), otherwise a plain .txt download — expo-sharing
// and the new expo-file-system File API are native-only stubs on web (see
// AGENTS.md), so this speaks DOM directly.

export const STORY_SHARE_LABEL = 'Download story ›';

export function renderStoryText(name: string, years: string, story: string): string {
  return `${name}\n${years}\n\n${story}\n\n—\nWritten by AI from this family's documented record · Witness · witnesslives.com`;
}

export function storyFileName(name: string): string {
  const safe = name.replace(/[^\p{L}\p{N} ]+/gu, '-').replace(/-+/g, '-').trim();
  return `${safe || 'Ancestor'} - Witness story.txt`;
}

export async function shareStory(name: string, years: string, story: string): Promise<void> {
  const text = renderStoryText(name, years, story);
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
