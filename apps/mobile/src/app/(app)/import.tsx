import { randomUUID } from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';

import type { ParsedGedcom } from '@witness/core/gedcom';
import { extractGedcomText, parseGedcom } from '@witness/core/gedcom';
import { importParsedGedcom, type ImportProgress } from '@witness/core/supabase';
import {
  applyRefresh,
  findRefreshTarget,
  previewRefresh,
  pulseSummary,
  type RefreshPreview,
  type RefreshTarget,
} from '@witness/core/pulse';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useSession } from '@/auth/session-provider';
import { showAlert } from '@/lib/alert';
import { useActiveTree } from '@/lib/active-tree';
import { invalidateGeographyCache } from '@/lib/geography-cache';
import { getRecoveryCode, isVaultAvailable, storeOriginal } from '@/lib/gedcom-vault';
import { supabase } from '@/lib/supabase';

function count(n: number, singular: string, plural: string): string {
  return `${n.toLocaleString()} ${n === 1 ? singular : plural}`;
}

type Step =
  | { name: 'pick' }
  | { name: 'parsing'; fileName: string }
  // `original` is the file exactly as picked, kept so the encrypted copy in
  // Storage is the user's file rather than our re-rendering of it.
  | { name: 'ready'; fileName: string; parsed: ParsedGedcom; original: Uint8Array }
  | {
      name: 'importing';
      fileName: string;
      parsed: ParsedGedcom;
      original: Uint8Array;
      progress: ImportProgress | null;
    }
  // A refresh: the new tree is in, and the reader now decides whether to let
  // it replace the old one. Nothing has been moved or deleted at this point.
  | {
      name: 'reviewing';
      treeId: string;
      oldTreeId: string;
      parsed: ParsedGedcom;
      vault: VaultOutcome;
      preview: RefreshPreview | null;
      applying: boolean;
    }
  | { name: 'done'; treeId: string; parsed: ParsedGedcom; vault: VaultOutcome }
  | { name: 'error'; fileName: string; kind: 'not-gedcom' | 'unreadable' };

interface VaultOutcome {
  /** False on web, where there is no Keychain to hold a key — not a failure. */
  available: boolean;
  stored: boolean;
  /** True when this import generated the device's key, so the code is worth showing. */
  keyIsNew: boolean;
}

/**
 * Encrypt the picked file and keep it in Storage, recording where it went.
 * Never throws: by this point the tree is already imported and usable, and
 * losing the backup copy is not a reason to tell someone their import failed.
 */
async function keepOriginal(
  userId: string,
  treeId: string,
  original: Uint8Array,
): Promise<VaultOutcome> {
  if (!(await isVaultAvailable())) return { available: false, stored: false, keyIsNew: false };
  try {
    // Read before storing: storeOriginal mints a key if there isn't one, so
    // afterwards there is no way to tell whether this import created it.
    const hadKey = (await getRecoveryCode()) !== null;
    const { path, bytes } = await storeOriginal(userId, treeId, original);
    await supabase
      .from('trees')
      .update({
        gedcom_path: path,
        gedcom_bytes: bytes,
        gedcom_uploaded_at: new Date().toISOString(),
      })
      .eq('id', treeId);
    return { available: true, stored: true, keyIsNew: !hadKey };
  } catch (error) {
    console.warn('Encrypted original not stored', error);
    return { available: true, stored: false, keyIsNew: false };
  }
}

// Desktop genealogy programs hand people their own project databases, which
// are not interchange files — a tester's betsey.rmtree (2026-08-17) hit the
// generic "no family tree information" shrug. When the extension names the
// program, name it back and say exactly where its GEDCOM export lives.
const DESKTOP_FORMATS = [
  { pattern: /\.(rmtree|rmgc|rmgb)$/i, app: 'RootsMagic', how: 'File → Export Data → GEDCOM' },
  { pattern: /\.(ftm|ftmb|ftw)$/i, app: 'Family Tree Maker', how: 'File → Export Tree' },
  { pattern: /\.(fdb)$/i, app: 'Legacy Family Tree', how: 'File → Export To → GEDCOM File' },
  { pattern: /\.(gramps|gpkg)$/i, app: 'Gramps', how: 'Family Trees → Export → GEDCOM' },
  { pattern: /\.(heredis)$/i, app: 'Heredis', how: 'File → Export → GEDCOM' },
  { pattern: /\.(paf)$/i, app: 'PAF', how: 'File → Export → GEDCOM' },
] as const;

function desktopFormatOf(fileName: string) {
  return DESKTOP_FORMATS.find((format) => format.pattern.test(fileName)) ?? null;
}

