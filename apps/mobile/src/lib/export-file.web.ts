/**
 * Web has no share sheet to hand a file to, and expo-file-system's File is a
 * warning stub in the browser — so the worksheet becomes an object URL behind
 * a synthetic click, which is how a browser downloads anything.
 *
 * The BOM matters: Excel on Windows reads a UTF-8 CSV as the system codepage
 * unless one is present, which turns every accented place name in a European
 * tree into mojibake. Numbers and Sheets both tolerate it.
 */
const UTF8_BOM = '﻿';

export async function saveTextFile(
  fileName: string,
  contents: string,
  mimeType: string,
  _utiHint?: string,
): Promise<void> {
  const blob = new Blob([UTF8_BOM + contents], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking immediately can race the download in Safari; a frame is enough.
  requestAnimationFrame(() => URL.revokeObjectURL(url));
}
