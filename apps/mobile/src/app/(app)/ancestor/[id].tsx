import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { getRelationship } from '@witness/core/family';
import {
  rankLivedThroughEvents,
  regionsFromPlaceParts,
  type LivedThroughTag,
} from '@witness/core/history';
import {
  fetchNaraCandidatesForIndividual,
  stageKeyForPerson,
  type NaraCandidate,
} from '@witness/core/query';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { LineageMark } from '@/components/lineage-mark';
import { NaraCandidateCard } from '@/components/nara-candidate-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import * as Clipboard from 'expo-clipboard';

import { showAlert } from '@/lib/alert';
import { providerPersonLink, type ProviderLink } from '@/lib/ancestry';
import { PedigreeChart } from '@/components/pedigree-chart';
import { STORY_SHARE_LABEL, shareStory } from '@/lib/share-story';
import { fetchRelativeFacts, relativesBrief, type RelativeFact } from '@witness/core/family';
import { getPersonCuriosities, type Curiosity } from '@/lib/curiosities-cache';
import { getEventLibrary } from '@/lib/event-library';
import { getFamilyStages } from '@/lib/family-stage-cache';
import { advanceTrail, dismissTrail, nextTrailPiece } from '@/lib/issue-trail';
import { createAncestorShareLink } from '@/lib/share-links';
import {
  getLineageTierMap,
  getRelationshipDetailMap,
  type LineageTier,
} from '@/lib/relationship-cache';
import { invokeError, openResearchBrief } from '@/lib/research-brief';
import { supabase } from '@/lib/supabase';
import { BrandFonts, Fonts, WideContent } from '@/constants/theme';

interface Person {
  id: string;
  tree_id: string;
  full_name: string;
  sex: 'M' | 'F' | 'U';
  birth_year: number | null;
  death_year: number | null;
  living: boolean;
  gedcom_xref: string;
  familysearch_id: string | null;
}

interface EventRow {
  event_type: string;
  date_year: number | null;
  date_raw: string | null;
  places: { id: string; raw: string; parts: string[] } | null;
}

/** A person on the family register — parent, sibling, spouse, or child. */
interface RegisterPerson {
  id: string;
  full_name: string;
  sex: 'M' | 'F' | 'U';
  birth_year: number | null;
  death_year: number | null;
  living: boolean;
}

/** One marriage this person heads: the spouse and their children together. */
interface Marriage {
  year: number | null;
  spouse: RegisterPerson | null;
  children: RegisterPerson[];
}

interface CitationRow {
  fact: string;
  page: string | null;
  text_excerpt: string | null;
  url: string | null;
  sources: { title: string | null } | null;
}

interface SourceGroup {
  title: string;
  facts: string[];
  /** Excerpts of what the records actually say, deduped. */
  excerpts: string[];
  url: string | null;
}

/**
 * External links (Ancestry, source URLs) open in a NEW tab on web: a
 * same-tab navigation unloads the SPA, so the browser's Back button
 * cold-reloads Witness onto Home and loses the user's place. A new tab
 * keeps this page alive — returning is a tab switch, not a restart.
 */
function openExternal(url: string) {
  if (Platform.OS === 'web') {
    window.open(url, '_blank', 'noopener');
  } else {
    Linking.openURL(url);
  }
}

/**
 * Citations grouped per source, reading order: the source cited for the
 * most facts first. Facts keep one mention each; excerpts dedupe (the
 * same census line often backs several facts).
 */
function groupCitations(rows: CitationRow[]): SourceGroup[] {
  const groups = new Map<string, SourceGroup>();
  for (const row of rows) {
    const title = row.sources?.title ?? 'Untitled source';
    if (!groups.has(title)) groups.set(title, { title, facts: [], excerpts: [], url: null });
    const group = groups.get(title)!;
    if (!group.facts.includes(row.fact)) group.facts.push(row.fact);
    if (row.text_excerpt && !group.excerpts.includes(row.text_excerpt)) {
      group.excerpts.push(row.text_excerpt);
    }
    if (!group.url && row.url) group.url = row.url;
  }
  return [...groups.values()].sort(
    (a, b) => b.facts.length - a.facts.length || a.title.localeCompare(b.title),
  );
}

type SectionState =
  | { name: 'none' }
  | { name: 'generating' }
  | { name: 'ready'; text: string; general?: string | null; sources?: string[] }
  | { name: 'error'; message: string };

/**
 * Historical-context cache rows are either legacy prose or the v2 JSON
 * envelope ({ v: 2, sourced, sources, general }) the two-tier generation
 * writes (spec §7). Mirrors the Edge Function's parser so a cache-read and
 * a fresh generation land in the same shape.
 */
function parseWorldContent(content: string): { text: string; general: string | null; sources: string[] } {
  try {
    const parsed = JSON.parse(content);
    if (parsed && parsed.v === 2 && typeof parsed.sourced === 'string') {
      return {
        text: parsed.sourced,
        general: typeof parsed.general === 'string' && parsed.general.trim() ? parsed.general : null,
        sources: Array.isArray(parsed.sources)
          ? parsed.sources.filter((s: unknown): s is string => typeof s === 'string')
          : [],
      };
    }
  } catch {
    // Legacy prose falls through.
  }
  return { text: content, general: null, sources: [] };
}