export default function ImportGedcom() {
  const { session } = useSession();
  const { selectTree, refresh } = useActiveTree();
  const { fileUri, refreshTreeId } = useLocalSearchParams<{
    fileUri?: string;
    /** Set when this import is updating an existing tree rather than adding one. */
    refreshTreeId?: string;
  }>();
  const [step, setStep] = useState<Step>({ name: 'pick' });
  const desktopFormat = step.name === 'error' ? desktopFormatOf(step.fileName) : null;
  // Front door of the round-trip: when a picked file looks like a newer
  // export of a tree already here, updating is offered as the primary path
  // — plain import used to silently duplicate the tree (Katie review).
  const [updateTarget, setUpdateTarget] = useState<RefreshTarget | null>(null);

  useEffect(() => {
    if (step.name !== 'ready' || refreshTreeId) {
      setUpdateTarget(null);
      return;
    }
    let cancelled = false;
    findRefreshTarget(supabase, {
      ancestryTreeId: step.parsed.metadata.ancestryTreeId,
      treeName: step.parsed.metadata.treeName,
    })
      .then((target) => {
        if (!cancelled) setUpdateTarget(target);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.name, refreshTreeId]);

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
      setStep({ name: 'ready', fileName, parsed, original: bytes });
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

  async function runImport(
    fileName: string,
    parsed: ParsedGedcom,
    original: Uint8Array,
    // The front door: "update this existing tree" chosen on the ready step —
    // same refresh machinery the /you deep entry uses via the route param.
    updateTreeId?: string,
  ) {
    const refreshInto = updateTreeId ?? refreshTreeId;
    if (!session) return;
    setStep({ name: 'importing', fileName, parsed, original, progress: null });
    try {
      const { treeId } = await importParsedGedcom(supabase, parsed, {
        userId: session.user.id,
        // Hermes has no global `crypto`, so the id generator comes from expo-crypto.
        generateId: randomUUID,
        onProgress: (progress) =>
          setStep({ name: 'importing', fileName, parsed, original, progress }),
      });
      invalidateGeographyCache();

      // Keep the encrypted original. Deliberately after the import and
      // deliberately non-fatal: the tree is already in Witness and usable, and
      // failing the whole import over a backup copy would trade the thing the
      // user asked for against the thing they didn't ask for.
      const vault = await keepOriginal(session.user.id, treeId, original);
      // You imported it to look at it. Without this the app would keep showing
      // whichever tree was active before — the new one starts at zero rows and
      // so never wins the fallback — and every screen would answer for the old
      // tree with nothing to say why.
      await refresh();
      await selectTree(treeId);

      // A refresh imports first and decides second, so the reader sees what
      // changed before anything is moved or deleted. If the comparison itself
      // fails, this is still a perfectly good ordinary import — say so rather
      // than stranding them mid-flow.
      if (refreshInto) {
        setStep({
          name: 'reviewing',
          treeId,
          oldTreeId: refreshInto,
          parsed,
          vault,
          preview: null,
          applying: false,
        });
        try {
          const preview = await previewRefresh(supabase, refreshInto, treeId);
          setStep({
            name: 'reviewing',
            treeId,
            oldTreeId: refreshInto,
            parsed,
            vault,
            preview,
            applying: false,
          });
        } catch (error) {
          console.warn('Refresh comparison failed', error);
          showAlert(
            'Imported, but could not compare',
            'Your new tree is here and usable. It is sitting alongside the old one rather than replacing it.',
          );
          setStep({ name: 'done', treeId, parsed, vault });
        }
        return;
      }

      setStep({ name: 'done', treeId, parsed, vault });
    } catch (error) {
      showAlert('Import failed', error instanceof Error ? error.message : String(error));
      setStep({ name: 'ready', fileName, parsed, original });
    }
  }

  /** Commit the swap: move the reader's work across, retire the old tree. */
  async function commitRefresh(
    step: Extract<Step, { name: 'reviewing' }>,
    preview: RefreshPreview,
  ) {
    setStep({ ...step, applying: true });
    try {
      const result = await applyRefresh(supabase, step.oldTreeId, step.treeId, preview);
      await refresh();
      if (!result.oldTreeDeleted) {
        // Everything worth keeping already moved; only the tidy-up failed.
        showAlert(
          'Updated, with one leftover',
          'Your work moved across, but the old copy could not be removed. You can delete it from the You tab.',
        );
      }
      setStep({ name: 'done', treeId: step.treeId, parsed: step.parsed, vault: step.vault });
    } catch (error) {
      showAlert(
        'Could not finish updating',
        error instanceof Error
          ? `${error.message} Both trees are still here — nothing was lost.`
          : 'Both trees are still here — nothing was lost.',
      );
      setStep({ ...step, applying: false });
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

      {step.name === 'reviewing' && !step.preview && (
        <>
          <ActivityIndicator />
          <ThemedText>Comparing this against your saved tree…</ThemedText>
        </>
      )}

      {step.name === 'reviewing' && step.preview && (
        <>
          <ThemedText type="subtitle">
            {step.preview.pulse.unchanged ? 'Nothing has changed.' : 'Here’s what your research did.'}
          </ThemedText>
          <ThemedText>{pulseSummary(step.preview.pulse)}</ThemedText>

          {!step.preview.pulse.unchanged && (
            <View style={{ gap: 2, marginTop: 4 }}>
              {step.preview.pulse.brickWallsBroken.slice(0, 3).map((p) => (
                <ThemedText key={p.xref} type="small">
                  · {p.name} now has a parent recorded
                </ThemedText>
              ))}
              {step.preview.pulse.added.slice(0, 3).map((p) => (
                <ThemedText key={p.xref} type="small">
                  · {p.name} is new to the tree
                </ThemedText>
              ))}
              {step.preview.pulse.removed.slice(0, 3).map((p) => (
                <ThemedText key={p.xref} type="small">
                  · {p.name} is no longer in the file
                </ThemedText>
              ))}
            </View>
          )}

          {step.preview.marksNote && (
            <ThemedText type="small" style={{ marginTop: 8 }}>
              {step.preview.marksNote}
            </ThemedText>
          )}

          {step.preview.correctionsNote && (
            <ThemedText type="small" style={{ marginTop: 8 }}>
              {step.preview.correctionsNote}
            </ThemedText>
          )}

          {step.preview.costWarning && (
            <ThemedText type="small" style={{ marginTop: 8, fontWeight: '600' }}>
              {step.preview.costWarning}
            </ThemedText>
          )}

          <ThemedText type="small" style={{ marginTop: 8 }}>
            Updating keeps your research briefs, archive verdicts, and margin corrections, and
            replaces the saved copy with this file. Your own GEDCOM is never changed.
          </ThemedText>

          <Button
            title={step.applying ? 'Updating…' : 'Update this tree'}
            disabled={step.applying}
            onPress={() => commitRefresh(step, step.preview!)}
          />
          <Button
            variant="secondary"
            title="Keep both trees"
            disabled={step.applying}
            onPress={() =>
              setStep({
                name: 'done',
                treeId: step.treeId,
                parsed: step.parsed,
                vault: step.vault,
              })
            }
          />
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
          {updateTarget ? (
            <>
              <ThemedText type="small">
                This looks like a newer export of “{updateTarget.name}” (
                {count(updateTarget.individualCount, 'person', 'people')} here already). Updating
                keeps your marks, briefs, verdicts, corrections, and shared links — and shows you
                what changed.
              </ThemedText>
              <Button
                title={`Update “${updateTarget.name}”`}
                onPress={() => runImport(step.fileName, step.parsed, step.original, updateTarget.id)}
              />
              <Button
                variant="secondary"
                title="Import as a separate tree"
                onPress={() => runImport(step.fileName, step.parsed, step.original)}
              />
            </>
          ) : (
            <Button
              title="Bring them into Witness"
              onPress={() => runImport(step.fileName, step.parsed, step.original)}
            />
          )}
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
          {step.vault.keyIsNew && (
            <ThemedText type="small">
              Your original file is now kept, encrypted, on our servers — locked with a key that
              only exists on this iPhone, so we can’t read it. Save your recovery code and you can
              get the file back on any device.
            </ThemedText>
          )}
          {step.vault.keyIsNew && (
            <Button
              variant="secondary"
              title="Save my recovery code"
              onPress={() => router.push('/recovery-code')}
            />
          )}
          {step.vault.available && !step.vault.stored && (
            <ThemedText type="small">
              We couldn’t keep an encrypted copy of your original file this time — your tree is
              imported and fine, but there’s no stored original to restore from. You can try again
              from You.
            </ThemedText>
          )}
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
            {desktopFormat
              ? `That’s a ${desktopFormat.app} project file`
              : step.kind === 'not-gedcom'
                ? 'That doesn’t look like a family tree file'
                : 'We couldn’t read that file'}
          </ThemedText>
          <ThemedText>
            {desktopFormat
              ? `${step.fileName} is ${desktopFormat.app}’s own working file — programs exchange trees as GEDCOM (.ged) instead. In ${desktopFormat.app}, choose ${desktopFormat.how}, then send the .ged file it creates to this iPhone or iPad and share it to Witness.`
              : step.kind === 'not-gedcom'
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
