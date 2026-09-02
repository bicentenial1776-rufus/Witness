import Constants from 'expo-constants';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, Share, Switch, View } from 'react-native';

import type { LineageScope } from '@witness/core/family';

import { Card } from '@/components/card';
import { TextField } from '@/components/text-field';
import { RecordText } from '@/components/record-text';
import { openFieldGuide } from '@/components/field-guide';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useSession } from '@/auth/session-provider';
import { useTheme } from '@/hooks/use-theme';
import { showAlert, showDestructiveConfirm } from '@/lib/alert';
import { useActiveTree, type TreeRow } from '@/lib/active-tree';
import { clearResumePoint } from '@/lib/resume';
import {
  armDigestNotification,
  isDigestNotificationEnabled,
  setDigestNotificationEnabled,
} from '@/lib/digest-notifications';
import {
  SEAT_LIMIT,
  createInvite,
  fetchMembers,
  fetchPendingInvites,
  removeMember,
  revokeInvite,
  type InviteRow,
  type TreeMemberRow,
} from '@/lib/family-sharing';
import { getLineageScope, setLineageScope } from '@/lib/lineage-scope';
import { manageSubscriptionUrl, openManageSubscription } from '@/lib/manage-subscription';
import { usePurchases } from '@/lib/purchases';
import { invalidateCuriositiesCache } from '@/lib/curiosities-cache';
import { discardOriginal, isVaultAvailable, restoreToCacheFile } from '@/lib/gedcom-vault';
import { invalidateGeographyCache } from '@/lib/geography-cache';
import {
  getLineageCounts,
  invalidateRelationshipCache,
  type LineageCounts,
} from '@/lib/relationship-cache';
import { invalidateTreeIndexCache } from '@/lib/tree-index-cache';
import { supabase } from '@/lib/supabase';
import { WideContent } from '@/constants/theme';

function SectionHeader({ children }: { children: string }) {
  return (
    <ThemedText type="subtitle" style={{ marginTop: 16 }}>
      {children}
    </ThemedText>
  );
}

