import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import {
  filterAndSortPeople,
  type PeopleListPerson,
  type PeopleSortKey,
  type PeopleTier,
} from '@witness/core/query';

import { Chip } from '@/components/chip';
import { TIER_WORD } from '@/components/kin-reveal';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { BrandFonts } from '@/constants/theme';
import { useKinMap } from '@/hooks/use-kin-map';
import { useTheme } from '@/hooks/use-theme';
import type { Kin } from '@/lib/relationship-cache';

/**
 * The show/hide filter every longer list of people carries (Rufus,
 * 2026-09-06): a name search, a relationship filter, and sort keys that
 * stack in the order they are chosen. Collapsed by default; a list of
 * eight or fewer never shows it. The chosen filter and order are
 * remembered per list on the device; the search is not.
 */

const TIERS: PeopleTier[] = ['direct', 'blood', 'distant', 'none'];
const SORTS: { key: PeopleSortKey; label: string }[] = [
  { key: 'name', label: 'A–Z' },
  { key: 'relationship', label: 'Relationship' },
  { key: 'birth', label: 'Birth' },
  { key: 'death', label: 'Death' },
];
export const PEOPLE_LIST_MIN_ROWS = 8;

interface Remembered {
  tiers: PeopleTier[];
  sort: PeopleSortKey[];
}

const storageKey = (listKey: string) => `witness.people-list.${listKey}`;

export interface PeopleListResult<T> {
  /** The rows to render, filtered and ordered. */
  rows: T[];
  /** The bar to mount above the list; null when the list is too short to need one. */
  bar: ReactElement | null;
  /** True while the bar is expanded — a paged list may want to fetch wide. */
  open: boolean;
  /** The relationship map, for rows that show the symbol. */
  kin: Map<string, Kin>;
  /** True when a search, filter, or order is narrowing or reordering the list. */
  active: boolean;
}

export function usePeopleList<T>({
  listKey,
  treeId,
  rows,
  person,
  minRows = PEOPLE_LIST_MIN_ROWS,
}: {
  /** Stable per screen (e.g. 'place', 'who-was-alive') — the remembered settings key. */
  listKey: string;
  treeId: string | null | undefined;
  rows: T[] | null | undefined;
  person: (row: T) => PeopleListPerson;
  minRows?: number;
}): PeopleListResult<T> {
  const theme = useTheme();
  const kin = useKinMap(treeId);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [tiers, setTiers] = useState<PeopleTier[]>([]);
  const [sort, setSort] = useState<PeopleSortKey[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(storageKey(listKey))
      .then((stored) => {
        if (cancelled || !stored) return;
        const parsed = JSON.parse(stored) as Partial<Remembered>;
        if (Array.isArray(parsed.tiers)) setTiers(parsed.tiers.filter((t) => TIERS.includes(t)));
        if (Array.isArray(parsed.sort)) setSort(parsed.sort.filter((s) => SORTS.some((o) => o.key === s)));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [listKey]);

  useEffect(() => {
    if (!loaded) return;
    const remembered: Remembered = { tiers, sort };
    AsyncStorage.setItem(storageKey(listKey), JSON.stringify(remembered)).catch(() => {});
  }, [listKey, loaded, tiers, sort]);

  const all = rows ?? [];
  const tierOf = (id: string): PeopleTier => kin.get(id)?.tier ?? 'none';
  const shown = useMemo(
    () => filterAndSortPeople(all, person, tierOf, { search, tiers, sort }),
    // `person` and `tierOf` are stable enough per render; the map identity carries the kin change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [all, kin, search, tiers, sort],
  );
  const active = search.trim().length > 0 || tiers.length > 0 || sort.length > 0;
  const tooShort = all.length <= minRows;

  const toggleTier = (tier: PeopleTier) =>
    setTiers((current) => (current.includes(tier) ? current.filter((t) => t !== tier) : [...current, tier]));
  const toggleSort = (key: PeopleSortKey) =>
    setSort((current) => (current.includes(key) ? current.filter((k) => k !== key) : [...current, key]));

  const bar: ReactElement | null = tooShort ? null : (
    <View style={{ gap: 8, marginTop: 8, marginBottom: 4 }}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={open ? 'Hide the filter' : 'Show the filter'}
        style={{ alignSelf: 'flex-start' }}
      >
        <Text style={{ fontFamily: BrandFonts.mono.regular, fontSize: 12, letterSpacing: 0.5, color: theme.accent }}>
          {open ? 'HIDE FILTER ▴' : active ? 'FILTER · ON ▾' : 'FILTER ▾'}
        </Text>
      </Pressable>
      {open && (
        <View style={{ gap: 8 }}>
          <TextField
            placeholder="Search these names"
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
            returnKeyType="search"
          />
          <ThemedText type="small" themeColor="textSecondary">
            Show
          </ThemedText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ flexGrow: 0 }}>
            <Chip label="Everyone" active={tiers.length === 0} activeColor={theme.accent} onPress={() => setTiers([])} />
            {TIERS.map((tier) => (
              <Chip
                key={tier}
                label={TIER_WORD[tier]}
                active={tiers.includes(tier)}
                activeColor={theme.accent}
                onPress={() => toggleTier(tier)}
              />
            ))}
          </ScrollView>
          <ThemedText type="small" themeColor="textSecondary">
            Order — tap in the order that matters most
          </ThemedText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ flexGrow: 0 }}>
            {SORTS.map(({ key, label }) => {
              const rank = sort.indexOf(key);
              return (
                <Chip
                  key={key}
                  label={rank >= 0 ? `${rank + 1} · ${label}` : label}
                  active={rank >= 0}
                  activeColor={theme.accent}
                  accessibilityLabel={rank >= 0 ? `${label}, sort priority ${rank + 1}` : `Sort by ${label}`}
                  onPress={() => toggleSort(key)}
                />
              );
            })}
          </ScrollView>
        </View>
      )}
      {(open || active) && (
        <ThemedText type="small" themeColor="textSecondary">
          {shown.length === all.length
            ? `${all.length.toLocaleString()} shown`
            : `${shown.length.toLocaleString()} of ${all.length.toLocaleString()} shown`}
          {sort.length > 0 ? ` · ${sort.map((k) => SORTS.find((s) => s.key === k)!.label).join(', then ')}` : ''}
        </ThemedText>
      )}
    </View>
  );

  return { rows: shown, bar, kin, active, open: open && !tooShort };
}