/** One AI-enriched text section backed by a cache row + Edge Function. */
function useEnrichment(
  individualId: string | undefined,
  enrichmentType: 'biography' | 'historical_context',
  fn: string,
  key: string,
) {
  const [state, setState] = useState<SectionState>({ name: 'none' });

  useEffect(() => {
    if (!individualId) return;
    let cancelled = false;
    setState({ name: 'none' });
    supabase
      .from('enrichment_cache')
      .select('content')
      .eq('individual_id', individualId)
      .eq('enrichment_type', enrichmentType)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        if (enrichmentType === 'historical_context') {
          setState({ name: 'ready', ...parseWorldContent(data.content) });
        } else {
          setState({ name: 'ready', text: data.content });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [individualId, enrichmentType]);

  // extraBody: the biography call carries the RELATIVES brief assembled by
  // the same query that draws the pedigree chart (spec §5.4).
  const generate = useCallback(
    async (extraBody?: Record<string, unknown>) => {
      setState({ name: 'generating' });
      const { data, error } = await supabase.functions.invoke(fn, {
        body: { individualId, ...(extraBody ?? {}) },
      });
      if (error) setState({ name: 'error', message: await invokeError(error) });
      else if (enrichmentType === 'historical_context') {
        setState({
          name: 'ready',
          text: data[key],
          general: data.general ?? null,
          sources: Array.isArray(data.sources) ? data.sources : [],
        });
      } else {
        setState({ name: 'ready', text: data[key] });
      }
    },
    [individualId, fn, key, enrichmentType],
  );

  return { state, generate };
}

function EnrichmentBody({
  buttonTitle,
  generatingLabel,
  state,
  onGenerate,
}: {
  buttonTitle: string;
  generatingLabel: string;
  state: SectionState;
  onGenerate: () => void;
}) {
  if (state.name === 'ready') return <ThemedText>{state.text}</ThemedText>;
  if (state.name === 'generating') {
    return (
      <View style={{ gap: 8, marginVertical: 8 }}>
        <ActivityIndicator />
        <ThemedText type="small">{generatingLabel}</ThemedText>
      </View>
    );
  }
  return (
    <>
      {state.name === 'error' && <ThemedText>{state.message}</ThemedText>}
      <Button title={buttonTitle} onPress={onGenerate} />
    </>
  );
}

/** The record as a lifeline: amber moments on one vertical thread. */
function Lifeline({ events }: { events: EventRow[] }) {
  const theme = useTheme();
  return (
    <View>
      {events.map((event, index) => (
        <View key={index} style={{ flexDirection: 'row' }}>
          <View style={{ width: 20, alignItems: 'center' }}>
            <View
              style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: theme.accent,
                marginTop: 7,
              }}
            />
            {index < events.length - 1 && (
              <View style={{ width: 2, flex: 1, backgroundColor: theme.border }} />
            )}
          </View>
          <View style={{ flex: 1, paddingLeft: 10, paddingBottom: index < events.length - 1 ? 20 : 0 }}>
            <ThemedText>
              {event.event_type.charAt(0).toUpperCase() + event.event_type.slice(1)}
              {event.date_raw ? ` · ${event.date_raw}` : event.date_year ? ` · ${event.date_year}` : ''}
            </ThemedText>
            {event.places?.raw && <ThemedText type="small">{event.places.raw}</ThemedText>}
          </View>
        </View>
      ))}
    </View>
  );
}

const firstName = (fullName: string) => fullName.split(' ')[0];

const identityOf = (record: RegisterPerson) =>
  `${record.full_name}|${record.birth_year}|${record.death_year}`;

/**
 * Birth order for display: by birth year (undated last). `birth_order` from
 * the import can interleave when a person is linked into two duplicate
 * parent-families, so the year is the surer key; the stable sort keeps the
 * import order for undated ties.
 */
const byBirthYear = (a: RegisterPerson, b: RegisterPerson) =>
  (a.birth_year ?? Infinity) - (b.birth_year ?? Infinity);

/**
 * Collapse duplicate records for the same person — this tree (like most
 * imported ones) carries a few, and without this a father shows twice on
 * the register. Insertion order is preserved; `preferId` wins its identity
 * slot so a person never loses their own highlighted row to a twin record.
 */
function dedupeByIdentity(list: RegisterPerson[], preferId?: string): RegisterPerson[] {
  const seen = new Map<string, RegisterPerson>();
  for (const record of list) {
    const key = identityOf(record);
    const existing = seen.get(key);
    if (!existing || (preferId && record.id === preferId)) seen.set(key, record);
  }
  return [...seen.values()];
}

