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
export function renderStoryText(name: string, years: string, story: string): string {
  return `${name}\n${years}\n\n${story}\n\n—\nWritten from the family record by Witness · witnesslives.com`;
}

/** A filesystem-safe name: letters, digits, spaces; everything else folds to a hyphen. */
export function storyFileName(name: string): string {
  const safe = name.replace(/[^\p{L}\p{N} ]+/gu, '-').replace(/-+/g, '-').trim();
  return `${safe || 'Ancestor'} - Witness story.txt`;
}

export async function shareStory(name: string, years: string, story: string): Promise<void> {
  const file = new File(Paths.cache, storyFileName(name));
  try {
    if (file.exists) file.delete();
  } catch {}
  file.create();
  file.write(renderStoryText(name, years, story));
  await Sharing.shareAsync(file.uri, {
    mimeType: 'text/plain',
    dialogTitle: `${name} — story`,
  });
}
