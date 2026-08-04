/**
 * ParsedGedcom → SceneSpec.
 *
 * Pure and deterministic: same tree + same anchor + same seed = identical
 * spec. Isolates the anchor's ancestor subtree (per the Aug 2 decision to
 * never reason over the whole file), classifies each household into an era
 * cell and evidence band, and computes the world layout ported from the
 * 08.02 demo: radius = time (equal-area so density stays even), bearing =
 * surname line, relaxed toward marriage links, then separated.
 */

import type { Family, Individual, ParsedGedcom } from '@witness/core/gedcom';
import { hashStr, mulberry32 } from './rng.js';
import {
  SCENE_SPEC_VERSION,
  type EraCell,
  type EvidenceBand,
  type HouseholdSpec,
  type SceneSpec,
} from './types.js';

export interface GenerateOptions {
  anchorId: string;
  seed?: number;
  /** Cap on placed households, largest-score kept. Default: no cap. */
  maxHouseholds?: number;
}

const TAU = Math.PI * 2;

// ── era classification ────────────────────────────────────────────────────
const EUROPE =
  /england|scotland|ireland|wales|united kingdom|great britain|france|germany|netherlands|holland|belgium|channel islands|isle of/i;
const CANADA = /canada|qu[eé]bec|quebec|acadi|port royal|nova scotia|new brunswick|ontario|kamouraska|nicolet/i;

function eraCellFor(year: number, place: string | undefined): EraCell {
  const p = place ?? '';
  if (CANADA.test(p)) return year >= 1935 ? 'postwar' : 'quebec_farm';
  if (EUROPE.test(p) && year < 1850) return 'england_hall';
  if (year < 1640) return 'england_hall';
  if (year < 1730) return 'colonial_hall';
  if (year < 1840) return 'federal_farm';
  if (year < 1935) return 'milltown';
  return 'postwar';
}

// ── helpers over core types ───────────────────────────────────────────────
function lifespan(ind: Individual | undefined): string | undefined {
  if (!ind || ind.living) return undefined;
  const b = ind.birth?.date?.year;
  const d = ind.death?.date?.year;
  if (b == null && d == null) return undefined;
  return `${b ?? '?'}–${d ?? '?'}`;
}

function householdYear(fam: Family, byId: Map<string, Individual>): number | null {
  const m = fam.marriage?.date;
  if (m?.year != null) return m.year;
  if (m?.rangeStartYear != null) return m.rangeStartYear;
  let earliestChild: number | null = null;
  for (const cid of fam.childIds) {
    const y = byId.get(cid)?.birth?.date?.year;
    if (y != null && (earliestChild === null || y < earliestChild)) earliestChild = y;
  }
  if (earliestChild != null) return earliestChild - 1;
  const hb = byId.get(fam.husbandId ?? '')?.birth?.date?.year;
  const wb = byId.get(fam.wifeId ?? '')?.birth?.date?.year;
  const b = hb != null && wb != null ? Math.max(hb, wb) : hb ?? wb;
  return b != null ? b + 25 : null;
}