export default function YouTab() {
  const { session } = useSession();
  const theme = useTheme();
  const { trees, activeTree, loadFailed, selectTree, refresh } = useActiveTree();
  const [notifyEnabled, setNotifyEnabled] = useState(false);
  const [notifyBusy, setNotifyBusy] = useState(false);
  const [lineageScope, setLineageScopeState] = useState<LineageScope>('direct');
  const [lineageCounts, setLineageCounts] = useState<LineageCounts | null>(null);
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
  const [members, setMembers] = useState<TreeMemberRow[] | null>(null);
  const [invites, setInvites] = useState<InviteRow[] | null>(null);
  const [inviting, setInviting] = useState(false);
  const [inviteAsking, setInviteAsking] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const { subscription, restore: restorePurchase } = usePurchases();
  const [restoringPurchase, setRestoringPurchase] = useState(false);

  useEffect(() => {
    isVaultAvailable().then(setVaultReady);
  }, []);

  useEffect(() => {
    isDigestNotificationEnabled().then(setNotifyEnabled);
  }, []);

  useEffect(() => {
    getLineageScope().then(setLineageScopeState);
  }, []);

  async function changeLineageScope(scope: LineageScope) {
    setLineageScopeState(scope);
    await setLineageScope(scope);
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
    // Owned trees only: recount_tree raises on a tree the caller doesn't
    // own, and a shared tree's counts are the owner's to maintain.
    const ownedTrees = (trees ?? []).filter((tree) => tree.owned);
    const ids = ownedTrees
      .map((tree) => tree.id)
      .sort()
      .join(',');
    if (!ids || recountedFor.current === ids) return;
    recountedFor.current = ids;
    let cancelled = false;
    (async () => {
      let drifted = false;
      for (const tree of ownedTrees) {
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
      // On focus, not mount: the home-person screen rewrites the relationship
      // rows while this screen sits beneath it, so counts fetched at mount are
      // stale zeros until refetched. The row cache makes repeat calls free.
      if (activeTree) {
        getLineageCounts(activeTree.id)
          .then((counts) => {
            if (!cancelled) setLineageCounts(counts);
          })
          .catch(() => {});
      }
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
      if (activeTree?.owned) {
        fetchMembers(activeTree.id)
          .then((rows) => {
            if (!cancelled) setMembers(rows);
          })
          .catch(() => {});
        fetchPendingInvites()
          .then((rows) => {
            if (!cancelled) setInvites(rows.filter((invite) => invite.tree_id === activeTree.id));
          })
          .catch(() => {});
      } else {
        setMembers(null);
        setInvites(null);
      }
      return () => {
        cancelled = true;
      };
    }, [refresh, activeTree?.id, activeTree?.owned]),
  );

  // A seat is access, not data: leaving ends the read and nothing else.
  function confirmLeave(tree: TreeRow) {
    showDestructiveConfirm(
      `Leave "${tree.name}"?`,
      'This tree will disappear from your list and your access ends now. Nothing you imported yourself is touched. You can rejoin with a fresh invitation.',
      'Leave',
      async () => {
        try {
          await removeMember(tree.id);
        } catch (error) {
          showAlert('Could not leave', error instanceof Error ? error.message : String(error));
          return;
        }
        invalidateRelationshipCache();
        refresh();
      },
    );
  }

  async function inviteFamily() {
    if (!activeTree) return;
    setInviting(true);
    try {
      const { url } = await createInvite(activeTree.id, inviteName);
      const message = `You're invited into the ${activeTree.name} on Witness. Open this link to take your seat: ${url}`;
      if (Platform.OS === 'web') {
        const nav = navigator as Navigator & { share?: (data: { text: string }) => Promise<void> };
        if (nav.share) await nav.share({ text: message });
        else {
          await navigator.clipboard?.writeText(url);
          showAlert('Invitation ready', `The link is on your clipboard:\n\n${url}\n\nIt works once and expires in 7 days.`);
        }
      } else {
        await Share.share({ message });
      }
      fetchPendingInvites()
        .then((rows) => setInvites(rows.filter((invite) => invite.tree_id === activeTree.id)))
        .catch(() => {});
      setInviteAsking(false);
      setInviteName('');
    } catch (error) {
      showAlert('Could not create the invitation', error instanceof Error ? error.message : String(error));
    } finally {
      setInviting(false);
    }
  }

  function confirmRemoveMember(member: TreeMemberRow) {
    if (!activeTree) return;
    showDestructiveConfirm(
      `Remove ${member.display_name ?? 'this family member'}?`,
      'Their seat ends now — the tree disappears from their account. Anything they imported themselves is untouched.',
      'Remove',
      async () => {
        try {
          await removeMember(activeTree.id, member.user_id);
          setMembers((current) => current?.filter((m) => m.user_id !== member.user_id) ?? null);
        } catch (error) {
          showAlert('Could not remove', error instanceof Error ? error.message : String(error));
        }
      },
    );
  }

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

  async function handleRestorePurchase() {
    setRestoringPurchase(true);
    try {
      const unlocked = await restorePurchase();
      if (!unlocked) {
        showAlert('Nothing to restore', 'No active subscription was found for this account.');
      }
    } catch (error) {
      showAlert('Restore failed', error instanceof Error ? error.message : String(error));
    } finally {
      setRestoringPurchase(false);
    }
  }

  // The paywall promises "Cancel anytime in Settings" — this section is where
  // that promise resolves to a real status and a real link, and where the
  // Day-5 trial reminder lands when tapped.
  const expiresOn = subscription?.expiresAt
    ? new Date(subscription.expiresAt).toLocaleDateString()
    : null;
  const subscriptionLine = !subscription
    ? null
    : subscription.isPromotional
      ? {
          title: 'Complimentary access',
          detail: expiresOn ? `Active through ${expiresOn}. Nothing is billed.` : 'Nothing is billed.',
        }
      : subscription.isTrial
        ? {
            title: 'Free trial',
            detail: expiresOn
              ? `Your subscription starts ${expiresOn} unless you cancel before then.`
              : 'Your subscription starts when the trial ends unless you cancel before then.',
          }
        : subscription.willRenew
          ? { title: 'Active', detail: expiresOn ? `Renews ${expiresOn}.` : 'Renews automatically.' }
          : {
              title: 'Active — not renewing',
              detail: expiresOn ? `Access runs through ${expiresOn}.` : 'No renewal is scheduled.',
            };

  const scopeOptions = [
    { key: 'direct', label: 'Direct line', count: lineageCounts?.direct },
    { key: 'blood', label: 'Blood relatives', count: lineageCounts?.blood },
    { key: 'distant', label: 'Blood and married-in', count: lineageCounts?.distant },
  ] as const;

  const scopeDescription: Record<LineageScope, string> = {
    direct:
      'Your ancestors and descendants — the people you descend from, and who descend from you.',
    blood:
      'Your direct line plus everyone who shares an ancestor with you — cousins, great-aunts and great-uncles.',
    distant:
      'Everyone above plus the people who married in — in-laws, step-family, and the spouses of your ancestors.',
  };

  return (
    <ThemedView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ ...WideContent, padding: 24, paddingTop: 72, paddingBottom: 48, gap: 12 }}>
        <ThemedText type="title">You</ThemedText>
        <ThemedText type="small">{session?.user.email}</ThemedText>

        <SectionHeader>Your trees</SectionHeader>
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
              {tree.place_count.toLocaleString()} places ·{' '}
              {tree.owned
                ? `imported ${new Date(tree.imported_at).toLocaleDateString()}`
                : 'shared with you'}
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
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 4 }}>
              <ThemedText
                type="link"
                onPress={() =>
                  router.push({ pathname: '/home-person', params: { treeId: tree.id } })
                }
              >
                {tree.owned
                  ? tree.home_person
                    ? `You are ${tree.home_person.full_name}`
                    : 'Tell us who you are'
                  : 'Who you are in this tree'}
              </ThemedText>
              {tree.owned && (
                <ThemedText
                  type="link"
                  onPress={() =>
                    router.push({ pathname: '/import', params: { refreshTreeId: tree.id } })
                  }
                >
                  Update from a newer file
                </ThemedText>
              )}
              {tree.owned && vaultReady && tree.gedcom_path && (
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
            {/* Set apart from the row above, and muted rather than accented.
                Delete used to sit among the safe actions looking exactly like
                them; adding "Update from a newer file" beside it made a
                mis-tap both likelier and more expensive. */}
            {tree.owned ? (
              <ThemedText
                type="link"
                onPress={() => {
                  if (!deleting) confirmDelete(tree);
                }}
                style={[
                  { marginTop: 10, opacity: 0.55, alignSelf: 'flex-start' },
                  deleting ? { opacity: 0.3 } : null,
                ]}
              >
                Delete this tree
              </ThemedText>
            ) : (
              <ThemedText
                type="link"
                onPress={() => confirmLeave(tree)}
                style={{ marginTop: 10, opacity: 0.55, alignSelf: 'flex-start' }}
              >
                Leave this tree
              </ThemedText>
            )}
            {tree.owned && vaultReady && (
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

        {activeTree?.owned && (
          <>
            <SectionHeader>Family</SectionHeader>
            <Card>
              <ThemedText type="small">
                Up to {SEAT_LIMIT} family members can read “{activeTree.name}” with you — every
                relationship told from their own seat. They can look; only you can change.
              </ThemedText>
              {(members ?? []).map((member) => (
                <View
                  key={member.user_id}
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    marginTop: 8,
                  }}
                >
                  <View style={{ flexShrink: 1 }}>
                    <ThemedText>{member.display_name ?? 'A family member'}</ThemedText>
                    <ThemedText type="small">
                      reading since {new Date(member.joined_at).toLocaleDateString()}
                    </ThemedText>
                  </View>
                  <ThemedText
                    type="smallBold"
                    themeColor="accent"
                    onPress={() => confirmRemoveMember(member)}
                  >
                    Remove
                  </ThemedText>
                </View>
              ))}
              {(invites ?? []).map((invite) => (
                <View
                  key={invite.token}
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    marginTop: 8,
                  }}
                >
                  <View style={{ flexShrink: 1 }}>
                    <ThemedText>
                      {invite.invited_name ? `Waiting for ${invite.invited_name}` : 'Invitation waiting'}
                    </ThemedText>
                    <ThemedText type="small">
                      works once · expires {new Date(invite.expires_at).toLocaleDateString()}
                    </ThemedText>
                  </View>
                  <ThemedText
                    type="smallBold"
                    themeColor="accent"
                    onPress={() =>
                      revokeInvite(invite.token)
                        .then(() =>
                          setInvites((current) => current?.filter((i) => i.token !== invite.token) ?? null),
                        )
                        .catch((error) =>
                          showAlert('Could not take the invitation back', String(error?.message ?? error)),
                        )
                    }
                  >
                    Take back
                  </ThemedText>
                </View>
              ))}
              {(members?.length ?? 0) < SEAT_LIMIT ? (
                inviteAsking ? (
                  <View style={{ marginTop: 12, gap: 8 }}>
                    <ThemedText type="small">
                      Who is this for? A name is enough — their email lets the seat find them
                      when they sign in.
                    </ThemedText>
                    <TextField
                      value={inviteName}
                      onChangeText={setInviteName}
                      placeholder="Name or email"
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoFocus
                    />
                    <View style={{ flexDirection: 'row', gap: 16 }}>
                      <ThemedText
                        type="link"
                        onPress={inviting ? undefined : inviteFamily}
                        style={inviting ? { opacity: 0.4 } : null}
                      >
                        {inviting ? 'Preparing the invitation…' : 'Send the invitation ›'}
                      </ThemedText>
                      {!inviting && (
                        <ThemedText
                          type="small"
                          onPress={() => {
                            setInviteAsking(false);
                            setInviteName('');
                          }}
                        >
                          Cancel
                        </ThemedText>
                      )}
                    </View>
                  </View>
                ) : (
                  <ThemedText type="link" onPress={() => setInviteAsking(true)} style={{ marginTop: 12 }}>
                    Invite family ›
                  </ThemedText>
                )
              ) : (
                <ThemedText type="small" style={{ marginTop: 12 }}>
                  All {SEAT_LIMIT} seats are taken. Remove someone to invite another.
                </ThemedText>
              )}
            </Card>
          </>
        )}

        <SectionHeader>Preferences</SectionHeader>
        <Card>
          <ThemedText>Who gets featured</ThemedText>
          <ThemedText type="small">
            Who counts as family in the digest, the Sunday reminder, and “Related” filters.
            Everyone else keeps their relationship label — they just aren’t celebrated.
          </ThemedText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {scopeOptions.map(({ key, label, count }) => {
              const active = lineageScope === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => changeLineageScope(key)}
                  style={{
                    backgroundColor: active ? theme.accent : theme.backgroundElement,
                    borderWidth: 1,
                    borderColor: active ? theme.accent : theme.border,
                    borderRadius: 16,
                    paddingHorizontal: 14,
                    paddingVertical: 7,
                  }}
                >
                  <ThemedText
                    type="small"
                    style={{ color: active ? theme.onAccent : theme.text, fontWeight: 600 }}
                  >
                    {count !== undefined ? `${label} (${count.toLocaleString()})` : label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
          <ThemedText type="small" style={{ marginTop: 8 }}>
            {scopeDescription[lineageScope]}
          </ThemedText>
        </Card>
        <Card>
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

        <SectionHeader>Your subscription</SectionHeader>
        <Card>
          {subscriptionLine ? (
            <>
              <ThemedText>{subscriptionLine.title}</ThemedText>
              <ThemedText type="small">{subscriptionLine.detail}</ThemedText>
            </>
          ) : (
            <ThemedText type="small">
              No subscription is recorded on this account just now — if you have one, Restore
              purchase below will find it.
            </ThemedText>
          )}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 8 }}>
            {!subscription?.isPromotional && manageSubscriptionUrl(subscription) && (
              <ThemedText type="link" onPress={() => openManageSubscription(subscription)}>
                Manage subscription ›
              </ThemedText>
            )}
            <ThemedText
              type="link"
              onPress={restoringPurchase ? undefined : handleRestorePurchase}
              style={restoringPurchase ? { opacity: 0.4 } : undefined}
            >
              {restoringPurchase ? 'Restoring…' : 'Restore purchase'}
            </ThemedText>
          </View>
        </Card>

        {shareLinks !== null && shareLinks.length > 0 && (
          <>
            <SectionHeader>Shared stories</SectionHeader>
            <Card>
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
          </>
        )}

        <SectionHeader>Help & account</SectionHeader>
        <ThemedText type="link" onPress={() => router.push('/faq')}>
          Questions & answers ›
        </ThemedText>
        <ThemedText type="link" onPress={() => openFieldGuide()}>
          The Field Guide — every screen, explained ›
        </ThemedText>
        {vaultReady && (
          <ThemedText type="link" onPress={() => router.push('/recovery-code')}>
            Your recovery code ›
          </ThemedText>
        )}
        <ThemedText
          type="link"
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
        {/* Muted like the tree delete, and last: leaving for good should be
            findable without ever being the thing a thumb lands on. */}
        <ThemedText
          type="link"
          onPress={() => router.push('/delete-account')}
          style={{ opacity: 0.55, alignSelf: 'flex-start' }}
        >
          Delete your account ›
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

        {/* Build number is native-only; web deploys aren't builds. */}
        <RecordText muted style={{ marginTop: 24, alignSelf: 'center' }}>
          Witness {Constants.expoConfig?.version ?? ''}
          {Platform.OS !== 'web' && Constants.expoConfig?.ios?.buildNumber
            ? ` (${Constants.expoConfig.ios.buildNumber})`
            : ''}
        </RecordText>
      </ScrollView>
    </ThemedView>
  );
}