export default function AncestorScreen({ personId }: { personId?: string } = {}) {
  // Normally a route screen; Tree Health embeds it as the right-hand
  // detail pane by passing personId directly.
  const params = useLocalSearchParams<{ id: string }>();
  const id = personId ?? params.id;
  const theme = useTheme();
  const [person, setPerson] = useState<Person | null>(null);
  const [missing, setMissing] = useState(false);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [parents, setParents] = useState<RegisterPerson[]>([]);
  const [siblings, setSiblings] = useState<RegisterPerson[]>([]);
  const [marriages, setMarriages] = useState<Marriage[]>([]);
  // The resolved Family Stage key for this person's household, or null while
  // unresolved / when no stage exists. The builder is pickier than the
  // register (it wants a dated marriage and a birth-dated child, and the head
  // may be the SPOUSE), so the link is offered only once the real index
  // says the door opens somewhere.
  const [stageKey, setStageKey] = useState<string | null>(null);
  const [tags, setTags] = useState<LivedThroughTag[]>([]);
  const [sources, setSources] = useState<SourceGroup[]>([]);
  const [naraCandidates, setNaraCandidates] = useState<NaraCandidate[]>([]);
  const [relationship, setRelationship] = useState<string | null>(null);
  // The compass: generation depth + branch side, from the same cached
  // relationship rows as the label (docs/cohesion-design-brief.md §orientation).
  const [compass, setCompass] = useState<string | null>(null);
  const [curiosities, setCuriosities] = useState<Curiosity[]>([]);
  const [tier, setTier] = useState<LineageTier | undefined>(undefined);
  const [providerLink, setProviderLink] = useState<ProviderLink | null>(null);
  // Story / Their World open in place — one panel at a time, the family
  // register below simply shifts down. Research left this card in the
  // 2026-07-29 redesign meaning to re-land in Tree Health; it never did,
  // and no screen could start a brief until Katie Grafer's review found
  // the hole (2026-08-15). It's back among the person's doors below.
  const [openPanel, setOpenPanel] = useState<'story' | 'world' | null>(null);
  // Family context (witness-family-context-spec.md): one RelativeFact[] per
  // story view, feeding both the pedigree chart and the AI brief. Loaded
  // lazily the first time the story panel opens; null = not yet fetched.
  const [relatives, setRelatives] = useState<RelativeFact[] | null>(null);
  const [parentStories, setParentStories] = useState<Set<string>>(new Set());
  const [shareState, setShareState] = useState<'idle' | 'busy' | 'copied'>('idle');
  // Research left the Portrait in the 2026-07-29 redesign meaning to
  // re-land in Tree Health — it never did, and for two weeks no screen
  // could start a brief (Katie Grafer's review found the hole). The
  // control is back where a person's other doors are.
  const [briefState, setBriefState] = useState<'idle' | 'busy'>('idle');
  // Re-render tick for the issue band: dismissal mutates module state this
  // screen can't see. MUST live up here with the other hooks — declared
  // below the early returns it broke the Rules of Hooks and crashed every
  // navigation into the Portrait (caught 2026-08-08, on device).
  const [, trailTick] = useState(0);

  const biography = useEnrichment(id, 'biography', 'generate-biography', 'biography');
  const worldContext = useEnrichment(id, 'historical_context', 'generate-historical-context', 'context');

  // Family context loads the first time the story panel opens — computed
  // once per story view, shared by the chart and the narrative brief. A
  // parent with a story navigates straight to it on tap, so parents'
  // story flags ride along.
  useEffect(() => {
    if (openPanel !== 'story' || relatives !== null || !id) return;
    let cancelled = false;
    (async () => {
      try {
        const facts = await fetchRelativeFacts(supabase, id);
        const parentIds = parents.map((p) => p.id);
        const { data: parentStoryRows } = parentIds.length
          ? await supabase
              .from('enrichment_cache')
              .select('individual_id')
              .eq('enrichment_type', 'biography')
              .in('individual_id', parentIds)
          : { data: [] };
        if (cancelled) return;
        setParentStories(new Set((parentStoryRows ?? []).map((r) => r.individual_id)));
        setRelatives(facts);
      } catch {
        // The chart and brief are enhancements — a failed fetch must never
        // block the story itself.
        if (!cancelled) setRelatives([]);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openPanel, relatives, id, parents]);

  // Resolve this person's household against the stage index (cached per
  // tree, shared with the Family Stage screen). Best-effort: on failure the
  // link simply stays hidden — a hidden door beats a door into the wrong
  // family.
  useEffect(() => {
    if (!person) return;
    let cancelled = false;
    getFamilyStages(person.tree_id)
      .then((index) => {
        if (!cancelled) setStageKey(stageKeyForPerson(index, person.id));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [person?.id, person?.tree_id]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setPerson(null);
    setMissing(false);
    setEvents([]);
    setParents([]);
    setSiblings([]);
    setMarriages([]);
    setStageKey(null);
    setTags([]);
    setSources([]);
    setNaraCandidates([]);
    setRelationship(null);
    setCompass(null);
    setCuriosities([]);
    setTier(undefined);
    setProviderLink(null);
    setOpenPanel(null);
    setRelatives(null);
    setParentStories(new Set());
    (async () => {
      const [{ data: personRow }, { data: eventRows }] = await Promise.all([
        supabase
          .from('individuals')
          .select('id, tree_id, full_name, sex, birth_year, death_year, living, gedcom_xref, familysearch_id')
          .eq('id', id)
          .maybeSingle(),
        supabase
          .from('individual_events')
          .select('event_type, date_year, date_raw, places(id, raw, parts)')
          .eq('individual_id', id)
          .order('date_year', { ascending: true })
          .returns<EventRow[]>(),
      ]);
      if (cancelled) return;
      setPerson(personRow);
      // RLS answers null for a record outside the signed-in tree — a stale
      // resume point after re-import or an account switch. Say so rather
      // than spinning forever.
      if (!personRow) setMissing(true);
      setEvents(eventRows ?? []);

      // The external link is dynamic per provider: Ancestry needs the
      // tree's Ancestry id + this person's xref, FamilySearch needs the
      // person's own _FSFTID. Whichever can build a working URL wins;
      // neither means no button — a reader without that platform's
      // account is never pointed at it.
      if (personRow) {
        supabase
          .from('trees')
          .select('ancestry_tree_id')
          .eq('id', personRow.tree_id)
          .single()
          .then(({ data }) => {
            if (!cancelled && data) {
              setProviderLink(
                providerPersonLink({
                  ancestryTreeId: data.ancestry_tree_id,
                  xref: personRow.gedcom_xref,
                  familySearchId: personRow.familysearch_id,
                }),
              );
            }
          });
      }

      // "Lived through" tags: the 5 events that best frame this life,
      // ranked by tier and boosted by this person's own geography — all
      // from data this screen already has, plus the cached event library.
      if (personRow) {
        const regions = regionsFromPlaceParts(eventRows ?? []);
        getEventLibrary().then((library) => {
          if (!cancelled) setTags(rankLivedThroughEvents(personRow, library, regions));
        });
      }

      // Sources: every citation naming this person, grouped per source.
      // Trees imported before the citations migration simply have none;
      // a database that predates the table errors and the section hides.
      supabase
        .from('citations')
        .select('fact, page, text_excerpt, url, sources(title)')
        .eq('individual_id', id)
        .returns<CitationRow[]>()
        .then(({ data }) => {
          if (!cancelled && data) setSources(groupCitations(data));
        });

      // National Archives candidates for this person (pending asks +
      // confirmed documents). Hidden while empty; enrichment is gradual.
      fetchNaraCandidatesForIndividual(supabase, id)
        .then((rows) => {
          if (!cancelled) setNaraCandidates(rows.filter((c) => c.status !== 'dismissed'));
        })
        .catch(() => {});

      // The family register — parents, the sibship this person sits in, and
      // this person's own marriages + children. All from the family_children
      // / families graph this person hangs on.
      const { data: childLinks } = await supabase
        .from('family_children')
        .select('family_id')
        .eq('individual_id', id);
      const parentFamilyIds = [...new Set((childLinks ?? []).map((l) => l.family_id))];

      if (parentFamilyIds.length && !cancelled) {
        // Parents: both spouses of the families this person is a child of.
        const { data: families } = await supabase
          .from('families')
          .select('husband_id, wife_id')
          .in('id', parentFamilyIds);
        const parentIds = [
          ...new Set((families ?? []).flatMap((f) => [f.husband_id, f.wife_id])),
        ].filter((pid): pid is string => Boolean(pid) && pid !== id);

        // Siblings: every child of those families in birth order — this
        // person included, shown highlighted, so their place is legible.
        const { data: sibLinks } = await supabase
          .from('family_children')
          .select('individual_id, birth_order')
          .in('family_id', parentFamilyIds)
          .order('birth_order', { ascending: true });
        const sibIdsOrdered: string[] = [];
        for (const link of sibLinks ?? []) {
          if (!sibIdsOrdered.includes(link.individual_id)) sibIdsOrdered.push(link.individual_id);
        }

        const wantIds = [...new Set([...parentIds, ...sibIdsOrdered])];
        if (wantIds.length && !cancelled) {
          const { data: rows } = await supabase
            .from('individuals')
            .select('id, full_name, sex, birth_year, death_year, living')
            .in('id', wantIds)
            .returns<RegisterPerson[]>();
          const byId = new Map((rows ?? []).map((r) => [r.id, r]));
          if (!cancelled) {
            setParents(
              dedupeByIdentity(
                parentIds.map((pid) => byId.get(pid)).filter((p): p is RegisterPerson => Boolean(p)),
              ),
            );
            setSiblings(
              dedupeByIdentity(
                sibIdsOrdered.map((sid) => byId.get(sid)).filter((p): p is RegisterPerson => Boolean(p)),
                id,
              ).sort(byBirthYear),
            );
          }
        }
      }

      // This person's own marriages: families they head, each with its
      // spouse and children. tree_id scopes RLS (per-user, not per-tree).
      if (personRow && !cancelled) {
        const { data: ownFamilies } = await supabase
          .from('families')
          .select('id, husband_id, wife_id, marriage_date_year')
          .eq('tree_id', personRow.tree_id)
          .or(`husband_id.eq.${id},wife_id.eq.${id}`)
          .order('marriage_date_year', { ascending: true });
        if ((ownFamilies ?? []).length && !cancelled) {
          const famIds = (ownFamilies ?? []).map((f) => f.id);
          const { data: kidLinks } = await supabase
            .from('family_children')
            .select('family_id, individual_id, birth_order')
            .in('family_id', famIds)
            .order('birth_order', { ascending: true });
          const spouseIds = (ownFamilies ?? [])
            .map((f) => (f.husband_id === id ? f.wife_id : f.husband_id))
            .filter((sid): sid is string => Boolean(sid));
          const kidIds = [...new Set((kidLinks ?? []).map((l) => l.individual_id))];
          const need = [...new Set([...spouseIds, ...kidIds])];
          const { data: rows } = need.length
            ? await supabase
                .from('individuals')
                .select('id, full_name, sex, birth_year, death_year, living')
                .in('id', need)
                .returns<RegisterPerson[]>()
            : { data: [] as RegisterPerson[] };
          const byId = new Map((rows ?? []).map((r) => [r.id, r]));
          const built: Marriage[] = (ownFamilies ?? [])
            .map((f) => {
              const spouseId = f.husband_id === id ? f.wife_id : f.husband_id;
              const childIdsOrdered: string[] = [];
              for (const link of kidLinks ?? []) {
                if (link.family_id === f.id && !childIdsOrdered.includes(link.individual_id)) {
                  childIdsOrdered.push(link.individual_id);
                }
              }
              return {
                year: f.marriage_date_year,
                spouse: spouseId ? byId.get(spouseId) ?? null : null,
                children: dedupeByIdentity(
                  childIdsOrdered.map((cid) => byId.get(cid)).filter((p): p is RegisterPerson => Boolean(p)),
                ).sort(byBirthYear),
              };
            })
            .filter((m) => m.spouse || m.children.length > 0);
          // Duplicate family records name the same spouse twice — fold them
          // into one marriage, merging (and re-deduping) the children.
          const bySpouse = new Map<string, Marriage>();
          let anon = 0;
          for (const m of built) {
            const key = m.spouse ? identityOf(m.spouse) : `__anon${anon++}`;
            const existing = bySpouse.get(key);
            if (!existing) {
              bySpouse.set(key, { ...m, children: [...m.children] });
            } else {
              if (existing.year == null) existing.year = m.year;
              existing.children = dedupeByIdentity([...existing.children, ...m.children]);
            }
          }
          if (!cancelled) setMarriages([...bySpouse.values()]);
        }
      }

      // Relationship to the home person: instant from the ancestor cache,
      // otherwise a live graph walk (cousins, descendants, in-laws).
      if (personRow) {
        getLineageTierMap(personRow.tree_id)
          .then((map) => {
            if (!cancelled) setTier(map.get(personRow.id));
          })
          .catch(() => {});
        getPersonCuriosities(personRow.tree_id, personRow.id)
          .then((found) => {
            if (!cancelled) setCuriosities(found);
          })
          .catch(() => {});
        const cached = (await getRelationshipDetailMap(personRow.tree_id)).get(personRow.id);
        if (cached) {
          if (!cancelled) {
            setRelationship(cached.label);
            // Altitude and quadrant, direct line only — a cousin's
            // generation_distance measures the common ancestor, which
            // reads as a lie about the cousin.
            if (cached.is_direct_ancestor && cached.generation_distance > 1) {
              const side =
                cached.line === 'paternal'
                  ? "father's side"
                  : cached.line === 'maternal'
                    ? "mother's side"
                    : cached.line === 'both'
                      ? 'both sides'
                      : null;
              setCompass(
                [`gen ${cached.generation_distance}`, side].filter(Boolean).join(' · '),
              );
            }
          }
        } else {
          const { data: tree } = await supabase
            .from('trees')
            .select('home_person_id')
            .eq('id', personRow.tree_id)
            .single();
          if (tree?.home_person_id && tree.home_person_id !== personRow.id) {
            const live = await getRelationship(supabase, personRow.tree_id, tree.home_person_id, personRow.id);
            if (!cancelled && live.confidence !== 'none') setRelationship(live.label);
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // One panel open at a time; opening Their World kicks off its lookup.
  function togglePanel(next: 'story' | 'world') {
    setOpenPanel((current) => (current === next ? null : next));
    if (next === 'world' && worldContext.state.name === 'none') worldContext.generate();
  }

  // Share a snapshot card of this ancestor: 90-day tokenized link on the
  // clipboard. Never offered for the living (the control renders inside the
  // non-living branch below).
  async function shareAncestor() {
    if (!person || shareState === 'busy') return;
    setShareState('busy');
    try {
      const lines = [
        ...events
          .slice(0, 2)
          .map(
            (e) =>
              `${e.event_type.charAt(0).toUpperCase() + e.event_type.slice(1)}${
                e.date_year ? ` ${e.date_year}` : ''
              }${e.places?.raw ? ` · ${e.places.raw}` : ''}`,
          ),
        ...(tags[0] ? [`Lived through ${tags[0].event.name}`] : []),
      ];
      const url = await createAncestorShareLink(person, lines);
      await Clipboard.setStringAsync(url);
      setShareState('copied');
    } catch (error) {
      console.warn('Share failed', error);
      setShareState('idle');
    }
  }

  if (!person) {
    return (
      <ThemedView style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 8 }}>
        {missing ? (
          <>
            <ThemedText type="subtitle">This record isn’t here anymore</ThemedText>
            <ThemedText type="small">
              It may belong to a tree that was replaced by a new upload, or to a different
              account. The tree tab has the current record.
            </ThemedText>
          </>
        ) : (
          <ActivityIndicator />
        )}
      </ThemedView>
    );
  }

  // Sex-ink, theme-aware: men in default ink, women in amber, unrecorded
  // muted — the carried rule (light-mode Letterpress values map to these).
  const sexInk = (sex: 'M' | 'F' | 'U') =>
    sex === 'F' ? theme.accent : sex === 'M' ? theme.text : theme.textSecondary;

  const spanYears = `${person.birth_year ?? '?'}–${person.living ? '' : (person.death_year ?? '?')}`;
  const birthEvent =
    events.find((e) => e.event_type === 'birth' && e.places?.raw) ??
    events.find((e) => e.event_type === 'baptism' && e.places?.raw) ??
    events.find((e) => e.places?.raw);
  const birthPlace = birthEvent?.places?.raw ?? null;
  const birthPlaceId = birthEvent?.places?.id ?? null;

  // One register row: sex-inked serif name (tappable onward) + mono years.
  // Self is highlighted and inert (you are already here); a life lost young
  // greys out and carries a floor-age (`~` = not-a-fact, per the rules).
  function RegisterRow({ record, isSelf = false }: { record: RegisterPerson; isSelf?: boolean }) {
    const years = `${record.birth_year ?? '?'}–${record.living ? '' : (record.death_year ?? '?')}`;
    const lostYoung =
      record.birth_year != null &&
      record.death_year != null &&
      record.death_year - record.birth_year < 18;
    const age = lostYoung ? record.death_year! - record.birth_year! : null;
    const nameColor = isSelf ? theme.text : lostYoung ? theme.textSecondary : sexInk(record.sex);
    const inner = (
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 12,
          paddingVertical: 4,
        }}
      >
        <Text
          style={{
            fontFamily: Fonts.serif,
            fontSize: 16,
            fontWeight: isSelf ? '700' : '400',
            color: nameColor,
            flexShrink: 1,
          }}
        >
          {record.full_name}
          {isSelf ? '' : ' ›'}
        </Text>
        <Text
          style={{
            fontFamily: Fonts.mono,
            fontSize: 11,
            color: isSelf ? theme.accent : theme.textSecondary,
          }}
        >
          {years}
          {age != null ? `  ~${age}` : ''}
        </Text>
      </View>
    );
    if (isSelf) {
      return (
        <View
          style={{
            backgroundColor: theme.backgroundSelected,
            borderRadius: 2,
            marginHorizontal: -6,
            paddingHorizontal: 6,
          }}
        >
          {inner}
        </View>
      );
    }
    return (
      <Pressable onPress={() => router.push({ pathname: '/ancestor/[id]', params: { id: record.id } })}>
        {inner}
      </Pressable>
    );
  }

  const groupLabelStyle = {
    fontFamily: Fonts.mono,
    fontSize: 10,
    letterSpacing: 1.8,
    color: theme.textSecondary,
    textTransform: 'uppercase' as const,
    marginBottom: 6,
  };
  const hasRegister = parents.length > 0 || siblings.length > 0 || marriages.length > 0;

  // "House of Josiah Howe & Mary Field · third of eight children" — the
  // running head. Position comes from the sibship (already in true birth
  // order, self included); an only child gets the house alone.
  const ORDINAL_WORDS = [
    '',
    'first',
    'second',
    'third',
    'fourth',
    'fifth',
    'sixth',
    'seventh',
    'eighth',
    'ninth',
    'tenth',
    'eleventh',
    'twelfth',
  ];
  const COUNT_WORDS = [
    '',
    'one',
    'two',
    'three',
    'four',
    'five',
    'six',
    'seven',
    'eight',
    'nine',
    'ten',
    'eleven',
    'twelve',
  ];
  let runningHead: string | null = null;
  if (parents.length > 0) {
    const house = `House of ${parents.map((p) => p.full_name).join(' & ')}`;
    const position = siblings.findIndex((s) => s.id === person.id);
    if (position >= 0 && siblings.length > 1) {
      const nth = ORDINAL_WORDS[position + 1] ?? `${position + 1}th`;
      const of = COUNT_WORDS[siblings.length] ?? String(siblings.length);
      runningHead = `${house} · ${nth} of ${of} children`;
    } else {
      runningHead = house;
    }
  }

  // The road back to the issue (audit G1): while the reader is inside this
  // week's edition, the next piece is one tap — not five backs. Read per
  // render so following the band to another Portrait advances it.
  const trailNext = nextTrailPiece();

  return (
    <ThemedView style={{ flex: 1 }}>
      {trailNext && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingHorizontal: 24,
            paddingVertical: 8,
            borderBottomWidth: 1,
            borderBottomColor: theme.border,
            backgroundColor: theme.backgroundElement,
          }}
        >
          <Pressable
            style={{ flex: 1 }}
            onPress={() => {
              advanceTrail(trailNext.piece.key);
              router.push(trailNext.piece.destination as never);
            }}
          >
            <Text
              style={{
                fontFamily: Fonts.mono,
                fontSize: 10.5,
                letterSpacing: 1.2,
                color: theme.accent,
              }}
            >
              {`NO. ${trailNext.number} · NEXT: ${trailNext.piece.label} ›`}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              dismissTrail();
              trailTick((n) => n + 1);
            }}
            hitSlop={10}
            accessibilityLabel="Dismiss the issue band"
          >
            <Text style={{ fontFamily: Fonts.mono, fontSize: 12, color: theme.textSecondary }}>
              ×
            </Text>
          </Pressable>
        </View>
      )}
      <ScrollView contentContainerStyle={{ ...WideContent, padding: 24, paddingBottom: 48, gap: 4 }}>
        {/* Identity: name headline (with the lineage mark) → mono span
            (sex · years · place) → parentage → the relationship as a
            serif-italic lede when we can place them. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <ThemedText type="title" style={{ flexShrink: 1 }}>
            {person.full_name}
          </ThemedText>
          <LineageMark tier={tier} size={16} color={theme.accent} />
        </View>
        <Text
          style={{
            fontFamily: Fonts.mono,
            fontSize: 12,
            letterSpacing: 0.3,
            color: theme.textSecondary,
            marginTop: 10,
          }}
        >
          <Text style={{ color: sexInk(person.sex) }}>
            {person.sex === 'F' ? 'woman' : person.sex === 'M' ? 'man' : 'person'}
          </Text>
          {`  ·  ${spanYears}`}
          {/* The place is a door, not a caption: everyone else who was there is
              one tap away. Without this the Portrait could only ever hand you
              another person (docs/cohesion-design-brief.md). */}
          {birthPlace ? (
            birthPlaceId ? (
              <Text
                style={{ color: theme.accent }}
                onPress={() =>
                  router.push({
                    pathname: '/place/[placeId]',
                    params: { placeId: birthPlaceId, treeId: person.tree_id },
                  })
                }
              >
                {`  ·  ${birthPlace} ›`}
              </Text>
            ) : (
              `  ·  ${birthPlace}`
            )
          ) : (
            ''
          )}
          {person.living ? '  ·  living' : ''}
          {compass ? `  ·  ${compass}` : ''}
        </Text>
        {parents.length > 0 && (
          <Text
            style={{
              fontFamily: Fonts.mono,
              fontSize: 12,
              letterSpacing: 0.3,
              color: theme.textSecondary,
              marginTop: 6,
            }}
          >
            {(person.sex === 'F' ? 'Daughter of ' : person.sex === 'M' ? 'Son of ' : 'Child of ') +
              parents.map((p) => p.full_name).join(' and ')}
          </Text>
        )}
        {relationship && (
          <Pressable
            onPress={() =>
              router.push({ pathname: '/relationship/[individualId]', params: { individualId: person.id } })
            }
          >
            <Text
              style={{
                fontFamily: BrandFonts.serif.italic,
                fontStyle: 'italic',
                fontSize: 16,
                lineHeight: 24,
                color: theme.textSecondary,
                marginTop: 12,
              }}
            >
              Your {relationship} <Text style={{ color: theme.accent }}>›</Text>
            </Text>
          </Pressable>
        )}

        {/* Controls: Story / Their World open in place; Ancestry and Share
            are the per-person ways off this page, pushed to the right. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 18 }}>
          {!person.living &&
            (['story', 'world'] as const).map((panel) => {
              const open = openPanel === panel;
              return (
                <Pressable
                  key={panel}
                  onPress={() => togglePanel(panel)}
                  style={{
                    paddingBottom: 4,
                    borderBottomWidth: 2,
                    borderBottomColor: open ? theme.accent : 'transparent',
                  }}
                >
                  <Text
                    style={{
                      fontFamily: Fonts.mono,
                      fontSize: 12,
                      letterSpacing: 0.8,
                      textTransform: 'uppercase',
                      color: open ? theme.text : theme.textSecondary,
                    }}
                  >
                    {panel === 'story' ? 'Story' : 'Their World'}{' '}
                    <Text style={{ fontSize: 9, color: open ? theme.accent : theme.textSecondary }}>▾</Text>
                  </Text>
                </Pressable>
              );
            })}
          <View style={{ flexDirection: 'row', gap: 16, marginLeft: 'auto' }}>
            {!person.living && (
              <Text
                style={{ fontFamily: Fonts.mono, fontSize: 12, color: theme.accent }}
                onPress={
                  briefState === 'busy'
                    ? undefined
                    : async () => {
                        setBriefState('busy');
                        const message = await openResearchBrief(person.id);
                        setBriefState('idle');
                        if (message) showAlert('Research brief', message);
                      }
                }
              >
                {briefState === 'busy' ? 'Research…' : 'Research ›'}
              </Text>
            )}
            {providerLink && (
              <Text
                style={{ fontFamily: Fonts.mono, fontSize: 12, color: theme.accent }}
                onPress={() => openExternal(providerLink.url)}
              >
                {providerLink.label} ›
              </Text>
            )}
            {!person.living && (
              <Text
                style={{ fontFamily: Fonts.mono, fontSize: 12, color: theme.accent }}
                onPress={shareState === 'busy' ? undefined : shareAncestor}
              >
                {shareState === 'copied' ? 'Copied ✓' : shareState === 'busy' ? 'Sharing…' : 'Share ›'}
              </Text>
            )}
          </View>
        </View>

        {/* Inline expanders: the panel opens between the controls and the
            register, which just shifts down — nothing navigates away. */}
        {!person.living && openPanel === 'story' && (
          <Panel
            theme={theme}
            label={`Story${
              sources.length ? ` · drawn from ${sources.length} source${sources.length > 1 ? 's' : ''}` : ''
            }`}
          >
            {relatives !== null && (parents.length > 0 || relatives.length > 0) && (
              <PedigreeChart
                subject={{ id: person.id, name: person.full_name }}
                parents={parents.map((p) => ({
                  id: p.id,
                  name: p.full_name,
                  relationship: p.sex === 'M' ? 'father' : p.sex === 'F' ? 'mother' : 'parent',
                  birth_year: p.birth_year,
                  death_year: p.death_year,
                  living: p.living,
                  has_story: parentStories.has(p.id),
                }))}
                relatives={relatives}
                onOpenPortrait={(pid) => router.push(`/ancestor/${pid}` as never)}
              />
            )}
            <EnrichmentBody
              buttonTitle="Tell me their story"
              generatingLabel="Writing their story from the record…"
              state={biography.state}
              onGenerate={() =>
                void biography.generate(
                  relatives?.length ? { relatives: relativesBrief(relatives) } : undefined,
                )
              }
            />
            {/* The story leaves the app on the reader's terms: iOS share
                sheet (a text file, so Save to Files is a real download);
                web downloads the .txt outright. Only once a story exists. */}
            {biography.state.name === 'ready' && (
              <ThemedText
                type="small"
                style={{ fontFamily: Fonts.mono, color: theme.accent, marginTop: 8 }}
                onPress={() => {
                  const text = biography.state.name === 'ready' ? biography.state.text : '';
                  void shareStory(person.full_name, spanYears, text).catch((error) =>
                    console.warn('Story share failed', error),
                  );
                }}
              >
                {STORY_SHARE_LABEL}
              </ThemedText>
            )}
          </Panel>
        )}
        {!person.living && openPanel === 'world' && (
          <Panel theme={theme} label={`Their World${person.birth_year ? ` · ${person.birth_year}` : ''}`}>
            {worldContext.state.name === 'ready' ? (
              <View style={{ gap: 10 }}>
                <ThemedText>{worldContext.state.text}</ThemedText>
                {(worldContext.state.sources?.length ?? 0) > 0 && (
                  <ThemedText type="small">
                    From {worldContext.state.sources!.join(' and ')}
                  </ThemedText>
                )}
                {/* The general-knowledge tier (spec §7.5): generically
                    labeled so it never reads as archive-sourced. Absent
                    entirely when the model declined. */}
                {worldContext.state.general && (
                  <View style={{ gap: 4, borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 10 }}>
                    <ThemedText type="small" style={{ fontFamily: Fonts.mono }}>
                      HISTORICAL CONTEXT
                    </ThemedText>
                    <ThemedText>{worldContext.state.general}</ThemedText>
                  </View>
                )}
              </View>
            ) : worldContext.state.name === 'error' ? (
              <>
                <ThemedText>{worldContext.state.message}</ThemedText>
                <Button title="Try again" onPress={() => void worldContext.generate()} />
              </>
            ) : (
              <View style={{ gap: 8, marginVertical: 4 }}>
                <ActivityIndicator />
                <ThemedText type="small">Searching the historical record…</ThemedText>
              </View>
            )}
          </Panel>
        )}

        {person.living && (
          <ThemedText style={{ marginTop: 16 }}>
            {firstName(person.full_name)} appears to be living, so Witness keeps their story private.
          </ThemedText>
        )}

        {/* The family register: parents, the sibship (self lit), marriages. */}
        {hasRegister && (
          <View style={{ marginTop: 18, borderTopWidth: 1, borderTopColor: theme.border }}>
            {/* Running head: person within household, position within the
                birth order — a page number, not a map (cohesion brief
                §orientation). Skipped when the register can't say it. */}
            {runningHead && (
              <Text
                style={{
                  fontFamily: Fonts.serif,
                  fontSize: 13.5,
                  fontStyle: 'italic',
                  color: theme.textSecondary,
                  marginTop: 12,
                }}
              >
                {runningHead}
              </Text>
            )}
            {parents.length > 0 && (
              <View style={{ paddingTop: 14, paddingBottom: 4 }}>
                <Text style={groupLabelStyle}>Parents</Text>
                {parents.map((parent) => (
                  <RegisterRow key={parent.id} record={parent} />
                ))}
              </View>
            )}
            {siblings.length > 0 && (
              <View
                style={{
                  paddingTop: 14,
                  paddingBottom: 4,
                  borderTopWidth: parents.length > 0 ? 1 : 0,
                  borderTopColor: theme.border,
                }}
              >
                <Text style={groupLabelStyle}>Brothers &amp; sisters</Text>
                {siblings.map((sibling) => (
                  <RegisterRow key={sibling.id} record={sibling} isSelf={sibling.id === person.id} />
                ))}
              </View>
            )}
            {marriages.map((marriage, index) => {
              const spouse = marriage.spouse;
              const label = spouse
                ? `Married ${spouse.full_name}${marriage.year ? `, ${marriage.year}` : ''}`
                : marriage.year
                  ? `Married ${marriage.year}`
                  : 'Children';
              return (
                <View
                  key={spouse?.id ?? index}
                  style={{
                    paddingTop: 14,
                    paddingBottom: 4,
                    borderTopWidth: index > 0 || parents.length > 0 || siblings.length > 0 ? 1 : 0,
                    borderTopColor: theme.border,
                  }}
                >
                  {spouse ? (
                    <Pressable
                      onPress={() => router.push({ pathname: '/ancestor/[id]', params: { id: spouse.id } })}
                    >
                      <Text style={groupLabelStyle}>{label} ›</Text>
                    </Pressable>
                  ) : (
                    <Text style={groupLabelStyle}>{label}</Text>
                  )}
                  {marriage.children.map((child) => (
                    <RegisterRow key={child.id} record={child} />
                  ))}
                </View>
              );
            })}
            {/* The register answers who; the stage answers how long, and side by
                side. One link, not one per marriage — the stage has its own
                set-switcher. Keyed on the RESOLVED stage key (the household
                head's id — possibly the spouse's), and rendered only when the
                stage index actually holds this household: the builder needs a
                dated marriage and a birth-dated child, so for thinner records
                the door used to open onto the wrong family. */}
            {stageKey !== null && (
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: '/family-stage/[key]',
                    params: { key: stageKey },
                  })
                }
                style={{ paddingTop: 14, borderTopWidth: 1, borderTopColor: theme.border }}
              >
                <ThemedText type="link">
                  See this household as a length of time ›
                </ThemedText>
              </Pressable>
            )}
          </View>
        )}

        {tags.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 18 }}>
            {tags.map((tag) => (
              <Pressable
                key={tag.event.id}
                onPress={() =>
                  router.push({
                    pathname: '/query/[eventId]',
                    params: { eventId: tag.event.id, treeId: person.tree_id, pin: person.id },
                  })
                }
                style={{
                  backgroundColor: theme.backgroundElement,
                  borderWidth: 1,
                  borderColor: theme.accent,
                  borderRadius: 14,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                }}
              >
                <ThemedText type="small" themeColor="accent" style={{ fontWeight: 600 }}>
                  {tag.event.name}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        )}

        <ThemedText type="subtitle" style={{ marginTop: 20 }}>
          The record
        </ThemedText>
        {events.length === 0 ? (
          <ThemedText type="small">No dated events recorded.</ThemedText>
        ) : (
          <Card>
            <Lifeline events={events} />
          </Card>
        )}

        {sources.length > 0 && (
          <>
            <ThemedText type="subtitle" style={{ marginTop: 16 }}>
              Sources
            </ThemedText>
            <ThemedText type="small">
              How the record knows {firstName(person.full_name)} —{' '}
              {sources.length === 1 ? 'one source' : `${sources.length} sources`}, as cited in your
              tree.
            </ThemedText>
            {sources.map((source) => (
              <Card key={source.title}>
                <ThemedText type="smallBold">{source.title}</ThemedText>
                <ThemedText type="small">cites their {source.facts.join(', ')}</ThemedText>
                {source.excerpts.slice(0, 3).map((excerpt) => (
                  <ThemedText key={excerpt} type="small" style={{ fontStyle: 'italic' }}>
                    “{excerpt}”
                  </ThemedText>
                ))}
                {source.url && (
                  <ThemedText type="link" onPress={() => openExternal(source.url!)}>
                    View the record ›
                  </ThemedText>
                )}
              </Card>
            ))}
          </>
        )}

        {/* The third door: what the audit noticed about this person. Same
            session-cached run and marks/rulings filter as the workbench, so
            a decided finding disappears here on the next visit. */}
        {curiosities.length > 0 && (
          <>
            <ThemedText type="subtitle" style={{ marginTop: 16 }}>
              From the Tree Check
            </ThemedText>
            <ThemedText type="small">
              {curiosities.length === 1
                ? `One curiosity names ${firstName(person.full_name)} — a prompt, not a problem.`
                : `${curiosities.length} curiosities name ${firstName(person.full_name)} — prompts, not problems.`}
            </ThemedText>
            {curiosities.slice(0, 3).map((curiosity) => (
              <Card key={curiosity.key} onPress={() => router.push('/tree-health')}>
                <ThemedText type="small">{curiosity.prompt}</ThemedText>
              </Card>
            ))}
            <ThemedText type="link" onPress={() => router.push('/tree-health')}>
              Open the Tree Check ›
            </ThemedText>
          </>
        )}

        {naraCandidates.length > 0 && (
          <>
            <ThemedText type="subtitle" style={{ marginTop: 16 }}>
              In the National Archives
            </ThemedText>
            <ThemedText type="small">
              Records that might be {firstName(person.full_name)} — you decide.
            </ThemedText>
            {naraCandidates.map((candidate) => (
              <NaraCandidateCard
                key={candidate.id}
                candidate={candidate}
                onResolved={(candidateId, status) =>
                  setNaraCandidates((current) =>
                    status === 'dismissed'
                      ? current.filter((c) => c.id !== candidateId)
                      : current.map((c) => (c.id === candidateId ? { ...c, status } : c)),
                  )
                }
              />
            ))}
          </>
        )}
      </ScrollView>
    </ThemedView>
  );
}

/** The inline expander card: amber-edged tint panel that opens in place. */
function Panel({
  theme,
  label,
  children,
}: {
  theme: ReturnType<typeof useTheme>;
  label: string;
  children: ReactNode;
}) {
  return (
    <View
      style={{
        backgroundColor: theme.backgroundElement,
        borderWidth: 1,
        borderColor: theme.border,
        borderLeftWidth: 2,
        borderLeftColor: theme.accent,
        borderRadius: 2,
        padding: 14,
        marginTop: 14,
        gap: 8,
      }}
    >
      <Text
        style={{
          fontFamily: Fonts.mono,
          fontSize: 10,
          letterSpacing: 1.6,
          textTransform: 'uppercase',
          color: theme.accent,
        }}
      >
        {label}
      </Text>
      {children}
    </View>
  );
}