// ── the generator ─────────────────────────────────────────────────────────
export function generateSceneSpec(tree: ParsedGedcom, opts: GenerateOptions): SceneSpec {
  const { anchorId } = opts;
  const seed = opts.seed ?? 20260802;
  const byId = tree.individuals;
  const famById = tree.families;
  const placeById = new Map(tree.places.map((p) => [p.id, p.raw]));

  const anchor = byId.get(anchorId);
  if (!anchor) throw new Error(`Anchor individual ${anchorId} not found in tree`);

  // 1. Ancestor closure of the anchor (individuals), walking child→parents.
  const ancestors = new Set<string>([anchorId]);
  const genOf = new Map<string, number>([[anchorId, 0]]);
  const queue: string[] = [anchorId];
  while (queue.length) {
    const id = queue.shift()!;
    const gen = genOf.get(id)!;
    const ind = byId.get(id);
    if (!ind) continue;
    for (const famId of ind.familyAsChild) {
      const fam = famById.get(famId);
      if (!fam) continue;
      for (const pid of [fam.husbandId, fam.wifeId]) {
        if (pid && !ancestors.has(pid)) {
          ancestors.add(pid);
          genOf.set(pid, gen + 1);
          queue.push(pid);
        }
      }
    }
  }

  // 2. Households: every family where a spouse is in the closure. This pulls
  //    in ancestors' other marriages too — texture, honestly derived.
  const famIds = new Set<string>();
  for (const id of ancestors) {
    const ind = byId.get(id);
    if (!ind) continue;
    for (const f of ind.familyAsSpouse) famIds.add(f);
  }

  let undatable = 0;
  const bands: Record<EvidenceBand, number> = { documented: 0, partial: 0, lost: 0, living: 0 };
  let households: HouseholdSpec[] = [];

  for (const famId of famIds) {
    const fam = famById.get(famId);
    if (!fam) continue;
    const husband = byId.get(fam.husbandId ?? '');
    const wife = byId.get(fam.wifeId ?? '');
    const year = householdYear(fam, byId);
    if (year == null) {
      undatable++;
      continue;
    }

    const living = Boolean(husband?.living || wife?.living);
    const sources =
      fam.citations.length + (husband?.citations.length ?? 0) + (wife?.citations.length ?? 0);
    const marriageDate = fam.marriage?.date?.raw;
    const placeRaw =
      placeById.get(fam.marriage?.placeId ?? '') ??
      placeById.get(byId.get(fam.childIds[0] ?? '')?.birth?.placeId ?? '') ??
      placeById.get(husband?.birth?.placeId ?? '') ??
      placeById.get(wife?.birth?.placeId ?? '');

    let band: EvidenceBand;
    if (living) band = 'living';
    else if ((marriageDate && sources > 0) || sources >= 3) band = 'documented';
    else if (!placeRaw && sources === 0 && !marriageDate) band = 'lost';
    else band = 'partial';

    const bothSpans = Boolean(lifespan(husband) && lifespan(wife));
    const score = Math.min(
      1,
      0.2 +
        (marriageDate ? 0.2 : 0) +
        Math.min(0.4, sources * 0.05) +
        (placeRaw ? 0.1 : 0) +
        (bothSpans ? 0.1 : 0),
    );

    const surname =
      husband?.name.surname ?? wife?.name.surname ?? husband?.name.full.split(' ').pop() ?? '—';

    const genH = fam.husbandId ? genOf.get(fam.husbandId) : undefined;
    const genW = fam.wifeId ? genOf.get(fam.wifeId) : undefined;
    const generation =
      genH != null && genW != null ? Math.min(genH, genW) : genH ?? genW ?? undefined;

    const h: HouseholdSpec = {
      id: fam.id,
      year,
      era: band === 'lost' ? null : eraCellFor(year, placeRaw),
      band,
      score,
      children: fam.childIds.length,
      sources,
      surname,
      generation,
      x: 0,
      z: 0,
      bearing: 0,
    };

    // Privacy: living households carry no names, dates, or places.
    if (!living) {
      h.husbandName = husband?.name.full;
      h.wifeName = wife?.name.full;
      h.husbandLifespan = lifespan(husband);
      h.wifeLifespan = lifespan(wife);
      h.marriageDate = marriageDate;
      h.place = placeRaw;
      const fatherFam = husband?.familyAsChild[0];
      const motherFam = wife?.familyAsChild[0];
      if (fatherFam && famIds.has(fatherFam)) h.fatherFamilyId = fatherFam;
      if (motherFam && famIds.has(motherFam)) h.motherFamilyId = motherFam;
    } else {
      // Links still exist for living households (their parents are dead
      // ancestors) so the descent graph stays connected.
      const fatherFam = husband?.familyAsChild[0];
      const motherFam = wife?.familyAsChild[0];
      if (fatherFam && famIds.has(fatherFam)) h.fatherFamilyId = fatherFam;
      if (motherFam && famIds.has(motherFam)) h.motherFamilyId = motherFam;
    }

    households.push(h);
  }

  if (opts.maxHouseholds && households.length > opts.maxHouseholds) {
    households.sort((a, b) => b.score - a.score);
    households = households.slice(0, opts.maxHouseholds);
  }
  for (const h of households) bands[h.band]++;

  // 3. Layout — ported from the 08.02 demo.
  layout(households, seed);

  const majorLines = computeMajorLines(households);

  const years = households.map((h) => h.year);
  return {
    version: SCENE_SPEC_VERSION,
    seed,
    anchor: { individualId: anchorId, name: anchor.name.full },
    households: households.sort((a, b) => a.year - b.year),
    majorLines,
    stats: {
      individualsInTree: tree.individuals.size,
      familiesInTree: tree.families.size,
      householdsPlaced: households.length,
      householdsUndatable: undatable,
      yearMin: years.length ? Math.min(...years) : 0,
      yearMax: years.length ? Math.max(...years) : 0,
      bands,
    },
  };
}

// ── layout (radius = time, bearing = surname line, relaxed, separated) ────
function computeMajorLines(households: HouseholdSpec[]) {
  const counts = new Map<string, number>();
  for (const h of households) {
    if (h.surname && h.surname !== '—') counts.set(h.surname, (counts.get(h.surname) ?? 0) + 1);
  }
  const ordered = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  return ordered.map(([surname, n], i) => ({
    surname,
    bearing: (i / ordered.length) * TAU,
    households: n,
  }));
}

