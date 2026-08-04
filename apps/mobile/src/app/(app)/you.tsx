import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, Switch, View } from 'react-native';

import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useSession } from '@/auth/session-provider';
import { showAlert, showDestructiveConfirm } from '@/lib/alert';
import { useActiveTree, type TreeRow } from '@/lib/active-tree';
import { clearResumePoint } from '@/lib/resume';
import {
  armDigestNotification,
  isDigestNotificationEnabled,
  setDigestNotificationEnabled,
} from '@/lib/digest-notifications';
import { getLineageScope, setLineageScope } from '@/lib/lineage-scope';
import { invalidateCuriositiesCache } from '@/lib/curiosities-cache';
import { discardOriginal, isVaultAvailable, restoreToCacheFile } from '@/lib/gedcom-vault';
import { invalidateGeographyCache } from '@/lib/geography-cache';
import { invalidateRelationshipCache } from '@/lib/relationship-cache';
import { invalidateTreeIndexCache } from '@/lib/tree-index-cache';
import { supabase } from '@/lib/supabase';
import { WideContent } from '@/constants/theme';

export default function YouTab() {
  const { session } = useSession();
  const { trees, activeTree, loadFailed, selectTree, refresh } = useActiveTree();
  const [notifyEnabled, setNotifyEnabled] = useState(false);
  const [notifyBusy, setNotifyBusy] = useState(false);
  const [shareLinks, setShareLinks] = useState<
    { token: string; payload: { fullName?: string }; expires_at: string }[] | null
  >(null);
  const [deleting, setDeleting] = useState<{
    treeId: string;
    removed: number;
    stage: string;
  } | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [vaultReady, setVaultReady] = useState(false);

  useEffect(() => {
    isVaultAvailable().then(setVaultReady);
  }, []);

  useEffect(() => {
    isDigestNotificationEnabled().then(setNotifyEnabled);
  }, []);

  const [directLineOnly, setDirectLineOnly] = useState(true);
  useEffect(() => {
    getLineageScope().then((scope) => setDirectLineOnly(scope === 'direct'));
  }, []);

  async function toggleDirectLineOnly(value: boolean) {
    setDirectLineOnly(value);
    await setLineageScope(value ? 'direct' : 'all');
    // The scheduled Sunday notification was composed under the old scope.
    if (activeTree) armDigestNotification(activeTree.id).catch(() => {});
  }

  // The counts on `trees` are written once at import and never revisited, so
  // anything that removes rows behind their back leaves them lying — and they
  // are not cosmetic: the largest individual_count decides which tree is
  // active. Recompute them from the rows that actually exist whenever this
  // screen has a tree list, and refresh only if something had drifted.
  const recountedFor = useRef('');
  useEffect(() => {
    const ids = (trees ?? [])
      .map((tree) => tree.id)
      .sort()
      .join(',');
    if (!ids || recountedFor.current === ids) return;
    recountedFor.current = ids;
    let cancelled = false;
    (async () => {
      let drifted = false;
      for (const tree of trees ?? []) {
        const { data } = await supabase.rpc('recount_tree', { p_tree_id: tree.id });
        const counted = data as { individuals?: number } | null;
        if (counted?.individuals !== undefined && counted.individuals !== tree.individual_count) {
          drifted = true;
        }
      }
      if (!cancelled && drifted) refresh();
    })();
    return () => {
      cancelled = true;
    };
  }, [trees, refresh]);

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

  // Decrypt the stored original back onto the device and hand it to the import
  // screen, which already knows how to parse, report and re-store it. The
  // restore lands as a new tree rather than overwriting this one — the old
  // rows may be exactly what someone is trying to get away from.
  async function restoreTree(tree: TreeRow) {
    if (!tree.gedcom_path) return;
    setRestoring(tree.id);
    try {
      const uri = await restoreToCacheFile(tree.gedcom_path, `${tree.name || 'tree'}.ged`);
      router.push({ pathname: '/import', params: { fileUri: uri } });
    } catch (error) {
      showAlert('Could not restore', error instanceof Error ? error.message : String(error));
    } finally {
      setRestoring(null);
    }
  }

  async function revokeLink(token: string) {
    const { error } = await supabase
      .from('share_links')
      .update({ revoked_at: new Date().toISOString() })
      .eq('token', token);
    if (error) showAlert('Could not take the link back', error.message);
    else setShareLinks((current) => current?.filter((link) => link.token !== token) ?? null);
  }

  function confirmDelete(tree: TreeRow) {
    showDestructiveConfirm(
      `Delete "${tree.name}"?`,
      `This removes the imported copy (${tree.individual_count.toLocaleString()} people) from Witness. Your GEDCOM file is untouched.`,
      'Delete',
      async () => {
        // A whole-tree cascade delete exceeds the API statement timeout
        // on real trees, so the server deletes in bounded slices and we
        // call until it reports done (see delete_tree_batch migration).
        //
        // A tree of 5,495 people needs ~40 calls. Silence for that long reads
        // as a dead button, and worse: this loop used to fall through to the
        // success path when it ran out of iterations, so a delete that stopped
        // half-way reported nothing at all. One did, and it left a tree
        // claiming 5,495 people while holding 295 (2026-08-01).
        let error: string | null = null;
        let done = false;
        let removed = 0;
        setDeleting({ treeId: tree.id, removed: 0, stage: 'starting' });
        for (let i = 0; i < 400; i++) {
          const { data, error: rpcError } = await supabase.rpc('delete_tree_batch', {
            p_tree_id: tree.id,
          });
          if (rpcError) {
            error = rpcError.message;
            break;
          }
          const result = data as { done?: boolean; deleted?: number; stage?: string } | null;
          removed += result?.deleted ?? 0;
          setDeleting({ treeId: tree.id, removed, stage: result?.stage ?? '' });
          if (result?.done) {
            done = true;
            break;
          }
        }
        setDeleting(null);
        // The bucket has no cascade from `trees`, so a deleted tree would
        // otherwise leave its ciphertext behind forever — paid for, unreachable
        // from the app, and still the user's data. Only once the rows are
        // actually gone: a half-finished delete is going to be retried, and
        // that retry may well be the restore.
        if (done && tree.gedcom_path) {
          try {
            await discardOriginal(tree.gedcom_path);
          } catch (storageError) {
            console.warn('Stored original left behind', storageError);
          }
        }
        invalidateGeographyCache();
        invalidateRelationshipCache();
        invalidateCuriositiesCache();
        invalidateTreeIndexCache();
        refresh();

        if (error) {
          showAlert(
            'Delete failed',
            `${error}\n\n${removed.toLocaleString()} records were removed before it stopped, so this tree is now incomplete. Delete it again to finish.`,
          );
        } else if (!done) {
          // Never report success we did not observe.
          showAlert(
            'Delete unfinished',
            `This tree is larger than expected and only partly removed (${removed.toLocaleString()} records). Delete it again to finish.`,
          );
        }
      },
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
        {loadFailed && (
          <ThemedText type="small">
            Couldn’t reach your trees just now, so this list may be out of date or empty. Nothing
            has been lost — it’ll refresh when the connection is back.
          </ThemedText>
        )}
        {(trees?.length ?? 0) > 1 && (
          <ThemedText type="small">
            Explore, the Register and the Archives all read the tree in use. Pick which one.
          </ThemedText>
        )}
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
            {(trees?.length ?? 0) > 1 &&
              (tree.id === activeTree?.id ? (
                <ThemedText type="small" style={{ marginTop: 4, fontWeight: '600' }}>
                  In use
                </ThemedText>
              ) : (
                <ThemedText type="link" style={{ marginTop: 4 }} onPress={() => selectTree(tree.id)}>
                  Use this tree
                </ThemedText>
              ))}
            <View style={{ flexDirection: 'row', gap: 16, marginTop: 4 }}>
              <ThemedText
                type="link"
                onPress={() =>
                  router.push({ pathname: '/home-person', params: { treeId: tree.id } })
                }
              >
                {tree.home_person ? `You are ${tree.home_person.full_name}` : 'Tell us who you are'}
              </ThemedText>
              <ThemedText
                type="link"
                onPress={() => {
                  if (!deleting) confirmDelete(tree);
                }}
                style={deleting ? { opacity: 0.4 } : undefined}
              >
                Delete
              </ThemedText>
              {vaultReady && tree.gedcom_path && (
                <ThemedText
                  type="link"
                  onPress={() => {
                    if (!restoring && !deleting) restoreTree(tree);
                  }}
                  style={restoring || deleting ? { opacity: 0.4 } : undefined}
                >
                  {restoring === tree.id ? 'Opening…' : 'Restore original'}
                </ThemedText>
              )}
            </View>
            {vaultReady && (
              <ThemedText type="small">
                {tree.gedcom_path
                  ? `Your original file is kept encrypted${
                      tree.gedcom_bytes
                        ? ` (${(tree.gedcom_bytes / 1024 / 1024).toFixed(1)} MB)`
                        : ''
                    } — only this iPhone holds the key.`
                  : 'No encrypted copy of the original file — import it again to store one.'}
              </ThemedText>
            )}
            {deleting?.treeId === tree.id && (
              <ThemedText type="small">
                {`Deleting ${deleting.stage} — ${deleting.removed.toLocaleString()} records removed. Keep this screen open.`}
              </ThemedText>
            )}
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
        {vaultReady && (
          <ThemedText type="link" onPress={() => router.push('/recovery-code')}>
            Your recovery code ›
          </ThemedText>
        )}

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

        <Card style={{ marginTop: 8 }}>
          <View
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <View style={{ flex: 1, paddingRight: 12 }}>
              <ThemedText>Your direct line only</ThemedText>
              <ThemedText type="small">
                Feature only your ancestors and descendants in the digest and “Related” filters.
                Cousins and other relatives keep their relationship labels but aren’t featured.
              </ThemedText>
            </View>
            <Switch value={directLineOnly} onValueChange={toggleDirectLineOnly} />
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
