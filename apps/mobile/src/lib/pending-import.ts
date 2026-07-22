import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Bridges +native-intent.ts (which fires before the router knows whether the
 * user is signed in, onboarded, or entitled) to the moment the app is
 * actually ready to show the import screen. "Open in Witness" on a .ged/.gdz
 * file from Files, Mail, or a Safari download stashes its file:// URI here;
 * the root layout picks it up once the (app) group is what's mounted.
 */

const KEY = 'witness.pending-import-uri';

export async function setPendingImportUri(uri: string): Promise<void> {
  await AsyncStorage.setItem(KEY, uri);
}

/** Reads and clears the pending URI in one step, so it's only ever consumed once. */
export async function consumePendingImportUri(): Promise<string | null> {
  const uri = await AsyncStorage.getItem(KEY);
  if (uri) await AsyncStorage.removeItem(KEY);
  return uri;
}
