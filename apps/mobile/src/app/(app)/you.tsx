import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, ScrollView, Switch, View } from 'react-native';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useSession } from '@/auth/session-provider';
import { useActiveTree, type TreeRow } from '@/lib/active-tree';
import { clearResumePoint } from '@/lib/resume';
import {
  isDigestNotificationEnabled,
  setDigestNotificationEnabled,
} from '@/lib/digest-notifications';
import { invalidateCuriositiesCache } from '@/lib/curiosities-cache';
import { invalidateGeographyCache } from '@/lib/geography-cache';
import { invalidateRelationshipCache } from '@/lib/relationship-cache';
import { supabase } from '@/lib/supabase';
import { WideContent } from '@/constants/theme';

export default function YouTab() {
  const { session } = useSession();
  const { trees, activeTree, refresh } = useActiveTree();
  const [notifyEnabled, setNotifyEnabled] = useState(false);
  const [notifyBusy, setNotifyBusy] = useState(false);
  const [shareLinks, setShareLinks] = useState<
    { token: string; payload: { fullName?: string }; expires_at: string }[] | null
  >(null);

  useEffect(() => {
    isDigestNotificationEnabled().then(setNotifyEnabled);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
      let cancelled = false;
      supabase
        .from('share_links')
        .select('token, payload, expires_at')
        .is('revoked_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .then(({ data }) => {
          if (!cancelled) {
            setShareLinks(
              (data ?? []) as { token: string; payload: { fullName?: string }; expires_at: string }[],
            );
          }
        });
      return () => {
        cancelled = true;
      };
    }, [refresh]),
  );

  async function revokeLink(token: string) {
    const { error } = await supabase
      .from('share_links')
      .update({ revoked_at: new Date().toISOString() })
      .eq('token', token);
    if (error) Alert.alert('Could not take the link back', error.message);
    else setShareLinks((current) => current?.filter((link) => link.token !== token) ?? null);
  }

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
            // A whole-tree cascade delete exceeds the API statement timeout
            // on real trees, so the server deletes in bounded slices and we
            // call until it reports done (see delete_tree_batch migration).
            let error: string | null = null;
            for (let i = 0; i < 200; i++) {
              const { data, error: rpcError } = await supabase.rpc('delete_tree_batch', {
                p_tree_id: tree.id,
              });
              if (rpcError) {
                error = rpcError.message;
                break;
              }
              if ((data as { done?: boolean } | null)?.done) break;
            }
            if (error) Alert.alert('Delete failed', error);
            else {
              invalidateGeographyCache();
              invalidateRelationshipCache();
              invalidateCuriositiesCache();
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
                {Platform.OS === 'web'
                  ? 'A Sunday morning email with the week’s anniversaries.'
                  : 'A Sunday morning notification with the week’s anniversaries.'}
              </ThemedText>
            </View>
            <Switch
              value={notifyEnabled}
              onValueChange={toggleNotifications}
              disabled={notifyBusy || !activeTree}
            />
          </View>
        </Card>

        {shareLinks !== null && shareLinks.length > 0 && (
          <Card style={{ marginTop: 8 }}>
            <ThemedText type="subtitle">Shared stories</ThemedText>
            <ThemedText type="small">
              Anyone with the link can see that card until it expires — or until you take it back.
            </ThemedText>
            {shareLinks.map((link) => (
              <View
                key={link.token}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  marginTop: 8,
                }}
              >
                <View style={{ flexShrink: 1 }}>
                  <ThemedText>{link.payload.fullName ?? 'A family story'}</ThemedText>
                  <ThemedText type="small">
                    until {new Date(link.expires_at).toLocaleDateString()}
                  </ThemedText>
                </View>
                <ThemedText type="smallBold" themeColor="accent" onPress={() => revokeLink(link.token)}>
                  Take back
                </ThemedText>
              </View>
            ))}
          </Card>
        )}

        <ThemedText
          type="link"
          style={{ marginTop: 8 }}
          onPress={() => {
            // One account's trail must not greet the next: drop both resume
            // stores before the session ends (2026-07-26 audit).
            clearResumePoint().catch(() => {});
            if (Platform.OS === 'web') {
              try {
                localStorage.removeItem('witness_last_route');
              } catch {}
            }
            supabase.auth.signOut();
          }}
        >
          Sign out
        </ThemedText>

        {/* Attribution required by NARA's API terms — must remain visible in the app. */}
        <ThemedText type="smallBold" style={{ marginTop: 24 }}>
          CREDITS
        </ThemedText>
        <ThemedText type="small">
          Our map is seeded with information from the National Archives Catalog. This product uses
          the National Archives Catalog API but is not endorsed or certified by the National
          Archives and Records Administration.
        </ThemedText>
      </ScrollView>
    </ThemedView>
  );
}
