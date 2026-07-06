import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, Switch, View } from 'react-native';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useSession } from '@/auth/session-provider';
import { useActiveTree, type TreeRow } from '@/lib/active-tree';
import {
  isDigestNotificationEnabled,
  setDigestNotificationEnabled,
} from '@/lib/digest-notifications';
import { invalidateGeographyCache } from '@/lib/geography-cache';
import { invalidateRelationshipCache } from '@/lib/relationship-cache';
import { supabase } from '@/lib/supabase';
import { WideContent } from '@/constants/theme';

export default function YouTab() {
  const { session } = useSession();
  const { trees, activeTree, refresh } = useActiveTree();
  const [notifyEnabled, setNotifyEnabled] = useState(false);
  const [notifyBusy, setNotifyBusy] = useState(false);

  useEffect(() => {
    isDigestNotificationEnabled().then(setNotifyEnabled);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  function confirmDelete(tree: TreeRow) {
    Alert.alert(
      `Delete "${tree.name}"?`,
      `This removes the imported copy (${tree.individual_count.toLocaleString()} people) from Witness. Your GEDCOM file is untouched.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('trees').delete().eq('id', tree.id);
            if (error) Alert.alert('Delete failed', error.message);
            else {
              invalidateGeographyCache();
              invalidateRelationshipCache();
              refresh();
            }
          },
        },
      ],
    );
  }

  async function toggleNotifications(value: boolean) {
    if (!activeTree) return;
    setNotifyBusy(true);
    setNotifyEnabled(await setDigestNotificationEnabled(value, activeTree.id));
    setNotifyBusy(false);
  }

  return (
    <ThemedView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ ...WideContent, padding: 24, paddingTop: 72, paddingBottom: 48, gap: 12 }}>
        <ThemedText type="title">You</ThemedText>
        <ThemedText type="small">{session?.user.email}</ThemedText>

        <ThemedText type="subtitle" style={{ marginTop: 8 }}>
          Your trees
        </ThemedText>
        {(trees ?? []).map((tree) => (
          <Card key={tree.id}>
            <ThemedText type="subtitle">{tree.name}</ThemedText>
            <ThemedText type="small">
              {tree.individual_count.toLocaleString()} people ·{' '}
              {tree.family_count.toLocaleString()} families ·{' '}
              {tree.place_count.toLocaleString()} places
            </ThemedText>
            <ThemedText type="small">
              Imported {new Date(tree.imported_at).toLocaleDateString()}
            </ThemedText>
            <View style={{ flexDirection: 'row', gap: 16, marginTop: 4 }}>
              <ThemedText
                type="link"
                onPress={() =>
                  router.push({ pathname: '/home-person', params: { treeId: tree.id } })
                }
              >
                {tree.home_person ? `You are ${tree.home_person.full_name}` : 'Tell us who you are'}
              </ThemedText>
              <ThemedText type="link" onPress={() => confirmDelete(tree)}>
                Delete
              </ThemedText>
            </View>
          </Card>
        ))}
        <ThemedText type="link" onPress={() => router.push('/import')}>
          Import another tree ›
        </ThemedText>
        <ThemedText type="link" onPress={() => router.push('/import-guide')}>
          How to export a tree from Ancestry, FamilySearch & more ›
        </ThemedText>
        <ThemedText type="link" onPress={() => router.push('/faq')}>
          Questions & answers ›
        </ThemedText>

        <Card style={{ marginTop: 8 }}>
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
