import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/**
 * Hands a generated worksheet to the user. Native: write it into the cache
 * and open the share sheet, which is the only route off an iPhone — AirDrop
 * to the Mac, save to Files, mail it to yourself. See export-file.web.ts;
 * expo-sharing has no web implementation and expo-file-system's File is a
 * warning stub there.
 *
 * Cache rather than documents on purpose: these are derived artefacts, the
 * user already has them wherever they sent them, and iOS is free to reclaim
 * the space.
 */
export async function saveTextFile(
  fileName: string,
  contents: string,
  mimeType: string,
  utiHint?: string,
): Promise<void> {
  const scratch = new Directory(Paths.cache, 'exports');
  if (!scratch.exists) scratch.create();

  const file = new File(scratch, fileName);
  if (file.exists) file.delete();
  file.create();
  file.write(contents);

  if (!(await Sharing.isAvailableAsync())) return;
  await Sharing.shareAsync(file.uri, {
    mimeType,
    UTI: utiHint,
    dialogTitle: fileName,
  });
}
