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
  // Universal links arrive in their public short forms — /j/<token> from a
  // family invitation, /s/<token> from a companion share card. On the web
  // those are Vercel rewrites into the SPA's real routes; the app has only
  // the real routes, so translate before the router looks for a screen.
  // Tolerate trailing query/fragment junk — link-rewriting mail clients
  // append tracking params, and an untranslated /j/<token>?utm=x would
  // land on the unmatched-route screen.
  const short = /^(?:https?:\/\/[^/]+)?\/(j|s)\/([0-9a-f]{32})\/?(?:[?#].*)?$/.exec(path);
  if (short) return `/${short[1] === 'j' ? 'join' : 'shared'}/${short[2]}`;
  return path;
}
