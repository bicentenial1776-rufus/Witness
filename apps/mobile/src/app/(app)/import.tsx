import { randomUUID } from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform } from 'react-native';

import type { ParsedGedcom } from '@witness/core/gedcom';
import { extractGedcomText, parseGedcom } from '@witness/core/gedcom';
import { importParsedGedcom, type ImportProgress } from '@witness/core/supabase';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useSession } from '@/auth/session-provider';
import { showAlert } from '@/lib/alert';
import { useActiveTree } from '@/lib/active-tree';
import { invalidateGeographyCache } from '@/lib/geography-cache';
import { supabase } from '@/lib/supabase';

function count(n: number, singular: string, plural: string): string {
  return `${n.toLocaleString()} ${n === 1 ? singular : plural}`;
}

type Step =
  | { name: 'pick' }
  | { name: 'parsing'; fileName: string }
  | { name: 'ready'; fileName: string; parsed: ParsedGedcom }
  | { name: 'importing'; fileName: string; parsed: ParsedGedcom; progress: ImportProgress | null }
  | { name: 'done'; treeId: string; parsed: ParsedGedcom }
  | { name: 'error'; fileName: string; kind: 'not-gedcom' | 'unreadable' };

export default function ImportGedcom() {
  const { session } = useSession();
  const { selectTree, refresh } = useActiveTree();
  const { fileUri } = useLocalSearchParams<{ fileUri?: string }>();
  const [step, setStep] = useState<Step>({ name: 'pick' });

  async function parseAndSet(source: { uri: string; webFile?: Blob }, fileName: string) {
    setStep({ name: 'parsing', fileName });
    try {
      // Bytes, not text: FamilySearch .gdz exports are zip archives and
      // extractGedcomText handles both those and plain .ged files. On web,
      // expo-file-system's File is a warning stub — read the browser File
      // the picker hands us instead.
      const bytes = source.webFile
        ? new Uint8Array(await source.webFile.arrayBuffer())
        : await new File(source.uri).bytes();
      const text = extractGedcomText(bytes);
      const parsed = parseGedcom(text, fileName);
      if (parsed.metadata.individualCount === 0) {
        setStep({ name: 'error', fileName, kind: 'not-gedcom' });
        return;
      }
      // Non-fatal per-line oddities in the export — not something a reader
      // can act on, so it's logged for us rather than shown as a scary count.
      if (parsed.metadata.parseWarnings.length > 0) {
        console.warn(
          `${parsed.metadata.parseWarnings.length} GEDCOM parse warnings in ${fileName}`,
          parsed.metadata.parseWarnings,
        );
      }
      setStep({ name: 'ready', fileName, parsed });
    } catch (error) {
      console.warn('GEDCOM read failed', error);
      setStep({ name: 'error', fileName, kind: 'unreadable' });
    }
  }

  async function pickAndParse() {
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (result.canceled) return;

    const asset = result.assets[0];
    await parseAndSet(
      { uri: asset.uri, webFile: Platform.OS === 'web' ? asset.file : undefined },
      asset.name,
    );
  }

  // Arrived via "Open in Witness" on a .ged/.gdz (see +native-intent.ts) —
  // skip the picker entirely and go straight to reading the file.
  useEffect(() => {
    if (fileUri && step.name === 'pick') {
      const fileName = decodeURIComponent(fileUri.split('/').pop() ?? 'your file');
      parseAndSet({ uri: fileUri }, fileName);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileUri]);

  async function runImport(fileName: string, parsed: ParsedGedcom) {
    if (!session) return;
    setStep({ name: 'importing', fileName, parsed, progress: null });
    try {
      const { treeId } = await importParsedGedcom(supabase, parsed, {
        userId: session.user.id,
        // Hermes has no global `crypto`, so the id generator comes from expo-crypto.
        generateId: randomUUID,
        onProgress: (progress) => setStep({ name: 'importing', fileName, parsed, progress }),
      });
      invalidateGeographyCache();
      // You imported it to look at it. Without this the app would keep showing
      // whichever tree was active before — the new one starts at zero rows and
      // so never wins the fallback — and every screen would answer for the old
      // tree with nothing to say why.
      await refresh();
      await selectTree(treeId);
      setStep({ name: 'done', treeId, parsed });
    } catch (error) {
      showAlert('Import failed', error instanceof Error ? error.message : String(error));
      setStep({ name: 'ready', fileName, parsed });
    }
  }

  return (
    <ThemedView style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 12 }}>

      {step.name === 'pick' && (
        <>
          <ThemedText>
            Choose a GEDCOM file exported from Ancestry, FamilySearch, or any genealogy platform.
          </ThemedText>
          <Button title="Choose GEDCOM file" onPress={pickAndParse} />
          {Platform.OS !== 'web' && (
            <ThemedText type="small">
              Easier: wherever your file ended up — Downloads, Mail, Files — tap it, tap Share, and
              choose Witness. It’ll open right here, ready to import.
            </ThemedText>
          )}
          <ThemedText type="link" onPress={() => router.push('/import-guide')}>
            Don’t have your file yet? See how to get it ›
          </ThemedText>
        </>
      )}

      {step.name === 'parsing' && (
        <>
          <ActivityIndicator />
          <ThemedText>Reading {step.fileName}…</ThemedText>
        </>
      )}

      {step.name === 'ready' && (
        <>
          <ThemedText type="subtitle">We found your family.</ThemedText>
          <ThemedText>
            {step.parsed.metadata.treeName ? `“${step.parsed.metadata.treeName}” — ` : ''}
            {count(step.parsed.metadata.individualCount, 'person', 'people')},{' '}
            {count(step.parsed.metadata.familyCount, 'family', 'families')},{' '}
            {count(step.parsed.metadata.placeCount, 'place', 'places')}.
          </ThemedText>
          <ThemedText type="small">
            This makes a copy inside Witness. Nothing changes on Ancestry, or wherever this file
            came from — your original tree stays exactly as it is.
          </ThemedText>
          <Button title="Bring them into Witness" onPress={() => runImport(step.fileName, step.parsed)} />
          <Button variant="secondary" title="This isn’t my file" onPress={pickAndParse} />
        </>
      )}

      {step.name === 'importing' && (
        <>
          <ActivityIndicator />
          <ThemedText>
            {step.progress
              ? `Importing… ${Math.round((step.progress.insertedRows / step.progress.totalRows) * 100)}%`
              : 'Starting import…'}
          </ThemedText>
          <ThemedText>Keep the app open — large trees can take a minute.</ThemedText>
        </>
      )}

      {step.name === 'done' && (
        <>
          <ThemedText type="subtitle">Your family is in Witness.</ThemedText>
          <ThemedText>
            {count(step.parsed.metadata.individualCount, 'person', 'people')}, safe inside the app
            now. Nothing on Ancestry changed — this is your own copy.
          </ThemedText>
          <ThemedText>
            One quick thing: point out which person in the tree is you, and every ancestor gets
            connected — exactly how they relate to you.
          </ThemedText>
          <Button
            title="Find me in the tree"
            onPress={() =>
              router.replace({ pathname: '/home-person', params: { treeId: step.treeId } })
            }
          />
          <Button variant="secondary" title="I’ll do this later" onPress={() => router.back()} />
        </>
      )}

      {step.name === 'error' && (
        <>
          <ThemedText type="subtitle">
            {step.kind === 'not-gedcom'
              ? 'That doesn’t look like a family tree file'
              : 'We couldn’t read that file'}
          </ThemedText>
          <ThemedText>
            {step.kind === 'not-gedcom'
              ? `${step.fileName} opened fine, but there’s no family tree information in it — it may be the wrong file, or something got mixed up along the way.`
              : `${step.fileName} didn’t open the way we expected. Nothing was lost — the original file is untouched, wherever it came from.`}
          </ThemedText>
          <Button title="Try a different file" onPress={pickAndParse} />
          <ThemedText type="link" onPress={() => router.push('/import-guide')}>
            See how to export your file again ›
          </ThemedText>
          <ThemedText type="small">
            Still stuck? Write to support@witnesslives.com — a real person will help you get your
            tree in.
          </ThemedText>
        </>
      )}

      {(step.name === 'pick' || step.name === 'ready' || step.name === 'error') && (
        <Button variant="secondary" title="Cancel" onPress={() => router.back()} />
      )}
    </ThemedView>
  );
}
