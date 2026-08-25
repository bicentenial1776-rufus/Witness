import { supabase } from '@/lib/supabase';

/**
 * Story arcs + the whole-ancestry synthesis, fetched through their edge
 * functions. The functions own selection and caching (arcs cache per
 * founder forever; the synthesis regenerates when the tree grows); the
 * client just avoids re-invoking within a session — arcs are keyed by UTC
 * day so the Home lead turns over at midnight with the rotation.
 */

export interface ArcWorldFact {
  text: string;
  source: string;
}

export interface ArcPaper {
  title: string;
  date: string;
  image: string;
  url: string;
  hits: number;
}

export interface ArcAudio {
  title: string;
  url: string;
}

export interface ArcGeneration {
  personId: string;
  name: string;
  birth: number | null;
  death: number | null;
  living: boolean;
  relationLabel: string | null;
  factLine: string | null;
  story: string | null;
  world: string[];
  /** v2 content ("Their world, further") — absent on v1 cached arcs. */
  worldFacts?: ArcWorldFact[];
  paper?: ArcPaper | null;
  audio?: ArcAudio | null;
}

export interface StoryArc {
  v: number;
  title: string;
  dek: string;
  founderId: string;
  generations: ArcGeneration[];
}

export interface SynthesisStat {
  label: string;
  value: string;
}

export interface TreeSynthesis {
  v: number;
  title: string;
  dek: string;
  stats: SynthesisStat[];
  sections: { heading: string; body: string }[];
  ancestorCount: number;
  factCount: number;
  generatedAt: string;
}

const arcCache = new Map<string, Promise<StoryArc>>();
const synthesisCache = new Map<string, Promise<TreeSynthesis>>();

function utcDayIndex(): number {
  return Math.floor(Date.now() / 86_400_000);
}

export function getTodayArc(treeId: string): Promise<StoryArc> {
  const key = `${treeId}:${utcDayIndex()}`;
  if (!arcCache.has(key)) {
    const promise = supabase.functions
      .invoke('generate-story-arc', { body: { treeId } })
      .then(({ data, error }) => {
        if (error) throw error;
        return data.arc as StoryArc;
      });
    // Failures don't poison the day — the next visit retries.
    promise.catch(() => arcCache.delete(key));
    arcCache.set(key, promise);
  }
  return arcCache.get(key)!;
}

export function getSynthesis(treeId: string): Promise<TreeSynthesis> {
  if (!synthesisCache.has(treeId)) {
    const promise = supabase.functions
      .invoke('generate-synthesis', { body: { treeId } })
      .then(({ data, error }) => {
        if (error) throw error;
        return data.synthesis as TreeSynthesis;
      });
    promise.catch(() => synthesisCache.delete(treeId));
    synthesisCache.set(treeId, promise);
  }
  return synthesisCache.get(treeId)!;
}
