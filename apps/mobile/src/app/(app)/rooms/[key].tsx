import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  FSV_KEEPSAKE_KINDS,
  fsvCanEnter,
  fsvHouseholdPortraits,
  fsvHouseholdRecord,
  fsvKeepsakePlace,
  type FsvHouseholdRecord,
  type FsvKeepsakes,
  type FsvTimeKeepsake,
} from '@witness/core/fsv';

import FsvRoomDom, { type RoomOutcome } from '@/components/fsv-room-dom';
import { Fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useActiveTree } from '@/lib/active-tree';
import { useFsvAccess } from '@/lib/fsv-access';
import { supabase } from '@/lib/supabase';
import { getTreeIndex } from '@/lib/tree-index-cache';

/**
 * THE ROOM — a household's home on a census day, inside the app.
 *
 * Hidden, like the Field: no tab, and the only links to it are the door
 * marks on the Portrait and the Family Graph, which render only when
 * useFsvAccess says yes (lib/fsv-access.ts: the flag, the seat, the list).
 * Typed by address with access denied, this screen shows nothing but a
 * line saying the room is not open — no household, no names, no world.
 *
 * `key` is the family's id in the tree index. The household is read here,
 * on the device, from the index the app already holds, by the bridge
 * (@witness/core/fsv); the living are withheld by that read, so a living
 * household never reaches the panel at all.
 *
 * The room page itself is world/rooms/FSV_Census_Day.html, put beside the
 * world by `npm run world:sync -w @witness/fsv`.
 *
 * How the opening went is written once to fsv_room_log (the migration of
 * 19 September 2026): opened, no room, timed out, failed. The app has no
 * other report from a device, and a black panel on somebody's iPad would
 * otherwise be invisible to us. The write is fire-and-forget: the room
 * never waits on it and never fails for it.
 */
const ROOM_PATH = 'world/rooms/FSV_Census_Day.html';

// loc.gov's search can take thirty seconds; the room opens without the
// keepsakes and they are posted in when they land (docs/FSV_KEEPSAKES_SEAM.md).
const KEEPSAKE_PATIENCE_MS = 40_000;

/**
 * The household's own pictures (from the file's media, signed) and the
 * material of its time and place (fsv-keepsakes, per kind, in parallel).
 * Every part is optional: a kind that fails or runs late is left out and
 * the room hangs its placeholders instead.
 */
async function loadKeepsakes(
  treeId: string,
  record: FsvHouseholdRecord,
  dayIndex: number,
  onPart: (part: Partial<FsvKeepsakes>) => void,
): Promise<void> {
  const portraits = fsvHouseholdPortraits(supabase, treeId, record)
    .then((portrait) => onPart({ portrait }))
    .catch(() => onPart({ portrait: [] }));
  const where = fsvKeepsakePlace(record, dayIndex);
  const kinds = where
    ? FSV_KEEPSAKE_KINDS.map((kind) =>
        Promise.race([
          supabase.functions.invoke('fsv-keepsakes', { body: { kind, ...where } }),
          new Promise<{ data: null; error: Error }>((resolve) =>
            setTimeout(() => resolve({ data: null, error: new Error('late') }), KEEPSAKE_PATIENCE_MS),
          ),
        ])
          .then(({ data, error }) => {
            if (error || !data?.items) return;
            onPart({ [kind]: data.items as FsvTimeKeepsake[] });
          })
          .catch(() => {}),
      )
    : [];
  await Promise.all([portraits, ...kinds]);
}

async function logOutcome(familyKey: string, outcome: RoomOutcome, ms: number, note: string): Promise<void> {
  try {
    /* the table is new in this branch; the generated Database types learn
       it when they are regenerated (supabase gen types), and this line
       becomes supabase.from('fsv_room_log').insert(...) */
    const loose = supabase as unknown as { from: (table: string) => { insert: (row: Record<string, unknown>) => Promise<unknown> } };
    await loose.from('fsv_room_log').insert({ family_key: familyKey, outcome, ms: Math.round(ms), note: note || null });
  } catch { /* the report is not the room */ }
}

export default function RoomScreen() {
  const theme = useTheme();
  const { key, day } = useLocalSearchParams<{ key?: string; day?: string }>();
  const access = useFsvAccess();
  const { activeTree } = useActiveTree();
  const [record, setRecord] = useState<FsvHouseholdRecord | null | undefined>(undefined);
  const [keepsakes, setKeepsakes] = useState<FsvKeepsakes | null>(null);
  const dayIndex = Math.max(0, parseInt(day ?? '0', 10) || 0);

  useEffect(() => {
    if (!access.allowed || !key || !activeTree?.id) { setRecord(null); return; }
    let alive = true;
    void getTreeIndex(activeTree.id)
      .then((index) => { if (alive) setRecord(fsvHouseholdRecord(index, key)); })
      .catch(() => { if (alive) setRecord(null); });
    return () => { alive = false; };
  }, [access.allowed, key, activeTree?.id]);

  const door = fsvCanEnter(record ?? null);
  const shut = !access.allowed || !record || !door.ok;

  // The keepsakes, once there is a room to hang them in. Parts arrive as
  // they land; the DOM bridge posts each new object into the frame.
  useEffect(() => {
    if (shut || !record || !activeTree?.id) { setKeepsakes(null); return; }
    let alive = true;
    setKeepsakes(null);
    void loadKeepsakes(activeTree.id, record, dayIndex, (part) => {
      if (alive) setKeepsakes((prev) => ({ portrait: [], ...(prev ?? {}), ...part }));
    });
    return () => { alive = false; };
  }, [shut, record, activeTree?.id, dayIndex]);
  const title = record && !record.living
    ? record.members.filter(([, r]) => r === 'head' || r === 'wife').map(([pid]) => { const p = record.persons[pid]; return p ? [p.given, p.surname].filter(Boolean).join(' ') : ''; }).filter(Boolean).join(' and ')
    : 'A household';

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ title: shut ? 'Witness' : 'The room' }} />
      {shut ? (
        <View style={styles.note}>
          <Text style={[styles.noteText, { color: theme.textSecondary }]}>
            {access.why === 'checking' || (record === undefined && access.allowed)
              ? 'Opening the room…'
              : record === null && access.allowed
                ? 'This household is not in the tree you have open — rooms open from a Portrait in your own tree.'
                : 'This room is not open.'}
          </Text>
        </View>
      ) : (
        <View style={styles.world}>
          <FsvRoomDom
            path={ROOM_PATH}
            record={record}
            keepsakes={keepsakes}
            day={dayIndex}
            title={title}
            onOutcome={(outcome, ms, note) => logOutcome(key ?? '', outcome, ms, note)}
            dom={{ style: styles.world, scrollEnabled: false, bounces: false, webviewDebuggingEnabled: true }}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  world: { flex: 1 },
  note: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  noteText: { fontFamily: Fonts.mono, fontSize: 13, lineHeight: 18 },
});
