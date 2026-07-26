import AsyncStorage from '@react-native-async-storage/async-storage';

import { getEventLibrary } from '@/lib/event-library';
import { supabase } from '@/lib/supabase';
import { getTreeIndex } from '@/lib/tree-index-cache';

/**
 * Native resume — the phone Home feed's "Pick up where you left off" card
 * (docs/phone-ia-design-brief.md §Home item 5). Web restores its route on
 * cold arrival (useWebResume in the app layout); the phone instead makes
 * resume visible: the last detail screen visited is saved here, and Home
 * offers it as a card. Only routes the card can name are saved — a whitelist,
 * so the card never reads as "Back to /query/abc123 ›".
 */

const KEY = 'witness_native_resume';
/** Two evenings, not one working session: yesterday's ancestor is the card's whole point. */
const TTL_MS = 48 * 60 * 60 * 1000;

export interface ResumePoint {
  path: string;
  ts: number;
}

const STATIC_TITLES: [prefix: string, title: string][] = [
  ['/family-stage', 'The Family Stage'],
  ['/register', 'The Register'],
  ['/tree-health', 'The Tree Check'],
  ['/orphan-records', 'Orphan Records'],
  ['/digest', 'This Week in Your Family'],
  ['/archives', 'The National Archives'],
  ['/crossings', 'Ocean Crossings'],
  ['/kindred', 'Kindred Couples'],
  ['/migrations', 'Migration Paths'],
  ['/origins', 'Where It Began'],
  ['/places', 'Where They Lived'],
  ['/library', 'The Library'],
];

function isTrackable(path: string): boolean {
  return (
    path.startsWith('/ancestor/') ||
    path.startsWith('/research/') ||
    path.startsWith('/query/') ||
    STATIC_TITLES.some(([prefix]) => path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`))
  );
}

export async function trackResumePoint(path: string): Promise<void> {
  if (!isTrackable(path)) return;
  const point: ResumePoint = { path, ts: Date.now() };
  await AsyncStorage.setItem(KEY, JSON.stringify(point));
}

/**
 * Called on sign-out: a resume point is one account's trail, and the next
 * signer-in must not be offered it (web's witness_last_route is cleared by
 * the same handler).
 */
export async function clearResumePoint(): Promise<void> {
  await AsyncStorage.removeItem(KEY).catch(() => {});
}

export async function getResumePoint(): Promise<ResumePoint | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const point = JSON.parse(raw) as ResumePoint;
    if (!point.path || Date.now() - (point.ts ?? 0) > TTL_MS) return null;
    return point;
  } catch {
    return null;
  }
}

/**
 * A human name for a saved route — "Abigail Field", "The Register", the
 * research brief's own title. Null when the route can't be named (the
 * card is dropped rather than shown raw).
 */
export async function describeResumePoint(point: ResumePoint, treeId: string): Promise<string | null> {
  const path = point.path.split('?')[0];

  const ancestorId = path.match(/^\/ancestor\/([^/]+)$/)?.[1];
  if (ancestorId) {
    try {
      const index = await getTreeIndex(treeId);
      return index.individuals.get(ancestorId)?.full_name ?? null;
    } catch {
      return null;
    }
  }

  const briefId = path.match(/^\/research\/([^/]+)$/)?.[1];
  if (briefId && briefId !== 'index') {
    const { data } = await supabase.from('research_briefs').select('title').eq('id', briefId).maybeSingle();
    return data?.title ?? 'A research brief';
  }
  if (path === '/research') return 'Research';

  const eventId = path.match(/^\/query\/([^/]+)$/)?.[1];
  if (eventId) {
    try {
      const library = await getEventLibrary();
      return library.find((event) => event.id === eventId)?.name ?? null;
    } catch {
      return null;
    }
  }

  const match = STATIC_TITLES.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`));
  return match ? match[1] : null;
}
