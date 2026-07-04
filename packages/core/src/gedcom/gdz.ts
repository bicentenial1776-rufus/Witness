import { strFromU8, unzipSync } from 'fflate';

/**
 * FamilySearch distributes GEDCOM 7.0 exports as .gdz files — zip archives
 * containing the .ged plus media. fflate keeps this pure-JS so the same
 * code runs in Node scripts and React Native.
 */

/** Zip local-file-header magic: PK\x03\x04. */
export function isZipData(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

/**
 * Returns the GEDCOM text from raw import bytes: extracts the first .ged
 * entry when the input is a .gdz/zip archive, otherwise decodes the bytes
 * as UTF-8 text directly.
 */
export function extractGedcomText(bytes: Uint8Array): string {
  if (!isZipData(bytes)) return strFromU8(bytes);

  const entries = unzipSync(bytes);
  const gedName = Object.keys(entries)
    .filter((name) => name.toLowerCase().endsWith('.ged'))
    .sort((a, b) => a.length - b.length)[0];
  if (!gedName) {
    throw new Error('This archive does not contain a .ged file.');
  }
  return strFromU8(entries[gedName]!);
}
