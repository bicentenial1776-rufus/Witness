import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Switch, View } from 'react-native';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useSession } from '@/auth/session-provider';
import { useActiveTree } from '@/lib/active-tree';
import {
  isDigestNotificationEnabled,
  setDigestNotificationEnabled,
} from '@/lib/digest-notifications';
import { supabase } from '@/lib/supabase';

export default function YouTab() {
  const { session } = useSession();
  const { trees, activeTree } = useActiveTree();
  const [notifyEnabled, setNotifyEnabled] = useState(false);
  const [notifyBusy, setNotifyBusy] = useState(false);

  useEffect(() => {
    isDigestNotificationEnabled().then(setNotifyEnabled);
  }, []);

  async function toggleNotifications(value: boolean) {
    if (!activeTree) return;
    setNotifyBusy(true);
    setNotifyEnabled(await setDigestNotificationEnabled(value, activeTree.id));
    setNotifyBusy(false);
  }

  return (
    <ThemedView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 72, paddingBottom: 48, gap: 12 }}>
        <ThemedText type="title">You</ThemedText>
        <ThemedText type="small">{session?.user.email}</ThemedText>

        {(trees ?? []).map((tree) => (
          <Card
            key={tree.id}
            onPress={() => router.push({ pathname: '/home-person', params: { treeId: tree.id } })}
          >
            <ThemedText type="small">{tree.name}</ThemedText>
            <ThemedText>
              {tree.home_person
                ? `You are ${tree.home_person.full_name}`
                : 'Tell us who you are in this tree'}
            </ThemedText>
            <ThemedText type="link">Change ›</ThemedText>
          </Card>
        ))}

        <Card>
          <View
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <View style={{ flex: 1, paddingRight: 12 }}>
              <ThemedText>Weekly reminder</ThemedText>
              <ThemedText type="small">
                A Sunday morning notification with the week’s anniversaries.
              </ThemedText>
            </View>
            <Switch
              value={notifyEnabled}
              onValueChange={toggleNotifications}
              disabled={notifyBusy || !activeTree}
            />
          </View>
        </Card>

        <ThemedText type="link" style={{ marginTop: 8 }} onPress={() => supabase.auth.signOut()}>
          Sign out
        </ThemedText>
      </ScrollView>
    </ThemedView>
  );
}
