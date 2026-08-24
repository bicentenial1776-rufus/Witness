import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import {
  buildFamilyStages,
  buildRegister,
  type Register,
  type RegisterEntry,
} from '@witness/core/query';

import { useBroadsheet } from '@/components/broadsheet';
import { RecordText } from '@/components/record-text';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Broadsheet, BrandFonts, Letterpress, WideContent, mono } from '@/constants/theme';
import { useLetterpress } from '@/hooks/use-theme';
import { useActiveTree } from '@/lib/active-tree';
import { setPendingStage } from '@/lib/stage-handoff';
import { getTreeIndex } from '@/lib/tree-index-cache';

const C = Broadsheet.color;

type Ordering = 'time' | 'name' | 'place';

interface Group {
  key: string;
  title: string;
  meta: string;
  entries: RegisterEntry[];
}

/**
 * The Register — the Family Stage's table of contents. Print never
 * navigates by diagram: one entry per household, ordered by time, name,
 * or place, with THREADS on top — the follow-child doors walked into
 * reading paths, the tree flattened into serials.
 */
export default function RegisterScreen() {
  const L = useLetterpress();
  useLocalSearchParams(); // route param plumbing kept for future deep links
  const broadsheet = useBroadsheet();
  const { activeTree } = useActiveTree();
  const treeId = activeTree?.id;
  const [register, setRegister] = useState<Register | null>(null);
  const [failed, setFailed] = useState(false);
  const [ordering, setOrdering] = useState<Ordering>('time');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [openThread, setOpenThread] = useState<string | null>(null);
  const [names, setNames] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!treeId) return;
    let cancelled = false;
    getTreeIndex(treeId)
      .then((index) => {
        if (cancelled) return;
        const stages = buildFamilyStages(index, { currentYear: new Date().getFullYear() });
        setRegister(buildRegister(index, stages));
        setNames(new Map([...index.individuals.values()].map((i) => [i.id, i.full_name])));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [treeId]);

  const groups = useMemo<Group[]>(() => {
    if (!register) return [];
    const { entries } = register;
    if (ordering === 'time') {
      const byCentury = new Map<number, RegisterEntry[]>();
      for (const entry of entries) {
        const century = Math.floor(entry.year / 100) * 100;
        if (!byCentury.has(century)) byCentury.set(century, []);
        byCentury.get(century)!.push(entry);
      }
      return [...byCentury.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([century, list]) => ({
          key: `c${century}`,
          title: `${century}s`,
          meta: `${list.length} ${list.length === 1 ? 'household' : 'households'}`,
          entries: list,
        }));
    }
    if (ordering === 'name') {
      const bySurname = new Map<string, RegisterEntry[]>();
      for (const entry of entries) {
        if (!bySurname.has(entry.surname)) bySurname.set(entry.surname, []);
        bySurname.get(entry.surname)!.push(entry);
      }
      return [...bySurname.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([surname, list]) => ({
          key: `s${surname}`,
          title: surname.toUpperCase(),
          meta: `${list.length} · ${list[0]!.year}–${list[list.length - 1]!.year}`,
          entries: list,
        }));
    }
    const byPlace = new Map<string, RegisterEntry[]>();
    for (const entry of entries) {
      const place = entry.place ?? 'Place not recorded';
      if (!byPlace.has(place)) byPlace.set(place, []);
      byPlace.get(place)!.push(entry);
    }
    return [...byPlace.entries()]
      .sort((a, b) =>
        a[0] === 'Place not recorded' ? 1 : b[0] === 'Place not recorded' ? -1 : b[1].length - a[1].length,
      )
      .map(([place, list]) => ({
        key: `p${place}`,
        title: place,
        meta: `${list.length} · ${list[0]!.year}–${list[list.length - 1]!.year}`,
        entries: list,
      }));
  }, [register, ordering]);

  // Broadsheet: hand the household to the Family Stage on the Tree tab.
  // Phone: open the upright stage (panel 4h) on that household.
  function openStage(key: string) {
    if (broadsheet) {
      setPendingStage(key);
      router.push('/tree' as never);
    } else {
      router.push({ pathname: '/family-stage/[key]', params: { key } } as never);
    }
  }

  const entryRow = (entry: RegisterEntry) => (
    <Pressable
      key={entry.key}
      onPress={() => openStage(entry.key)}
      style={{
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 10,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(120,110,95,0.14)',
      }}
    >
      <Text style={mono(13.5, L.deepAmber)}>{entry.year}</Text>
      <Text style={{ fontFamily: BrandFonts.serif.regular, fontSize: 15, color: L.ink, flexShrink: 1 }} numberOfLines={1}>
        {entry.headName} <Text style={{ fontFamily: BrandFonts.serif.italic }}>m.</Text> {entry.spouseLine}
      </Text>
      <Text style={mono(12.5, L.muted)} numberOfLines={1}>
        {entry.childCount} {entry.childCount === 1 ? 'child' : 'children'}
        {entry.place ? ` · ${entry.place}` : ''}
      </Text>
      <View style={{ flex: 1 }} />
      <Text style={mono(13, L.amber)}>›</Text>
    </Pressable>
  );

  return (
    <ThemedView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ ...WideContent, padding: 24, paddingBottom: 64 }}>
        <ThemedText type="title">The Register</ThemedText>
        {register ? (
          <Text style={{ ...mono(13.5, L.muted), marginTop: 4 }}>
            {register.entries.length.toLocaleString()} HOUSEHOLDS · {register.startYear}–{register.endYear}
          </Text>
        ) : failed ? (
          <ThemedText type="small">Couldn’t reach your tree just now — come back to retry.</ThemedText>
        ) : (
          <Text style={{ ...mono(13.5, L.muted), marginTop: 4 }}>OPENING THE RECORD BOOK…</Text>
        )}

        {register && register.threads.length > 0 && (
          <View style={{ marginTop: 20 }}>
            <RecordText eyebrow accent>
              Reading threads
            </RecordText>
            {register.threads.map((thread) => {
              const open = openThread === thread.surname;
              return (
                <View key={thread.surname + thread.startYear}>
                  <Pressable
                    onPress={() => setOpenThread(open ? null : thread.surname)}
                    style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingVertical: 8 }}
                  >
                    <Text style={{ fontFamily: BrandFonts.serif.semiBold, fontSize: 16, color: L.ink }}>
                      {open ? '▾' : '▸'} The {thread.surname} thread
                    </Text>
                    <Text style={mono(13, L.muted)}>
                      {thread.keys.length} HOUSEHOLDS · {thread.startYear}–{thread.endYear}
                    </Text>
                  </Pressable>
                  {open && (
                    <View style={{ paddingLeft: 18, paddingBottom: 8 }}>
                      {thread.keys.map((key, i) => {
                        const entry = register.entries.find((e) => e.key === key);
                        return entry ? (
                          <Pressable key={key} onPress={() => openStage(key)} style={{ flexDirection: 'row', gap: 8, paddingVertical: 4 }}>
                            <Text style={mono(13, L.deepAmber)}>{i + 1}.</Text>
                            <Text style={mono(13, L.deepAmber)}>{entry.year}</Text>
                            <Text style={{ fontFamily: BrandFonts.serif.regular, fontSize: 14, color: L.ink }}>
                              {entry.headName} m. {entry.spouseLine} ›
                            </Text>
                          </Pressable>
                        ) : (
                          <Text key={key} style={mono(13, L.muted)}>
                            {names.get(key) ?? key}
                          </Text>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {register && (
          <>
            <View style={{ flexDirection: 'row', gap: 18, marginTop: 24, borderBottomWidth: 2, borderBottomColor: L.ink, paddingBottom: 6 }}>
              {(
                [
                  ['time', 'BY TIME'],
                  ['name', 'BY NAME'],
                  ['place', 'BY PLACE'],
                ] as const
              ).map(([value, label]) => (
                <Pressable key={value} onPress={() => setOrdering(value)}>
                  <Text style={mono(13.5, ordering === value ? L.amber : L.muted)}>{label}</Text>
                </Pressable>
              ))}
            </View>

            {groups.map((group) => {
              const open = expanded.has(group.key);
              return (
                <View key={group.key}>
                  <Pressable
                    onPress={() =>
                      setExpanded((prev) => {
                        const next = new Set(prev);
                        if (next.has(group.key)) next.delete(group.key);
                        else next.add(group.key);
                        return next;
                      })
                    }
                    style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingTop: 14, paddingBottom: 4 }}
                  >
                    <Text style={{ fontFamily: BrandFonts.serif.semiBold, fontSize: 16, color: L.ink }}>
                      {open ? '▾' : '▸'} {group.title}
                    </Text>
                    <Text style={mono(13, L.muted)}>{group.meta.toUpperCase()}</Text>
                  </Pressable>
                  {open && <View style={{ paddingLeft: 4 }}>{group.entries.map(entryRow)}</View>}
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
    </ThemedView>
  );
}
