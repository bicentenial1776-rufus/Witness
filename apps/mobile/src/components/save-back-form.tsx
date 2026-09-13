import { useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';

import { renderSaveBack, type RegisterDef, type RenderedSaveBack } from '@witness/core/registers';

import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';

/**
 * Variant C's confirm — the structured save-back
 * (docs/witness-historical-record-registers-package.md, Variant C). The
 * reader has found the person in the outside file and comes back with
 * the record's key fields; this takes them in the register's own words
 * (config.saveBack), renders the card's name and summary from them, and
 * hands the result back. Nothing is written here.
 */
export function SaveBackForm({
  register,
  personName,
  visible,
  onClose,
  onSave,
}: {
  register: RegisterDef;
  personName: string;
  visible: boolean;
  onClose: () => void;
  onSave: (rendered: RenderedSaveBack) => Promise<void>;
}) {
  const theme = useTheme();
  const config = register.config.saveBack;
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!config) return null;

  async function save() {
    const rendered = renderSaveBack(config!, values);
    if (rendered.missing.length > 0) {
      setError(`Still needed: ${rendered.missing.join(', ')}.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave(rendered);
      setValues({});
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ThemedView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 24, gap: 10 }} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <ThemedText type="title">{config.title}</ThemedText>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
              <ThemedText type="link">Close</ThemedText>
            </Pressable>
          </View>
          <ThemedText type="small">
            {config.intro ??
              `Copy the record you found for ${personName.split(' ')[0]} — as the file has it, in its own spelling. Leave blank what the record does not say.`}
          </ThemedText>
          {config.fields.map((field) => (
            <View key={field.key} style={{ gap: 4 }}>
              <ThemedText type="small" themeColor="textSecondary">
                {field.label}
                {field.required ? ' *' : ''}
              </ThemedText>
              <TextField
                id={`save-back-${register.registerKey}-${field.key}`}
                placeholder={field.placeholder}
                autoCapitalize="none"
                autoCorrect={false}
                multiline={field.multiline}
                value={values[field.key] ?? ''}
                onChangeText={(t) => setValues((v) => ({ ...v, [field.key]: t }))}
              />
            </View>
          ))}
          <ThemedText type="small" themeColor="textSecondary">
            Source: {config.sourceCitation}
          </ThemedText>
          {error && (
            <ThemedText type="small" style={{ color: theme.accent }}>
              {error}
            </ThemedText>
          )}
          <Button title="Save this record" busy={busy} onPress={save} />
        </ScrollView>
      </ThemedView>
    </Modal>
  );
}
