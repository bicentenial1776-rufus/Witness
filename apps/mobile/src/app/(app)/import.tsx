import { randomUUID } from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Button } from 'react-native';

import type { ParsedGedcom } from '@witness/core/gedcom';
import { extractGedcomText, parseGedcom } from '@witness/core/gedcom';
import { importParsedGedcom, type ImportProgress } from '@witness/core/supabase';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useSession } from '@/auth/session-provider';
import { invalidateGeographyCache } from '@/lib/geography-cache';
import { supabase } from '@/lib/supabase';

type Step =
  | { name: 'pick' }
  | { name: 'parsing'; fileName: string }
  | { name: 'ready'; fileName: string; parsed: ParsedGedcom }
  | { name: 'importing'; fileName: string; parsed: ParsedGedcom; progress: ImportProgress | null }
  | { name: 'done'; treeId: string; parsed: ParsedGedcom };

export default function ImportGedcom() {
  const { session } = useSession();
  const [step, setStep] = useState<Step>({ name: 'pick' });

  async function pickAndParse() {
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (result.canceled) return;

    const asset = result.assets[0];
    setStep({ name: 'parsing', fileName: asset.name });
    try {
      // Bytes, not text: FamilySearch .gdz exports are zip archives and
      // extractGedcomText handles both those and plain .ged files.
      const bytes = await new File(asset.uri).bytes();
      const text = extractGedcomText(bytes);
      const parsed = parseGedcom(text, asset.name);
      if (parsed.metadata.individualCount === 0) {
        Alert.alert('Not a GEDCOM file', `No individuals found in ${asset.name}. Is this a GEDCOM export?`);
        setStep({ name: 'pick' });
        return;
      }
      setStep({ name: 'ready', fileName: asset.name, parsed });
    } catch (error) {
      Alert.alert('Could not read file', error instanceof Error ? error.message : String(error));
      setStep({ name: 'pick' });
    }
  }

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
      setStep({ name: 'done', treeId, parsed });
    } catch (error) {
      Alert.alert('Import failed', error instanceof Error ? error.message : String(error));
      setStep({ name: 'ready', fileName, parsed });
    }
  }

  return (
    <ThemedView style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 12 }}>
      <ThemedText type="title">Import your tree</ThemedText>

      {step.name === 'pick' && (
        <>
          <ThemedText>
            Choose a GEDCOM file exported from Ancestry, FamilySearch, or any genealogy platform.
          </ThemedText>
          <Button title="Choose GEDCOM file" onPress={pickAndParse} />
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
          <ThemedText type="subtitle">{step.parsed.metadata.treeName ?? step.fileName}</ThemedText>
          <ThemedText>
            {step.parsed.metadata.individualCount.toLocaleString()} people ·{' '}
            {step.parsed.metadata.familyCount.toLocaleString()} families ·{' '}
            {step.parsed.metadata.placeCount.toLocaleString()} places
          </ThemedText>
          {step.parsed.metadata.parseWarnings.length > 0 && (
            <ThemedText>{step.parsed.metadata.parseWarnings.length} parse warnings (non-fatal)</ThemedText>
          )}
          <Button title="Import to Witness" onPress={() => runImport(step.fileName, step.parsed)} />
          <Button title="Choose a different file" onPress={pickAndParse} />
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
          <ThemedText type="subtitle">Your tree is in.</ThemedText>
          <ThemedText>
            {step.parsed.metadata.individualCount.toLocaleString()} people are now part of Witness.
            One more thing: tell us who you are in this tree, and every ancestor gets a
            relationship to you.
          </ThemedText>
          <Button
            title="Find me in the tree"
            onPress={() =>
              router.replace({ pathname: '/home-person', params: { treeId: step.treeId } })
            }
          />
          <Button title="Skip for now" onPress={() => router.back()} />
        </>
      )}

      {(step.name === 'pick' || step.name === 'ready') && (
        <Button title="Cancel" onPress={() => router.back()} />
      )}
    </ThemedView>
  );
}
