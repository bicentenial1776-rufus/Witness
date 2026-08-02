import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { showAlert } from '@/lib/alert';
import { getRecoveryCode, isVaultAvailable, restoreKeyFromRecoveryCode } from '@/lib/gedcom-vault';
import { WideContent } from '@/constants/theme';

/**
 * The one place the encryption key is ever shown. It stays viewable rather
 * than being a one-time reveal — a code you can only see once is a code most
 * people lose, and it is on the device already: anyone who can open this
 * screen has unlocked the phone and signed in.
 */
export default function RecoveryCode() {
  const [code, setCode] = useState<string | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [entry, setEntry] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const ok = await isVaultAvailable();
      setAvailable(ok);
      if (ok) setCode(await getRecoveryCode());
    })();
  }, []);

  async function copy() {
    if (!code) return;
    await Clipboard.setStringAsync(code);
    showAlert('Copied', 'Paste it somewhere safe — a password manager is ideal.');
  }

  async function adopt() {
    setBusy(true);
    try {
      await restoreKeyFromRecoveryCode(entry);
      setCode(await getRecoveryCode());
      setEntry('');
      showAlert('Recovery code saved', 'This iPhone can now open your stored files.');
    } catch (error) {
      showAlert('That code didn’t work', error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ThemedView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ ...WideContent, padding: 24, gap: 12 }}>
        <ThemedText type="title">Recovery code</ThemedText>

        {available === false && (
          <ThemedText>
            Storing an encrypted copy of your file needs the iPhone or iPad app — a web browser has
            nowhere safe to keep the key.
          </ThemedText>
        )}

        {available && (
          <>
            <ThemedText>
              When you import a tree, Witness keeps your original GEDCOM file encrypted on our
              servers. The key never leaves this device, which is what lets us say we can’t read
              it — and also means we can’t recover it for you.
            </ThemedText>

            {code ? (
              <>
                <Card>
                  <ThemedText type="small">Your recovery code</ThemedText>
                  <ThemedText style={{ fontFamily: 'IBMPlexMono_400Regular', marginTop: 8 }} selectable>
                    {code}
                  </ThemedText>
                </Card>
                <Button title="Copy recovery code" onPress={copy} />
                <ThemedText type="small">
                  Save this in a password manager. If you lose this iPhone and haven’t saved the
                  code, the stored copy of your file can never be opened again — not by you, and
                  not by us. Your tree inside Witness is unaffected, and so is the file wherever
                  you originally exported it.
                </ThemedText>
              </>
            ) : (
              <ThemedText type="small">
                No code yet — one is created the first time you import a tree on this device.
              </ThemedText>
            )}

            <ThemedText type="subtitle" style={{ marginTop: 16 }}>
              Moving from another device
            </ThemedText>
            <ThemedText type="small">
              Paste the recovery code from your old iPhone and this one will be able to open files
              stored from it.
            </ThemedText>
            <View style={{ gap: 8 }}>
              <TextField
                value={entry}
                onChangeText={setEntry}
                placeholder="Paste recovery code"
                autoCapitalize="none"
                autoCorrect={false}
                multiline
              />
              <Button
                title="Use this code"
                variant="secondary"
                busy={busy}
                disabled={!entry.trim() || busy}
                onPress={adopt}
              />
            </View>
          </>
        )}
      </ScrollView>
    </ThemedView>
  );
}
