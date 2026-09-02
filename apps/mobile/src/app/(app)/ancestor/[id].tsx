import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ActivityIndicator, Image, Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { getRelationship } from '@witness/core/family';
import {
  rankLivedThroughEvents,
  regionsFromPlaceParts,
  shoreCrossingExplainer,
  voyageExplainer,
  type LivedThroughTag,
} from '@witness/core/history';
import {
  eventTypeLabel,
  fetchNaraCandidatesForIndividual,
  fetchPassengerCandidatesForIndividual,
  isFindAGraveUrl,
  livedNear,
  personShoreCrossings,
  stageKeyForPerson,
  type LivedNearNeighbor,
  type NaraCandidate,
  type PassengerCandidate,
} from '@witness/core/query';

import { subjectKey } from '@witness/core/corrections';
import {
  fetchActiveRegisters,
  fetchRegisterLinksForIndividual,
  type PersonRegisterLink,
  type RegisterDef,
} from '@witness/core/registers';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { MarginCorrections } from '@/components/margin-corrections';
import { TextField } from '@/components/text-field';
import { KinReveal } from '@/components/kin-reveal';
import { capturesForPerson, photoUrl, type GraveCapture } from '@/lib/grave-captures';
import { LineageMark } from '@/components/lineage-mark';
import { LineagePanel } from '@/components/lineage-panel';
import { PlaceMap } from '@/components/place-map';
import { ExplainerDot } from '@/components/explainer-dot';
import { NaraCandidateCard } from '@/components/nara-candidate-card';
import { RegisterCandidateCard } from '@/components/register-candidate-card';
import { PassengerCandidateCard } from '@/components/passenger-candidate-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';

import { showAlert } from '@/lib/alert';
import { providerPersonLink, type ProviderLink } from '@/lib/ancestry';
import {
  ancestryImmigrationSearchUrl,
  familySearchArrivalsUrl,
  familySearchRecordsUrl,
} from '@/lib/record-search';
import { type CorrectionRow } from '@/lib/corrections';
import { PedigreeChart } from '@/components/pedigree-chart';
import { STORY_SHARE_LABEL, shareStory } from '@/lib/share-story';
import { fetchRelativeFacts, relativesBrief, type RelativeFact } from '@witness/core/family';
import { portraitFromIndex } from '@witness/core/query';
import { getPersonCuriosities, type Curiosity } from '@/lib/curiosities-cache';
import { getEventLibrary } from '@/lib/event-library';
import { getFamilyStages } from '@/lib/family-stage-cache';
import { useActiveTree } from '@/lib/active-tree';
import { getTreeIndex } from '@/lib/tree-index-cache';
import { advanceTrail, dismissTrail, nextTrailPiece } from '@/lib/issue-trail';
import { VISITED_MARK, fetchVisitedSet, recordVisit } from '@/lib/visits';
import { createAncestorShareLink } from '@/lib/share-links';
import {
  getKinMap,
  getLineageTierMap,
  getRelationshipDetailMap,
  type Kin,
  type LineageTier,
} from '@/lib/relationship-cache';
import { getGeographyIndex } from '@/lib/geography-cache';
import { getPerspective, setPerspective, subscribePerspective } from '@/lib/perspective';
import {
  buildFindAGraveSearchUrl,
  extractFindAGraveUrl,
  fetchGraveConfirmation,
  saveGraveConfirmation,
  type GraveConfirmation,
} from '@/lib/grave-link';
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
  places: {
    id: string;
    raw: string;
    parts: string[];
    latitude?: number | null;
    longitude?: number | null;
  } | null;
}

/** The four tabs of the 2B Portrait, plus the Dig-deeper accordion keys. */
type TabKey = 'overview' | 'life' | 'family' | 'sources';
const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'life', label: 'Life & Times' },
  { key: 'family', label: 'Family' },
  { key: 'sources', label: 'Sources' },
];

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
    // Never fail silently — a malformed stored URL should say so.
    Linking.openURL(url).catch(() => {
      showAlert('Could not open the link', 'The stored link looks malformed — try re-checking it.');
    });
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
    // A memorial URL beats any other link the same source happens to carry.
    if (row.url && (!group.url || (isFindAGraveUrl(row.url) && !isFindAGraveUrl(group.url)))) {
      group.url = row.url;
    }
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

// The writer version this client understands, per enrichment type. Reads
// are scoped to it, so a server-side correction (a version bump in the
// edge function — e.g. v2's twin awareness, Betsey's report 2026-08-19)
// retires stale stories here too: the tell button returns and the next
// tap writes the corrected story over the old row.
const ENRICHMENT_PROMPT_VERSION = { biography: 2, historical_context: 3 } as const;

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
      .eq('prompt_version', ENRICHMENT_PROMPT_VERSION[enrichmentType])
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

/**
 * Betsey's box (her email, 2026-08-19): "just a box below to add what I
 * have documented or just heard from family lore." One editable note per
 * ancestor per user, kept with the ANCESTOR — stories are regenerable
 * derivatives and retire wholesale on a writer version bump; the note
 * survives every retelling. Deliberately never fed to the story writer
 * (decided 2026-08-20): the story is the record's voice, this is theirs.
 * Autosaves after a typing pause and on blur; empty clears the row.
 */
function AncestorNote({
  individualId,
  treeId,
  onText,
}: {
  individualId: string;
  treeId: string;
  onText: (text: string) => void;
}) {
  const theme = useTheme();
  const [text, setText] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<'idle' | 'dirty' | 'saved' | 'error'>('idle');
  const onTextRef = useRef(onText);
  onTextRef.current = onText;
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setText('');
    setLoaded(false);
    setStatus('idle');
    onTextRef.current('');
    supabase
      .from('ancestor_notes')
      .select('content')
      .eq('individual_id', individualId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        if (data?.content) {
          setText(data.content);
          onTextRef.current(data.content);
        }
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [individualId]);

  const save = useCallback(
    async (value: string) => {
      pending.current = null;
      const content = value.trim();
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return;
      const result = content
        ? await supabase.from('ancestor_notes').upsert(
            {
              individual_id: individualId,
              tree_id: treeId,
              user_id: userId,
              content,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id,individual_id' },
          )
        : await supabase
            .from('ancestor_notes')
            .delete()
            .eq('individual_id', individualId)
            .eq('user_id', userId);
      setStatus(result.error ? 'error' : 'saved');
    },
    [individualId, treeId],
  );

  // A note mid-flight when the reader navigates away still lands.
  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (pending.current !== null) void save(pending.current);
    },
    [save],
  );

  function handleChange(value: string) {
    setText(value);
    onTextRef.current(value);
    setStatus('dirty');
    pending.current = value;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void save(value), 1200);
  }

  if (!loaded) return null;
  return (
    <View style={{ gap: 6, marginTop: 14 }}>
      <Text style={{ fontFamily: Fonts.mono, fontSize: 12, letterSpacing: 1, color: theme.textSecondary }}>
        YOUR NOTE
      </Text>
      <TextField
        value={text}
        onChangeText={handleChange}
        onBlur={() => {
          if (saveTimer.current) clearTimeout(saveTimer.current);
          if (pending.current !== null) void save(pending.current);
        }}
        multiline
        style={{ minHeight: 96, textAlignVertical: 'top' }}
        placeholder="What you've documented, or family lore — kept with this ancestor, in your words."
      />
      <ThemedText type="small" themeColor="textSecondary">
        {status === 'error'
          ? "Couldn't save — check your connection and type a character to retry."
          : `Only you see this, and it never changes the story above.${status === 'saved' ? ' Saved.' : ''}`}
      </ThemedText>
    </View>
  );
}

/** The subject key an event answers to in the margin. */
function eventSubject(event: EventRow): string {
  if (event.event_type === 'birth' || event.event_type === 'death' || event.event_type === 'burial') {
    return event.event_type;
  }
  return subjectKey({ kind: 'event', eventType: event.event_type, year: event.date_year });
}

