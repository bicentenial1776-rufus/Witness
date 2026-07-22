import { setPendingImportUri } from '@/lib/pending-import';

/**
 * Fires when the OS hands Witness a file directly — "Open in Witness" from
 * Files, Mail, or a Safari downloads list on a .ged/.gdz (registered in
 * app.json's ios.infoPlist). The incoming path is a file:// URI to a copy of
 * the document, not a normal in-app route, so it can't just be pushed as a
 * path here — the router doesn't yet know whether the reader is signed in,
 * onboarded, or entitled. Stash it and let the root layout's pending-import
 * check (see _layout.tsx) route to /import once that's known.
 */
export async function redirectSystemPath({ path }: { path: string; initial: boolean }): Promise<string> {
  if (path.startsWith('file://')) {
    await setPendingImportUri(path).catch(() => {});
    return '/';
  }
  return path;
}