function layout(households: HouseholdSpec[], seed: number): void {
  if (!households.length) return;
  const R0 = 46;
  const RMAX = Math.max(220, Math.sqrt(households.length) * 18 + R0);
  const order = [...households].sort((a, b) => a.year - b.year || a.id.localeCompare(b.id));
  const step = (RMAX * RMAX - R0 * R0) / Math.max(1, order.length);
  const r0 = new Map<string, number>();
  order.forEach((h, k) => r0.set(h.id, Math.sqrt(R0 * R0 + k * step)));

  const lineBearing = new Map(computeMajorLines(households).map((l) => [l.surname, l.bearing]));
  const ang = new Map<string, number>();
  for (const h of households) {
    const base =
      lineBearing.get(h.surname) ?? (hashStr(h.surname || 'x') % 100000) / 100000 * TAU;
    const jitter = (mulberry32(hashStr(`j${h.id}`) ^ seed)() - 0.5) * 0.34;
    ang.set(h.id, base + jitter);
  }

  // Relax bearings toward linked households (both directions).
  const links: Array<[HouseholdSpec, HouseholdSpec]> = [];
  const byFam = new Map(households.map((h) => [h.id, h]));
  for (const h of households) {
    for (const p of [h.fatherFamilyId, h.motherFamilyId]) {
      const other = p ? byFam.get(p) : undefined;
      if (other) links.push([h, other]);
    }
  }
  for (let pass = 0; pass < 26; pass++) {
    const sx = new Map<string, number>();
    const sy = new Map<string, number>();
    const n = new Map<string, number>();
    const add = (a: HouseholdSpec, b: HouseholdSpec) => {
      const ab = ang.get(b.id)!;
      sx.set(a.id, (sx.get(a.id) ?? 0) + Math.cos(ab));
      sy.set(a.id, (sy.get(a.id) ?? 0) + Math.sin(ab));
      n.set(a.id, (n.get(a.id) ?? 0) + 1);
    };
    for (const [a, b] of links) {
      add(a, b);
      add(b, a);
    }
    for (const h of households) {
      const c = n.get(h.id);
      if (!c) continue;
      const mean = Math.atan2(sy.get(h.id)! / c, sx.get(h.id)! / c);
      const cur = ang.get(h.id)!;
      const d = Math.atan2(Math.sin(mean - cur), Math.cos(mean - cur));
      ang.set(h.id, cur + d * 0.16);
    }
  }

  for (const h of households) {
    const r = r0.get(h.id)!;
    const a = ang.get(h.id)!;
    h.x = Math.cos(a) * r;
    h.z = Math.sin(a) * r;
  }

  // Separate plots, sliding sideways, holding each near its dated radius.
  const PLOT = 11;
  const CELL = 60;
  for (let pass = 0; pass < 60; pass++) {
    const grid = new Map<string, HouseholdSpec[]>();
    const key = (x: number, z: number) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
    for (const h of households) {
      const k = key(h.x, h.z);
      const cell = grid.get(k);
      if (cell) cell.push(h);
      else grid.set(k, [h]);
    }
    for (const a of households) {
      const ix = Math.floor(a.x / CELL);
      const iz = Math.floor(a.z / CELL);
      for (let gx = -1; gx <= 1; gx++) {
        for (let gz = -1; gz <= 1; gz++) {
          const cell = grid.get(`${ix + gx},${iz + gz}`);
          if (!cell) continue;
          for (const b of cell) {
            if (b === a) continue;
            const dx = b.x - a.x;
            const dz = b.z - a.z;
            const d = Math.hypot(dx, dz);
            const need = PLOT * 2 + 3;
            if (d >= need || d < 1e-5) continue;
            const push = (need - d) * 0.5;
            // slide mostly tangentially so radii (dates) hold
            const rl = Math.hypot(a.x, a.z) || 1;
            const ux = a.x / rl;
            const uz = a.z / rl;
            const nx = dx / d;
            const nz = dz / d;
            const rad = nx * ux + nz * uz;
            let mx = nx - ux * rad * 0.8;
            let mz = nz - uz * rad * 0.8;
            const ml = Math.hypot(mx, mz) || 1;
            mx /= ml;
            mz /= ml;
            a.x -= mx * push * 0.5;
            a.z -= mz * push * 0.5;
            b.x += mx * push * 0.5;
            b.z += mz * push * 0.5;
          }
        }
      }
    }
    for (const h of households) {
      const want = r0.get(h.id)!;
      const cur = Math.hypot(h.x, h.z) || 1;
      const lim = Math.min(16, Math.max(8, want * 0.045));
      const clamped = Math.max(want - lim, Math.min(want + lim, cur));
      if (clamped !== cur) {
        h.x *= clamped / cur;
        h.z *= clamped / cur;
      }
    }
  }

  for (const h of households) h.bearing = Math.atan2(-h.x, -h.z);
}