/** The record as a lifeline: amber moments on one vertical thread. */
function Lifeline({
  events,
  correctedSubjects,
}: {
  events: EventRow[];
  /** Facts with an open margin correction get the pencil beside them. */
  correctedSubjects?: Set<string>;
}) {
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
              {eventTypeLabel(event.event_type)}
              {event.date_raw ? ` · ${event.date_raw}` : event.date_year ? ` · ${event.date_year}` : ''}
              {correctedSubjects?.has(eventSubject(event)) && (
                <Text style={{ color: theme.accent }}>{'  ✎'}</Text>
              )}
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
  const params = useLocalSearchParams<{ id: string; tab?: string }>();
  const id = personId ?? params.id;
  const theme = useTheme();
  const { activeTree, trees } = useActiveTree();
  const [person, setPerson] = useState<Person | null>(null);
  const [missing, setMissing] = useState(false);
  // The page is standing on the saved field copy: identity, vitals, and the
  // register are real; everything that needs the server stays quiet
  // (SPEC_offline-field-mode.md).
  const [fromFieldCopy, setFromFieldCopy] = useState(false);
  // A companion on a family-shared tree reads the record and the stories;
  // the research desk — brief, share card, burial confirm, corrections,
  // notes, Tree Check prompts — is the owner's work surface and stays off
  // the page (design brief §6). Unknown trees default to owned: the
  // server's policies are the real guard.
  const treeOwned = person ? (trees?.find((t) => t.id === person.tree_id)?.owned ?? true) : true;
  // Network down AND no saved copy covers this person — say that, not
  // "this record isn't here anymore".
  const [unreachable, setUnreachable] = useState(false);
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
  // The user-confirmed Find a Grave memorial — testimony beside the record.
  const [graveConf, setGraveConf] = useState<GraveConfirmation | null>(null);
  const [graveFlow, setGraveFlow] = useState<'idle' | 'confirm' | 'saving'>('idle');
  const [graveDraft, setGraveDraft] = useState('');

  // Opens the user's own browser on a Find a Grave SEARCH built from the
  // record (missing fields simply omitted), then offers a paste-to-confirm
  // step — with a clipboard assist when they copied the memorial link.
  async function startGraveSearch() {
    if (!person) return;
    const placeOf = (type: string) =>
      events.find((e) => e.event_type === type && e.places?.raw)?.places?.raw;
    const location =
      (placeOf('burial') ?? placeOf('death') ?? placeOf('birth'))
        ?.split(',')
        .slice(0, 2)
        .join(',')
        .trim() ?? null;
    const url = buildFindAGraveSearchUrl({
      fullName: person.full_name,
      birthYear: person.birth_year,
      deathYear: person.death_year,
      location,
    });
    if (Platform.OS === 'web') {
      window.open(url, '_blank', 'noopener');
    } else {
      await WebBrowser.openBrowserAsync(url);
    }
    let prefill = '';
    try {
      const clip = await Clipboard.getStringAsync();
      // "Copy Link" gives a URL; "Copy record details" gives the whole
      // record with the URL inside — extract either way.
      if (clip) prefill = extractFindAGraveUrl(clip) ?? '';
    } catch {
      // Clipboard permission denied — manual paste still works.
    }
    setGraveDraft(prefill);
    setGraveFlow('confirm');
  }

  async function saveGrave() {
    if (!person) return;
    const url = extractFindAGraveUrl(graveDraft);
    if (!url) return;
    setGraveFlow('saving');
    try {
      const conf = await saveGraveConfirmation(person.id, person.tree_id, url);
      setGraveConf(conf);
      setGraveFlow('idle');
    } catch (error) {
      setGraveFlow('confirm');
      showAlert('Could not save', error instanceof Error ? error.message : 'Please try again.');
    }
  }
  const [naraCandidates, setNaraCandidates] = useState<NaraCandidate[]>([]);
  const [passengerCandidates, setPassengerCandidates] = useState<PassengerCandidate[]>([]);
  const [registerCatalog, setRegisterCatalog] = useState<Map<string, RegisterDef>>(new Map());
  const [registerLinks, setRegisterLinks] = useState<PersonRegisterLink[]>([]);
  const [relationship, setRelationship] = useState<string | null>(null);
  // A live walk that found no path: the Portrait states "No relation"
  // outright, where a list row would just stay blank.
  const [unrelated, setUnrelated] = useState(false);
  // The compass: generation depth + branch side, from the same cached
  // relationship rows as the label (docs/cohesion-design-brief.md §orientation).
  const [compass, setCompass] = useState<string | null>(null);
  const [curiosities, setCuriosities] = useState<Curiosity[]>([]);
  // The reader's own note (Betsey's box) — lifted here so the story
  // export can carry it, labeled, alongside the AI prose.
  const [ancestorNote, setAncestorNote] = useState('');
  // Open margin corrections, lifted so the ✎ glyphs can mark the facts
  // they annotate (the full text lives in the In-the-margin section).
  const [openCorrections, setOpenCorrections] = useState<CorrectionRow[]>([]);
  // The read-marks for the family register: which relatives the reader
  // has already been to (Betsey's star, 2026-08-19).
  const [visitedIds, setVisitedIds] = useState<Set<string>>(new Set());
  const [tier, setTier] = useState<LineageTier | undefined>(undefined);
  // Attached headstone captures — the stone block under the identity.
  const [stones, setStones] = useState<{ capture: GraveCapture; thumb: string | null }[]>([]);
  const [providerLink, setProviderLink] = useState<ProviderLink | null>(null);
  // The 2B layout (2026-08-27): four tabs under the identity header. All
  // four stay mounted (display-toggled) so a half-typed note, a generated
  // story, or the corrections fetch survives a tab switch — and the ✎
  // pencils in the header work before Sources is ever visited.
  // A deep link may name its landing tab (Home's "From the records"
  // piece opens Sources directly — the trail must not go cold one tap
  // short of the card).
  const [activeTab, setActiveTab] = useState<TabKey>(
    params.tab === 'sources' || params.tab === 'life' || params.tab === 'family'
      ? (params.tab as TabKey)
      : 'overview',
  );
  // (The story/world accordion is gone — 2026-08-29, Rufus: the two AI
  // pieces read as one output, so they render stacked under one "Their
  // story" header and both write themselves on tab entry.)
  // Which "Alive during…" rows are expanded to their blurbs.
  const [openEventIds, setOpenEventIds] = useState<Set<string>>(new Set());
  // The inline direct-line panel (caret beside the relationship lede).
  const [lineageOpen, setLineageOpen] = useState(false);
  // The birthplace map panel (caret beside the place in the vitals span).
  const [mapOpen, setMapOpen] = useState(false);
  // "Lived near": contemporaries within 25 miles, computed lazily from the
  // cached geography index the first time the world panel shows. null =
  // not asked yet; 'loading' while the (possibly slow, once-per-session)
  // index fetch runs.
  const [neighbors, setNeighbors] = useState<LivedNearNeighbor[] | 'loading' | null>(null);
  const [neighborKin, setNeighborKin] = useState<Map<string, Kin>>(new Map());
  // The perspective lens: session-only re-anchoring of relationship
  // framing on another ancestor (src/lib/perspective.ts). The lensed
  // label is a live walk — the cache only knows the home person.
  const perspective = useSyncExternalStore(subscribePerspective, getPerspective, getPerspective);
  const [lensRelationship, setLensRelationship] = useState<
    { label: string; tier: LineageTier } | 'none' | null
  >(null);
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

  // Family context loads the first time Life & Times or the Family tab
  // opens — computed once per view, shared by the chart (Family tab) and
  // the narrative brief (story, which now writes itself on tab entry). A
  // parent with a story navigates straight to it on tap, so parents'
  // story flags ride along.
  const wantsRelatives = activeTab === 'family' || activeTab === 'life';
  useEffect(() => {
    if (!wantsRelatives || relatives !== null || !id) return;
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
              .eq('prompt_version', ENRICHMENT_PROMPT_VERSION.biography)
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
  }, [wantsRelatives, relatives, id, parents]);

  // Resolve this person's household against the stage index (cached per
  // tree, shared with the Family Stage screen). Best-effort: on failure the
  // link simply stays hidden — a hidden door beats a door into the wrong
  // family.
  // Being here is the visit — recorded once per arrival, fire-and-forget
  // (Betsey's star, 2026-08-19).
  useEffect(() => {
    if (person?.id && person.tree_id) recordVisit(person.id, person.tree_id);
  }, [person?.id, person?.tree_id]);

  // Which register rows earn the star. Self is excluded — you are not a
  // place you visit.
  useEffect(() => {
    const ids = [
      ...parents.map((p) => p.id),
      ...siblings.map((p) => p.id),
      ...marriages.flatMap((m) => m.children.map((c) => c.id)),
    ].filter((rid) => rid !== person?.id);
    if (!ids.length) {
      setVisitedIds(new Set());
      return;
    }
    let cancelled = false;
    void fetchVisitedSet([...new Set(ids)]).then((set) => {
      if (!cancelled) setVisitedIds(set);
    });
    return () => {
      cancelled = true;
    };
  }, [parents, siblings, marriages, person?.id]);

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
    setFromFieldCopy(false);
    setUnreachable(false);
    setEvents([]);
    setParents([]);
    setSiblings([]);
    setMarriages([]);
    setStageKey(null);
    setTags([]);
    setSources([]);
    setNaraCandidates([]);
    setRelationship(null);
    setUnrelated(false);
    setCompass(null);
    setCuriosities([]);
    setTier(undefined);
    setStones([]);
    setProviderLink(null);
    setActiveTab('overview');
    setOpenEventIds(new Set());
    setLineageOpen(false);
    setMapOpen(false);
    setNeighbors(null);
    neighborsRequestedFor.current = null;
    setLensRelationship(null);
    setRelatives(null);
    setParentStories(new Set());
    setOpenCorrections([]);
    (async () => {
      const [{ data: personRow, error: personError }, { data: eventRows }] = await Promise.all([
        supabase
          .from('individuals')
          .select('id, tree_id, full_name, sex, birth_year, death_year, living, gedcom_xref, familysearch_id')
          .eq('id', id)
          .maybeSingle(),
        supabase
          .from('individual_events')
          .select('event_type, date_year, date_raw, places(id, raw, parts, latitude, longitude)')
          .eq('individual_id', id)
          .order('date_year', { ascending: true })
          .returns<EventRow[]>(),
      ]);
      if (cancelled) return;
      if (!personRow && personError) {
        // The server is unreachable, not the record missing — the saved
        // field copy renders identity, vitals, and the register; the
        // live-only sections stay quiet (SPEC_offline-field-mode.md).
        const treeId = activeTree?.id;
        if (treeId) {
          try {
            const index = await getTreeIndex(treeId);
            const portrait = portraitFromIndex(index, id);
            if (cancelled) return;
            if (portrait) {
              setFromFieldCopy(true);
              setPerson({ ...portrait.person, tree_id: treeId, gedcom_xref: '', familysearch_id: null });
              setEvents(
                portrait.events.map((e) => ({
                  event_type: e.event_type,
                  date_year: e.date_year,
                  date_raw: null,
                  places: e.place,
                })),
              );
              setParents(dedupeByIdentity(portrait.parents));
              setSiblings(dedupeByIdentity(portrait.siblings, id));
              setMarriages(portrait.marriages);
              return;
            }
          } catch {
            // No copy either — fall through to the honest message.
          }
        }
        if (!cancelled) setUnreachable(true);
        return;
      }
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

      // The user's own confirmed memorial, if they've verified one.
      setGraveConf(null);
      setGraveFlow('idle');
      fetchGraveConfirmation(id).then((conf) => {
        if (!cancelled && conf) setGraveConf(conf);
      });

      // National Archives candidates for this person (pending asks +
      // confirmed documents). Hidden while empty; enrichment is gradual.
      fetchNaraCandidatesForIndividual(supabase, id)
        .then((rows) => {
          if (!cancelled) setNaraCandidates(rows.filter((c) => c.status !== 'dismissed'));
        })
        .catch(() => {});

      // Ship-passenger candidates for this person — the Crossing card.
      fetchPassengerCandidatesForIndividual(supabase, id)
        .then((rows) => {
          if (!cancelled) setPassengerCandidates(rows.filter((c) => c.status !== 'dismissed'));
        })
        .catch(() => {});

      // Historical-record register links — the generic record cards.
      // One catalog fetch rides along; both fail quietly to an empty
      // section, like every candidate fetch here.
      Promise.all([
        fetchActiveRegisters(supabase),
        fetchRegisterLinksForIndividual(supabase, id),
      ])
        .then(([catalog, links]) => {
          if (cancelled) return;
          setRegisterCatalog(catalog);
          setRegisterLinks(links.filter((l) => l.status !== 'rejected'));
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
        capturesForPerson(personRow.id)
          .then(async (caps) => {
            const withThumbs = await Promise.all(
              caps.map(async (c) => ({
                capture: c,
                thumb: c.photo_paths[0] ? await photoUrl(c.photo_paths[0]) : null,
              })),
            );
            if (!cancelled) setStones(withThumbs);
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
            if (!cancelled) {
              if (live.confidence !== 'none' && live.tier !== 'none') {
                setRelationship(live.label);
                setTier(live.tier);
              } else {
                setUnrelated(true);
              }
            }
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, activeTree?.id]);

  // Their World generates itself the moment Life & Times opens —
  // cache-first, so a person with a stored context never re-invokes the
  // writer.
  useEffect(() => {
    if (activeTab !== 'life') return;
    if (!person || person.living || fromFieldCopy) return;
    if (worldContext.state.name === 'none') void worldContext.generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, person?.id, person?.living, fromFieldCopy, worldContext.state.name]);

  // Their Story writes itself the moment Life & Times opens (2026-08-28,
  // Rufus: no button) — but only after the relatives fetch settles, so
  // the RELATIVES brief still rides along like it did on the button path.
  useEffect(() => {
    if (activeTab !== 'life') return;
    if (!person || person.living || fromFieldCopy) return;
    if (relatives === null) return;
    if (biography.state.name === 'none') {
      void biography.generate(
        relatives.length ? { relatives: relativesBrief(relatives) } : undefined,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, person?.id, person?.living, fromFieldCopy, relatives, biography.state.name]);

  // The lensed relationship: a live walk from the perspective person.
  // Only runs while a lens is set and we're not standing on the lens
  // person themselves.
  useEffect(() => {
    setLensRelationship(null);
    if (!person || !perspective || perspective.id === person.id) return;
    let cancelled = false;
    getRelationship(supabase, person.tree_id, perspective.id, person.id)
      .then((live) => {
        if (cancelled) return;
        if (live.confidence !== 'none' && live.tier !== 'none') {
          setLensRelationship({ label: live.label, tier: live.tier });
        } else {
          setLensRelationship('none');
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perspective?.id, person?.id, person?.tree_id]);

  // "Lived near" computes the first time the world panel shows: the
  // cached geography index (slow once per session on a big tree, instant
  // after) plus the kin map for relation labels. Ref-guarded to run once
  // per person — a dependency-triggered re-run would cancel the fetch it
  // started and strand the spinner (caught by the 2026-08-27 Playwright
  // walk). Immediate-family exclusion happens at RENDER time, where the
  // register state is always current, so the two fetches never race.
  const neighborsRequestedFor = useRef<string | null>(null);
  useEffect(() => {
    if (activeTab !== 'life' || !person) return;
    const pid = person.id;
    if (neighborsRequestedFor.current === pid) return;
    neighborsRequestedFor.current = pid;
    setNeighbors('loading');
    (async () => {
      try {
        const [index, kin] = await Promise.all([
          getGeographyIndex(person.tree_id),
          getKinMap(person.tree_id).catch(() => new Map<string, Kin>()),
        ]);
        if (neighborsRequestedFor.current !== pid) return;
        setNeighborKin(kin);
        // A generous cap; the render filters out the household and trims to 8.
        setNeighbors(livedNear(index, pid, { radiusMiles: 25, cap: 24 }));
      } catch {
        if (neighborsRequestedFor.current === pid) setNeighbors([]);
      }
    })();
  }, [activeTab, person]);

  // Share a snapshot card of this ancestor: 90-day tokenized link on the
  // clipboard. Never offered for the living (the control renders inside the
  // non-living branch below).
  async function shareAncestor() {
    if (!person || shareState === 'busy') return;
    setShareState('busy');
    try {
      const lines = [
        // The earned ship leads — share-links caps at four lines, and the
        // badge is the line cousins ask about.
        ...(shipBadge ? [`⛵ Sailed on the ${shipBadge.ship}, ${shipBadge.arrivalYear}`] : []),
        ...events
          .slice(0, 2)
          .map(
            (e) =>
              `${eventTypeLabel(e.event_type)}${
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
        ) : unreachable ? (
          <>
            <ThemedText type="subtitle">Couldn’t reach this record</ThemedText>
            <ThemedText type="small">
              There’s no connection right now, and no saved copy covers this person. Nothing
              has been lost — come back within signal, or open the tree once online to save a
              copy for the field.
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
  const birthCoords =
    birthEvent?.places?.latitude != null && birthEvent?.places?.longitude != null
      ? { latitude: birthEvent.places.latitude, longitude: birthEvent.places.longitude }
      : null;

  // The perspective lens, resolved for display: while active (and not
  // standing on the lens person), the label and tier come from the live
  // walk; the home-person cache stays untouched underneath.
  const lensActive = perspective !== null && perspective.id !== person.id;
  const shownRelationship = lensActive
    ? lensRelationship && lensRelationship !== 'none'
      ? lensRelationship.label
      : null
    : relationship;
  const shownTier = lensActive
    ? lensRelationship && lensRelationship !== 'none'
      ? lensRelationship.tier
      : undefined
    : tier;
  const shownUnrelated = lensActive ? lensRelationship === 'none' : unrelated;

  // The crossing flag: derived from this person's own dated events — the
  // first badge Witness wears, earned by a documented change of shore.
  const crossingFlag =
    personShoreCrossings(
      events.map((e) => ({ year: e.date_year, parts: e.places?.parts ?? null })),
    )[0] ?? null;

  // The unlocked door for post-1820 crossings: the federal arrival lists
  // (Castle Garden, Ellis Island) are public but live behind search boxes
  // nobody can bulk-hold — so hand the reader a search already filled in.
  const arrivalsSearch =
    crossingFlag && crossingFlag.direction === 'toAmericas'
      ? familySearchArrivalsUrl(
          { fullName: person.full_name, birthYear: person.birth_year },
          crossingFlag.year,
        )
      : null;

  // The ship badge: PROJECT_BRIEF.md calls this out as the first emoji in
  // Witness — earned only once a Crossing card candidate is confirmed, not
  // decorative. Derived from state already on hand, no extra query.
  const shipBadge = passengerCandidates.find((c) => c.status === 'confirmed') ?? null;

  // "Lived near" minus the household: the register already names immediate
  // family, so the neighbor list is for everyone BEYOND it. Filtered here
  // at render time — the register may land after the neighbor fetch.
  const householdIds = new Set<string>([
    person.id,
    ...parents.map((p) => p.id),
    ...siblings.map((s) => s.id),
    ...marriages.flatMap((m) => [
      ...(m.spouse ? [m.spouse.id] : []),
      ...m.children.map((c) => c.id),
    ]),
  ]);
  const shownNeighbors = Array.isArray(neighbors)
    ? neighbors.filter((n) => !householdIds.has(n.individual.id)).slice(0, 8)
    : null;

  // One register row: sex-inked serif name (tappable onward) + mono years.
  // Self is highlighted and inert (you are already here); a life lost young
  // greys out and carries a floor-age (`~` = not-a-fact, per the rules).
  function RegisterRow({
    record,
    isSelf = false,
    visited = false,
  }: {
    record: RegisterPerson;
    isSelf?: boolean;
    visited?: boolean;
  }) {
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
            fontSize: 13,
            color: isSelf ? theme.accent : theme.textSecondary,
          }}
        >
          {years}
          {age != null ? `  ~${age}` : ''}
          {visited && !isSelf ? `  ${VISITED_MARK}` : ''}
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

  // Section titles carry the register's structure — full ink and semibold,
  // not a whisper (Rufus, 2026-08-23: the muted brown vanished in daylight).
  const groupLabelStyle = {
    fontFamily: Fonts.mono,
    fontSize: 13,
    fontWeight: '600' as const,
    letterSpacing: 1.8,
    color: theme.text,
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

  // The Overview teaser: a deterministic sentence or two from facts the
  // screen already holds — instant, and no writer involved, so it needs no
  // AI disclosure. The full story stays behind its button on Life & Times.
  const pronoun = person.sex === 'F' ? 'She' : person.sex === 'M' ? 'He' : 'They';
  const possessive = person.sex === 'F' ? 'her' : person.sex === 'M' ? 'his' : 'their';
  const siblingCount = siblings.filter((s) => s.id !== person.id).length;
  const childCount = marriages.reduce((n, m) => n + m.children.length, 0);
  const teaserPosition = siblings.findIndex((s) => s.id === person.id);
  const orderPhrase =
    teaserPosition >= 0 && siblings.length > 1
      ? `the ${ORDINAL_WORDS[teaserPosition + 1] ?? `${teaserPosition + 1}th`} of ${
          COUNT_WORDS[siblings.length] ?? String(siblings.length)
        } children`
      : null;
  const bornLead = birthPlace
    ? `Born in ${birthPlace}`
    : person.birth_year
      ? `Born in ${person.birth_year}`
      : null;
  const childWord = person.sex === 'F' ? 'daughter' : person.sex === 'M' ? 'son' : 'child';
  const birthSentence = bornLead
    ? parents.length
      ? `${bornLead}, ${orderPhrase ?? childWord} of ${parents.map((p) => p.full_name).join(' and ')}.`
      : `${bornLead}.`
    : null;
  const firstSpouseMarriage = marriages.find((m) => m.spouse) ?? null;
  const marriageSentence = firstSpouseMarriage?.spouse
    ? `${pronoun} married ${firstSpouseMarriage.spouse.full_name}${
        firstSpouseMarriage.year ? ` in ${firstSpouseMarriage.year}` : ''
      }.`
    : null;
  const teaser = [birthSentence, marriageSentence].filter(Boolean).join(' ') || null;

  // The blurb under an expanded "Alive during…" row: the ancestor's own
  // age anchors the event, then the library's one-sentence summary. An
  // assumed lifespan says so — "curiosities not verdicts".
  const first = firstName(person.full_name);
  const eventBlurb = (tag: LivedThroughTag): string => {
    const lead = tag.bornDuring
      ? `${first} was born during this.`
      : tag.ageAtStart === 0
        ? `${first} was born the year it began.`
        : tag.ageAtStart !== null
          ? `${first} was about ${tag.ageAtStart} when it began.`
          : null;
    // 'probable' = the overlap leans on an assumed lifespan for a missing
    // year (aliveDuring.ts) — say so rather than let it read as documented.
    const caveat =
      tag.confidence === 'probable'
        ? ' (Assuming a typical lifespan — one end of this life is undocumented.)'
        : '';
    return `${[lead, tag.event.summary].filter(Boolean).join(' ')}${caveat}`;
  };

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
                fontSize: 13,
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <ThemedText type="title" style={{ flexShrink: 1 }}>
            {person.full_name}
          </ThemedText>
          <LineageMark tier={tier} size={16} color={theme.accent} />
          {/* The perspective lens: re-anchor every relationship label on
              this ancestor for the session. A second tap (or the band's
              reset) puts the tree back in the reader's own hands. */}
          <Pressable
            onPress={() =>
              perspective?.id === person.id
                ? setPerspective(null)
                : setPerspective({ id: person.id, name: person.full_name })
            }
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={
              perspective?.id === person.id
                ? 'Stop seeing the tree from their perspective'
                : 'See the tree from their perspective'
            }
          >
            <Text
              style={{
                fontFamily: Fonts.mono,
                fontSize: 15,
                color: perspective?.id === person.id ? theme.accent : theme.textSecondary,
              }}
            >
              ⇅
            </Text>
          </Pressable>
          {crossingFlag && (
            <Pressable
              onPress={() =>
                router.push({ pathname: '/crossings', params: { treeId: person.tree_id } })
              }
              accessibilityRole="button"
              accessibilityLabel="A documented ocean crossing — see every crossing in the tree"
              style={{
                borderWidth: 1,
                borderColor: theme.accent,
                borderRadius: 12,
                paddingHorizontal: 8,
                paddingVertical: 2,
              }}
            >
              <Text style={{ fontFamily: Fonts.mono, fontSize: 12, color: theme.accent }}>
                {crossingFlag.ocean === 'atlantic' ? 'Atlantic' : 'Pacific'} crossing
              </Text>
            </Pressable>
          )}
          {(() => {
            const pendingRecords =
              passengerCandidates.filter((c) => c.status === 'pending').length +
              registerLinks.filter((l) => l.status === 'candidate').length;
            if (pendingRecords === 0) return null;
            return (
              <Pressable
                onPress={() => setActiveTab('sources')}
                accessibilityRole="button"
                accessibilityLabel={`${pendingRecords} historical record${pendingRecords === 1 ? '' : 's'} may name this person — open Sources to judge them`}
                style={{
                  borderWidth: 1,
                  borderColor: theme.accent,
                  borderRadius: 12,
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                  backgroundColor: theme.backgroundElement,
                }}
              >
                <Text style={{ fontFamily: Fonts.mono, fontSize: 12, color: theme.accent }}>
                  {pendingRecords} record{pendingRecords === 1 ? '' : 's'} to check
                </Text>
              </Pressable>
            );
          })()}
          {crossingFlag && (
            <ExplainerDot
              title={`${crossingFlag.ocean === 'atlantic' ? 'Atlantic' : 'Pacific'} crossing`}
              text={shoreCrossingExplainer(crossingFlag.ocean)}
            />
          )}
          {shipBadge && (
            <>
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: '/voyage/[voyageId]',
                    params: { voyageId: shipBadge.voyageId, treeId: person.tree_id },
                  })
                }
                accessibilityRole="button"
                accessibilityLabel={`Sailed on the ${shipBadge.ship}, ${shipBadge.arrivalYear} — see everyone of yours aboard`}
                style={{
                  borderWidth: 1,
                  borderColor: theme.accent,
                  borderRadius: 12,
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                }}
              >
                <Text style={{ fontFamily: Fonts.mono, fontSize: 12, color: theme.accent }}>
                  ⛵ {shipBadge.ship}, {shipBadge.arrivalYear}
                </Text>
              </Pressable>
              <ExplainerDot
                title={`The ${shipBadge.ship}, ${shipBadge.arrivalYear}`}
                text={voyageExplainer({
                  voyageId: shipBadge.voyageId,
                  ship: shipBadge.ship,
                  arrivalYear: shipBadge.arrivalYear,
                  departurePort: shipBadge.departurePort,
                  arrivalPlace: shipBadge.arrivalPlace,
                  source: shipBadge.source,
                })}
              />
            </>
          )}
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
          {/* The map caret: a glance at where that is, in place. Only
              offered once the geocoder has actually placed the town. */}
          {birthCoords && (
            <Text
              style={{ color: theme.accent }}
              onPress={() => setMapOpen((open) => !open)}
              accessibilityRole="button"
              accessibilityLabel={mapOpen ? 'Hide the map' : 'Show on a map'}
            >
              {mapOpen ? '  ▴' : '  ▾'}
            </Text>
          )}
          {person.living ? '  ·  living' : ''}
          {/* The compass reads against the home person — under a lens it
              would lie, so it steps aside until the lens comes off. */}
          {!lensActive && compass ? `  ·  ${compass}` : ''}
          {/* The pencil: an open margin correction names a vital fact. */}
          {openCorrections.some((c) => c.subject === 'name' || c.subject === 'birth' || c.subject === 'death') && (
            <Text style={{ color: theme.accent }}>{'  ·  ✎'}</Text>
          )}
        </Text>
        {mapOpen && birthCoords && birthPlace && (
          <PlaceMap
            latitude={birthCoords.latitude}
            longitude={birthCoords.longitude}
            label={birthPlace}
          />
        )}
        {arrivalsSearch && (
          <ThemedText type="small" style={{ marginTop: 6 }}>
            The arrival lists for that era survive —{' '}
            <ThemedText
              type="small"
              themeColor="accent"
              onPress={() => openExternal(arrivalsSearch.url)}
              accessibilityRole="button"
              accessibilityLabel={`Search ${arrivalsSearch.collectionLabel} on FamilySearch`}
            >
              search {arrivalsSearch.collectionLabel} for {firstName(person.full_name)} ›
            </ThemedText>
          </ThemedText>
        )}
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
        {perspective && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              marginTop: 12,
              borderWidth: 1,
              borderColor: theme.accent,
              borderRadius: 2,
              paddingHorizontal: 10,
              paddingVertical: 6,
              backgroundColor: theme.backgroundElement,
            }}
          >
            <Text
              style={{
                fontFamily: Fonts.mono,
                fontSize: 12,
                letterSpacing: 1,
                color: theme.accent,
                flex: 1,
              }}
            >
              {perspective.id === person.id
                ? 'THE TREE IS SEEN FROM HERE'
                : `SEEN FROM ${perspective.name.toUpperCase()}`}
            </Text>
            <Pressable
              onPress={() => setPerspective(null)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Reset the perspective to you"
            >
              <Text style={{ fontFamily: Fonts.mono, fontSize: 12, color: theme.textSecondary }}>
                RESET ✕
              </Text>
            </Pressable>
          </View>
        )}
        {shownRelationship ? (
          <KinReveal
            tier={shownTier ?? 'blood'}
            label={shownRelationship}
            type="default"
            style={{
              fontFamily: BrandFonts.serif.italic,
              fontStyle: 'italic',
              fontSize: 16,
              lineHeight: 24,
              color: theme.textSecondary,
              marginTop: 12,
            }}
            trailing={
              <Text style={{ color: theme.accent }} onPress={() => setLineageOpen((open) => !open)}>
                {lineageOpen ? '  Hide the line ▴' : '  See the line ▾'}
              </Text>
            }
          />
        ) : shownUnrelated ? (
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
            {lensActive && perspective
              ? `No relation to ${firstName(perspective.name)} in your tree`
              : 'No relation — in your tree, not in your family'}
          </Text>
        ) : null}
        {lineageOpen && shownRelationship && (
          <LineagePanel
            individualId={person.id}
            treeId={person.tree_id}
            fromPersonId={lensActive && perspective ? perspective.id : undefined}
            fromName={lensActive && perspective ? perspective.name : undefined}
          />
        )}
        {stones.length > 0 && (
          <Pressable
            onPress={() => router.push('/stones')}
            accessibilityRole="button"
            accessibilityLabel="Their headstone, read at the stone"
            style={{ flexDirection: 'row', gap: 10, marginTop: 14, alignItems: 'center' }}
          >
            {stones[0].thumb && (
              <Image
                source={{ uri: stones[0].thumb }}
                style={{ width: 48, height: 64, borderWidth: 1, borderColor: theme.border }}
                resizeMode="cover"
              />
            )}
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: Fonts.mono, fontSize: 12, letterSpacing: 0.5, color: theme.accent }}>
                READ AT THE STONE ›
              </Text>
              {stones[0].capture.cemetery && (
                <Text style={{ fontFamily: Fonts.mono, fontSize: 11, color: theme.textSecondary, marginTop: 2 }}>
                  {stones[0].capture.cemetery.toUpperCase()}
                </Text>
              )}
            </View>
          </Pressable>
        )}

        {/* On the saved copy every control in this row needs the server —
            one quiet line stands in for all of them. */}
        {fromFieldCopy && (
          <ThemedText type="small" style={{ marginTop: 18 }}>
            From your saved copy — stories, sources, and notes need a connection.
          </ThemedText>
        )}

        {person.living && (
          <ThemedText style={{ marginTop: 16 }}>
            {firstName(person.full_name)} appears to be living, so Witness keeps their story private.
          </ThemedText>
        )}

        {/* The four doors of the 2B Portrait. All four views stay mounted
            (display-toggled), so a half-typed note, a generated story, and
            the corrections fetch survive tab switches — and the ✎ pencils
            in the header work before Sources is ever visited. */}
        <View
          accessibilityRole="tablist"
          style={{
            flexDirection: 'row',
            gap: 18,
            borderBottomWidth: 1,
            borderBottomColor: theme.border,
            marginTop: 20,
          }}
        >
          {TABS.map((tab) => {
            const active = activeTab === tab.key;
            return (
              <Pressable
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                style={{
                  paddingBottom: 8,
                  marginBottom: -1,
                  borderBottomWidth: 2,
                  borderBottomColor: active ? theme.accent : 'transparent',
                }}
              >
                <Text
                  style={{
                    fontFamily: Fonts.mono,
                    fontSize: 12,
                    letterSpacing: 0.8,
                    textTransform: 'uppercase',
                    fontWeight: active ? '600' : '400',
                    color: active ? theme.text : theme.textSecondary,
                  }}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* ————— Overview: the rich teaser (2B) ————— */}
        <View style={{ display: activeTab === 'overview' ? 'flex' : 'none' }}>
          {teaser && <ThemedText style={{ marginTop: 16 }}>{teaser}</ThemedText>}
          {(parents.length > 0 || marriages.some((m) => m.spouse)) && (
            <View style={{ marginTop: 14 }}>
              {parents.length > 0 && (
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    gap: 12,
                    paddingVertical: 7,
                    borderBottomWidth: 1,
                    borderBottomColor: theme.border,
                  }}
                >
                  <ThemedText type="small" themeColor="textSecondary">
                    Parents
                  </ThemedText>
                  <ThemedText type="small" style={{ flexShrink: 1, textAlign: 'right' }}>
                    {parents.map((p) => p.full_name).join(', ')}
                  </ThemedText>
                </View>
              )}
              {marriages
                .filter((m) => m.spouse)
                .map((m, index) => (
                  <View
                    key={m.spouse?.id ?? index}
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                      gap: 12,
                      paddingVertical: 7,
                      borderBottomWidth: 1,
                      borderBottomColor: theme.border,
                    }}
                  >
                    <ThemedText type="small" themeColor="textSecondary">
                      Spouse
                    </ThemedText>
                    <ThemedText type="small" style={{ flexShrink: 1, textAlign: 'right' }}>
                      {m.spouse!.full_name}
                      {m.year ? ` · m. ${m.year}` : ''}
                    </ThemedText>
                  </View>
                ))}
            </View>
          )}
          {tags.length > 0 && (
            <View style={{ marginTop: 18 }}>
              <Text style={groupLabelStyle}>Alive during…</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
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
              {!person.living && !fromFieldCopy && (
                <ThemedText
                  type="link"
                  style={{ marginTop: 10 }}
                  onPress={() => setActiveTab('life')}
                >
                  See what {possessive} life overlapped with ›
                </ThemedText>
              )}
            </View>
          )}
          {hasRegister && (
            <View style={{ marginTop: 18 }}>
              <Text style={groupLabelStyle}>Family at a glance</Text>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  paddingVertical: 7,
                  borderBottomWidth: 1,
                  borderBottomColor: theme.border,
                }}
              >
                <ThemedText type="small">Siblings</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {siblingCount}
                </ThemedText>
              </View>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  paddingVertical: 7,
                  borderBottomWidth: 1,
                  borderBottomColor: theme.border,
                }}
              >
                <ThemedText type="small">Children</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {childCount}
                </ThemedText>
              </View>
              <ThemedText type="link" style={{ marginTop: 10 }} onPress={() => setActiveTab('family')}>
                View family ›
              </ThemedText>
            </View>
          )}
        </View>

        {/* ————— Life & Times: the Dig-deeper accordion ————— */}
        <View style={{ display: activeTab === 'life' ? 'flex' : 'none' }}>
          {fromFieldCopy ? (
            <ThemedText type="small" style={{ marginTop: 16 }}>
              From your saved copy — the story and their world need a connection.
            </ThemedText>
          ) : !person.living ? (
            <>
              {/* Their story — one continuous read (2026-08-29, Rufus):
                  the writer's voice, then the world context beneath it,
                  the disclosure, the export, and Betsey's box. Both
                  pieces write themselves on tab entry; the old
                  story/world accordion is gone. */}
              <View style={{ marginTop: 2 }}>
                <Panel
                  theme={theme}
                  label={`Their story${
                    sources.length
                      ? ` · drawn from ${sources.length} source${sources.length > 1 ? 's' : ''}`
                      : ''
                  }`}
                >
                  {biography.state.name === 'ready' ? (
                    <ThemedText>{biography.state.text}</ThemedText>
                  ) : biography.state.name === 'error' ? (
                    <>
                      <ThemedText>{biography.state.message}</ThemedText>
                      <Button
                        title="Try again"
                        onPress={() =>
                          void biography.generate(
                            relatives?.length
                              ? { relatives: relativesBrief(relatives) }
                              : undefined,
                          )
                        }
                      />
                    </>
                  ) : (
                    <View style={{ gap: 8, marginVertical: 4 }}>
                      <ActivityIndicator />
                      <ThemedText type="small">Writing their story from the record…</ThemedText>
                    </View>
                  )}
                  {/* The world context follows the story as one read —
                      its own fetch, so it keeps its own states. While the
                      story is still writing, its spinner speaks for the
                      whole piece. */}
                  {worldContext.state.name === 'ready' ? (
                    <View style={{ gap: 10 }}>
                      <ThemedText>{worldContext.state.text}</ThemedText>
                      {(worldContext.state.sources?.length ?? 0) > 0 && (
                        <ThemedText type="small">
                          From {worldContext.state.sources!.join(' and ')}
                        </ThemedText>
                      )}
                      {/* The general-knowledge tier (spec §7.5): generically
                          labeled so it never reads as archive-sourced. */}
                      {worldContext.state.general && (
                        <View
                          style={{
                            gap: 4,
                            borderTopWidth: 1,
                            borderTopColor: theme.border,
                            paddingTop: 10,
                          }}
                        >
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
                  ) : biography.state.name === 'ready' ? (
                    <View style={{ gap: 8, marginVertical: 4 }}>
                      <ActivityIndicator />
                      <ThemedText type="small">Searching the historical record…</ThemedText>
                    </View>
                  ) : null}
                  {/* Said on the page, not left to be guessed (Betsey,
                      2026-08-19): the story is AI-written, and the record
                      outranks it. */}
                  {biography.state.name === 'ready' && (
                    <ThemedText type="small" themeColor="textSecondary" style={{ marginTop: 8 }}>
                      Written by AI from the documented facts of this record. The record, not the
                      story, is the authority.
                    </ThemedText>
                  )}
                  {/* The story leaves the app on the reader's terms: iOS
                      share sheet (a text file, so Save to Files is a real
                      download); web downloads the .txt outright. */}
                  {biography.state.name === 'ready' && (
                    <ThemedText
                      type="small"
                      style={{ fontFamily: Fonts.mono, color: theme.accent, marginTop: 8 }}
                      onPress={() => {
                        const text = biography.state.name === 'ready' ? biography.state.text : '';
                        void shareStory(person.full_name, spanYears, text, ancestorNote).catch(
                          (error) => console.warn('Story share failed', error),
                        );
                      }}
                    >
                      {STORY_SHARE_LABEL}
                    </ThemedText>
                  )}
                  {/* Betsey's box, below the story — also present before one
                      exists, since lore doesn't wait for the writer. The
                      owner's margin, not a companion's. */}
                  {treeOwned && (
                    <AncestorNote
                      individualId={person.id}
                      treeId={person.tree_id}
                      onText={setAncestorNote}
                    />
                  )}
                </Panel>
              </View>

              {/* Below the story: the full Alive-during rows and the
                  neighbors. */}
              <View>
                {tags.length > 0 && (
                  <View style={{ marginTop: 18 }}>
                    <ThemedText type="subtitle">Alive during…</ThemedText>
                    {tags.map((tag) => {
                      const open = openEventIds.has(tag.event.id);
                      return (
                        <View key={tag.event.id}>
                          <Pressable
                            onPress={() =>
                              setOpenEventIds((current) => {
                                const next = new Set(current);
                                if (next.has(tag.event.id)) next.delete(tag.event.id);
                                else next.add(tag.event.id);
                                return next;
                              })
                            }
                            accessibilityRole="button"
                            accessibilityState={{ expanded: open }}
                            style={{
                              flexDirection: 'row',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              gap: 10,
                              paddingVertical: 12,
                              borderBottomWidth: 1,
                              borderBottomColor: theme.border,
                            }}
                          >
                            <Text
                              style={{
                                fontFamily: Fonts.serif,
                                fontSize: 15.5,
                                color: theme.text,
                                flexShrink: 1,
                              }}
                            >
                              {tag.event.name}
                              <Text
                                style={{
                                  fontFamily: Fonts.mono,
                                  fontSize: 13,
                                  color: theme.textSecondary,
                                }}
                              >
                                {`  ${tag.event.startYear}${
                                  tag.event.endYear !== tag.event.startYear
                                    ? `–${tag.event.endYear}`
                                    : ''
                                }`}
                              </Text>
                            </Text>
                            <Text style={{ color: theme.accent }}>{open ? '▴' : '▾'}</Text>
                          </Pressable>
                          {open && (
                            <View style={{ paddingVertical: 8, gap: 6 }}>
                              <ThemedText type="small">{eventBlurb(tag)}</ThemedText>
                              <ThemedText
                                type="link"
                                onPress={() =>
                                  router.push({
                                    pathname: '/query/[eventId]',
                                    params: {
                                      eventId: tag.event.id,
                                      treeId: person.tree_id,
                                      pin: person.id,
                                    },
                                  })
                                }
                              >
                                Everyone who lived through this ›
                              </ThemedText>
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>
                )}

                <View style={{ marginTop: 18 }}>
                  <ThemedText type="subtitle">Lived near</ThemedText>
                  {shownNeighbors === null ? (
                    <ThemedText type="small">Checking who else was within 25 miles…</ThemedText>
                  ) : shownNeighbors.length === 0 ? (
                    <ThemedText type="small">
                      No contemporaries found within 25 miles — geocoding may still be running for
                      this tree.
                    </ThemedText>
                  ) : (
                    <>
                      <ThemedText type="small">
                        Beyond {possessive} own household — contemporaries in your tree with a
                        documented event within 25 miles, nearest first.
                      </ThemedText>
                      {shownNeighbors.map((neighbor) => {
                        const kinLabel = neighborKin.get(neighbor.individual.id)?.label;
                        return (
                          <Pressable
                            key={neighbor.individual.id}
                            onPress={() =>
                              router.push({
                                pathname: '/ancestor/[id]',
                                params: { id: neighbor.individual.id },
                              })
                            }
                            style={{
                              flexDirection: 'row',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              gap: 12,
                              paddingVertical: 8,
                              borderBottomWidth: 1,
                              borderBottomColor: theme.border,
                            }}
                          >
                            <View style={{ flexShrink: 1 }}>
                              <Text
                                style={{
                                  fontFamily: Fonts.serif,
                                  fontSize: 15.5,
                                  color: theme.accent,
                                }}
                              >
                                {neighbor.individual.full_name} ›
                              </Text>
                              <Text
                                style={{
                                  fontFamily: Fonts.mono,
                                  fontSize: 12,
                                  color: theme.textSecondary,
                                  marginTop: 2,
                                }}
                              >
                                {`${neighbor.individual.birth_year ?? '?'}–${
                                  neighbor.individual.death_year ?? '?'
                                }`}
                                {kinLabel ? `  ·  ${kinLabel}` : ''}
                              </Text>
                            </View>
                            <Text
                              style={{
                                fontFamily: Fonts.mono,
                                fontSize: 13,
                                color: theme.textSecondary,
                              }}
                            >
                              {neighbor.distanceMiles < 1 ? 'same town' : `${neighbor.distanceMiles} mi`}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </>
                  )}
                </View>
              </View>
            </>
          ) : null}

          {/* The record reads for everyone — living, offline, all of it. */}
          <View style={{ marginTop: 18 }}>
            <ThemedText type="subtitle">The record</ThemedText>
            {events.length === 0 ? (
              <ThemedText type="small">No dated events recorded.</ThemedText>
            ) : (
              <Card>
                <Lifeline
                  events={events}
                  correctedSubjects={new Set(openCorrections.map((c) => c.subject))}
                />
              </Card>
            )}
          </View>
        </View>

        {/* ————— Family: the register, chart first ————— */}
        <View style={{ display: activeTab === 'family' ? 'flex' : 'none' }}>
          {relatives !== null && (parents.length > 0 || relatives.length > 0) && (
            <View style={{ marginTop: 16 }}>
              <PedigreeChart
                subject={{ id: person.id, name: person.full_name, birth_year: person.birth_year }}
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
            </View>
          )}
          {!hasRegister && (
            <ThemedText type="small" style={{ marginTop: 16 }}>
              No family is recorded for {firstName(person.full_name)} in your tree.
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
            {/* The door to the graph rides directly under the house name —
                it lived at the bottom of the register, below every section,
                where nobody found it (Rufus, 2026-08-23). */}
            {stageKey !== null && (
              <Pressable
                onPress={() =>
                  router.push({ pathname: '/family-stage/[key]', params: { key: stageKey } })
                }
                style={{ paddingTop: 8 }}
              >
                <ThemedText type="link">Family Graph ›</ThemedText>
              </Pressable>
            )}
            {parents.length > 0 && (
              <View style={{ paddingTop: 14, paddingBottom: 4 }}>
                <Text style={groupLabelStyle}>Parents</Text>
                {parents.map((parent) => (
                  <RegisterRow key={parent.id} record={parent} visited={visitedIds.has(parent.id)} />
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
                  <RegisterRow
                    key={sibling.id}
                    record={sibling}
                    isSelf={sibling.id === person.id}
                    visited={visitedIds.has(sibling.id)}
                  />
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
                      {/* Tappable eyebrow reads tappable: accent, unlike its
                          inert PARENTS / SIBLINGS neighbors. */}
                      <Text style={{ ...groupLabelStyle, color: theme.accent }}>{label} ›</Text>
                    </Pressable>
                  ) : (
                    <Text style={groupLabelStyle}>{label}</Text>
                  )}
                  {marriage.children.map((child) => (
                    <RegisterRow key={child.id} record={child} visited={visitedIds.has(child.id)} />
                  ))}
                </View>
              );
            })}
          </View>
        )}

        </View>

        {/* ————— Sources: the research desk ————— */}
        <View style={{ display: activeTab === 'sources' ? 'flex' : 'none' }}>
        {/* Actionable above reference (Rufus, 2026-09-02): the records
            waiting on a verdict print before the citation list — the
            reader's job first, the bibliography after. */}
        {naraCandidates.length > 0 && (
          <View style={{ gap: 8, marginTop: 16 }}>
            <ThemedText type="subtitle">In the National Archives</ThemedText>
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
          </View>
        )}

        {/* The Crossing: shipping-list passengers who might be this
            ancestor, from the immigrant-ships dataset (PROJECT_BRIEF.md
            "Immigrant Ships"). A Mayflower name is the beginning of a
            question, not a descent — so this stays confirm/dismiss, same
            as the archives card above it. */}
        {passengerCandidates.length > 0 && (
          <View style={{ gap: 8, marginTop: 16 }}>
            <ThemedText type="subtitle">The Crossing</ThemedText>
            <ThemedText type="small">
              A shipping list that might name {firstName(person.full_name)} — you decide.
            </ThemedText>
            {passengerCandidates.map((candidate) => (
              <PassengerCandidateCard
                key={candidate.id}
                candidate={candidate}
                onResolved={(candidateId, status) =>
                  setPassengerCandidates((current) =>
                    status === 'dismissed'
                      ? current.filter((c) => c.id !== candidateId)
                      : current.map((c) => (c.id === candidateId ? { ...c, status } : c)),
                  )
                }
              />
            ))}
          </View>
        )}

        {/* The record books: historical-record register candidates, the
            generic frame every future record set rides
            (docs/witness-historical-record-registers-package.md). Same
            doctrine as the cards above — a record that MIGHT name this
            person, and only the reader decides. */}
        {registerLinks.length > 0 && registerCatalog.size > 0 && (
          <View style={{ gap: 8, marginTop: 16 }}>
            <ThemedText type="subtitle">In the record books</ThemedText>
            <ThemedText type="small">
              Records that might name {firstName(person.full_name)} — you decide.
            </ThemedText>
            {registerLinks.map((link) => {
              const register = registerCatalog.get(link.registerKey);
              if (!register) return null;
              return (
                <RegisterCandidateCard
                  key={link.id}
                  link={link}
                  register={register}
                  onResolved={(linkId, status) =>
                    setRegisterLinks((current) =>
                      status === 'rejected'
                        ? current.filter((l) => l.id !== linkId)
                        : current.map((l) => (l.id === linkId ? { ...l, status } : l)),
                    )
                  }
                />
              );
            })}
          </View>
        )}

          {/* The per-person ways off this page — the brief, the provider
              record, the share card — live with the rest of the research. */}
          {!fromFieldCopy && (providerLink || !person.living) && (
            <View style={{ flexDirection: 'row', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
              {!person.living && treeOwned && (
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
              {/* Companions share too (phase 3, Rufus 2026-08-30): the card
                  is a snapshot attributed to whoever sends it, and cousins
                  showing cousins is the growth loop. Living-person and
                  snapshot rules apply identically. */}
              {!person.living && (
                <Text
                  style={{ fontFamily: Fonts.mono, fontSize: 12, color: theme.accent }}
                  onPress={shareState === 'busy' ? undefined : shareAncestor}
                >
                  {shareState === 'copied' ? 'Copied ✓' : shareState === 'busy' ? 'Sharing…' : 'Share ›'}
                </Text>
              )}
            </View>
          )}
          {fromFieldCopy && (
            <ThemedText type="small" style={{ marginTop: 16 }}>
              From your saved copy — sources and corrections need a connection.
            </ThemedText>
          )}

          {sources.length > 0 ? (
            <View style={{ gap: 8, marginTop: 16 }}>
              <ThemedText type="subtitle">Sources</ThemedText>
              <ThemedText type="small">
                How the record knows {firstName(person.full_name)} —{' '}
                {sources.length === 1 ? 'one source' : `${sources.length} sources`}, as cited in
                your tree.
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
                      {isFindAGraveUrl(source.url)
                        ? 'View the memorial on Find A Grave ›'
                        : 'View the record ›'}
                    </ThemedText>
                  )}
                </Card>
              ))}
            </View>
          ) : !fromFieldCopy ? (
            <ThemedText type="small" style={{ marginTop: 16 }}>
              No sources are cited for {firstName(person.full_name)} in your tree yet.
            </ThemedText>
          ) : null}

        {/* The burial record — deep-link & confirm (Rufus's spec,
            2026-08-24). Imported citations CLAIM a memorial; only the reader
            can verify it. The search opens in their own browser; Witness
            stores nothing but the URL they confirm. */}
        {person && !person.living && !fromFieldCopy && treeOwned && (
          <View style={{ marginTop: 16, gap: 6 }}>
            <ThemedText type="subtitle">Burial record</ThemedText>
            {graveConf && graveFlow === 'idle' && (
              <>
                <ThemedText type="small">
                  Memorial confirmed by you on{' '}
                  {new Date(graveConf.confirmed_at).toLocaleDateString()}.
                </ThemedText>
                <ThemedText type="link" onPress={() => openExternal(graveConf.url)}>
                  View the memorial on Find A Grave ›
                </ThemedText>
                <ThemedText
                  type="small"
                  themeColor="accent"
                  onPress={() => startGraveSearch()}
                  accessibilityRole="button"
                >
                  Re-check burial record ›
                </ThemedText>
              </>
            )}
            {!graveConf && graveFlow === 'idle' && (
              <>
                <ThemedText type="small">
                  Search Find A Grave with what the record knows, then confirm the right memorial
                  yourself — Witness saves only the link you verify.
                </ThemedText>
                <ThemedText
                  type="link"
                  onPress={() => startGraveSearch()}
                  accessibilityRole="button"
                >
                  Find burial record ›
                </ThemedText>
              </>
            )}
            {(graveFlow === 'confirm' || graveFlow === 'saving') && (
              <Card style={{ gap: 8 }}>
                <ThemedText type="small">
                  Found the right memorial? Copy its link in the browser (Share → Copy Link), then
                  paste it here to confirm.
                </ThemedText>
                <TextField
                  value={graveDraft}
                  onChangeText={setGraveDraft}
                  placeholder="https://www.findagrave.com/memorial/…"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {graveDraft.trim().length > 0 && extractFindAGraveUrl(graveDraft) === null && (
                  <ThemedText type="small">
                    No memorial link found in that yet — either Copy Link or Copy record
                    details from the memorial page works.
                  </ThemedText>
                )}
                {extractFindAGraveUrl(graveDraft) !== null && (
                  <ThemedText type="small">
                    Saving: {extractFindAGraveUrl(graveDraft)}
                  </ThemedText>
                )}
                <Button
                  title={graveFlow === 'saving' ? 'Saving…' : 'Confirm this memorial'}
                  onPress={() => void saveGrave()}
                  disabled={graveFlow === 'saving' || extractFindAGraveUrl(graveDraft) === null}
                />
                <ThemedText
                  type="small"
                  onPress={() => setGraveFlow('idle')}
                  accessibilityRole="button"
                >
                  Cancel
                </ThemedText>
              </Card>
            )}
          </View>
        )}

        {/* The search doors: where Witness cannot hold the list, it opens
            the reader's search already filled in — the Find A Grave rule,
            extended to the record sites. A result is the beginning of a
            question, never a descent. */}
        {person && !person.living && !fromFieldCopy && (
          <View style={{ marginTop: 16, gap: 6 }}>
            <ThemedText type="subtitle">Search the records</ThemedText>
            <ThemedText type="small">
              These open pre-filled with what the record knows about{' '}
              {firstName(person.full_name)} — what comes back is a question for you, not a
              finding.
            </ThemedText>
            <ThemedText
              type="link"
              accessibilityRole="button"
              onPress={() =>
                openExternal(
                  familySearchRecordsUrl({
                    fullName: person.full_name,
                    birthYear: person.birth_year,
                    deathYear: person.death_year,
                    birthPlace: birthPlace ? birthPlace.split(',').slice(0, 2).join(',').trim() : null,
                  }),
                )
              }
            >
              Search FamilySearch records ›
            </ThemedText>
            {arrivalsSearch && crossingFlag && (
              <ThemedText
                type="link"
                accessibilityRole="button"
                onPress={() => openExternal(arrivalsSearch.url)}
              >
                Search {arrivalsSearch.collectionLabel} for the {crossingFlag.year} crossing ›
              </ThemedText>
            )}
            {providerLink?.label.includes('Ancestry') && (
              <ThemedText
                type="link"
                accessibilityRole="button"
                onPress={() =>
                  openExternal(
                    ancestryImmigrationSearchUrl({
                      fullName: person.full_name,
                      birthYear: person.birth_year,
                    }),
                  )
                }
              >
                Search Ancestry immigration records ›
              </ThemedText>
            )}
          </View>
        )}

        {/* The margin: the reader's own corrections, pencilled beside the
            record and carried to the source on the punch list. Renders for
            living people too — a census error on a living relative is real.
            Not on the saved copy: a pencil that can't save is a broken one.
            Kept mounted whatever tab shows, so the ✎ glyphs in the header
            and on the Lifeline know about open corrections. */}
        {!fromFieldCopy && treeOwned && (
          <MarginCorrections person={person} events={events} onChanged={setOpenCorrections} />
        )}

        {/* The third door: what the audit noticed about this person. Same
            session-cached run and marks/rulings filter as the workbench, so
            a decided finding disappears here on the next visit. */}
        {curiosities.length > 0 && treeOwned && (
          <View style={{ gap: 8, marginTop: 16 }}>
            <ThemedText type="subtitle">From the Tree Check</ThemedText>
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
          </View>
        )}

        </View>
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
          fontSize: 12.5,
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
