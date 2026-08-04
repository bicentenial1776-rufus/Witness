/**
 * Street View Lab — dev harness.
 *
 * Flow: drop a .ged/.gdz → parse in-browser (@witness/core) → pick an anchor
 * → generateSceneSpec (@witness/streetview) → walkable world. Specs can be
 * downloaded as JSON snapshots and re-loaded without the GEDCOM — those
 * snapshots are the regression fixtures for engine work.
 *
 * Real family data stays local: nothing here uploads, and data/ is gitignored.
 */

import { extractGedcomText, parseGedcom, type ParsedGedcom } from '@witness/core/gedcom';
import {
  createEngine,
  generateSceneSpec,
  type HouseholdSpec,
  type SceneSpec,
  type StreetViewEngine,
} from '@witness/streetview';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const drop = $<HTMLDivElement>('drop');
const fileInput = $<HTMLInputElement>('file');
const canvas = $<HTMLCanvasElement>('view');
const statsEl = $<HTMLDivElement>('stats');
const selectedEl = $<HTMLDivElement>('selected');
const anchorSearch = $<HTMLInputElement>('anchorSearch');
const anchorResults = $<HTMLDivElement>('anchorResults');
const seedInput = $<HTMLInputElement>('seed');
const regenBtn = $<HTMLButtonElement>('regen');
const downloadBtn = $<HTMLButtonElement>('downloadSpec');

let tree: ParsedGedcom | null = null;
let anchorId: string | null = null;
let spec: SceneSpec | null = null;
let engine: StreetViewEngine | null = null;

// ── file intake ───────────────────────────────────────────────────────────
function wireIntake() {
  const open = () => fileInput.click();
  drop.addEventListener('click', open);
  $<HTMLButtonElement>('loadGed').addEventListener('click', open);
  $<HTMLButtonElement>('loadSpec').addEventListener('click', open);
  fileInput.addEventListener('change', () => {
    const f = fileInput.files?.[0];
    if (f) void handleFile(f);
    fileInput.value = '';
  });
  for (const t of ['dragenter', 'dragover'] as const)
    document.addEventListener(t, (e) => {
      e.preventDefault();
      drop.classList.remove('hidden');
      drop.classList.add('hot');
    });
  document.addEventListener('dragleave', (e) => {
    if ((e as DragEvent).relatedTarget === null) drop.classList.remove('hot');
  });
  document.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('hot');
    const f = e.dataTransfer?.files?.[0];
    if (f) void handleFile(f);
  });
}

async function handleFile(f: File) {
  if (f.name.toLowerCase().endsWith('.json')) {
    const parsed = JSON.parse(await f.text()) as SceneSpec;
    if (parsed.version !== 1 || !Array.isArray(parsed.households)) {
      alert('Not a scene-spec JSON.');
      return;
    }
    tree = null;
    anchorId = parsed.anchor.individualId;
    anchorSearch.value = parsed.anchor.name;
    anchorSearch.disabled = true;
    regenBtn.disabled = true;
    mountSpec(parsed, `loaded snapshot ${f.name}`);
    return;
  }
  const t0 = performance.now();
  const bytes = new Uint8Array(await f.arrayBuffer());
  const text = extractGedcomText(bytes);
  tree = parseGedcom(text, f.name);
  const parseMs = Math.round(performance.now() - t0);
  anchorSearch.disabled = false;
  regenBtn.disabled = false;
  statsEl.textContent = `${f.name}\n${tree.individuals.size} individuals · ${tree.families.size} families · parsed ${parseMs}ms\npick an anchor →`;
  anchorId = defaultAnchor(tree);
  renderAnchorResults('');
  regenerate();
}

// ── anchor selection ──────────────────────────────────────────────────────
function defaultAnchor(t: ParsedGedcom): string {
  // deepest ancestor closure = the person whose world is richest
  const memo = new Map<string, number>();
  const count = (id: string, seen: Set<string>): number => {
    const hit = memo.get(id);
    if (hit !== undefined) return hit;
    if (seen.has(id)) return 0;
    seen.add(id);
    let n = 0;
    for (const famId of t.individuals.get(id)?.familyAsChild ?? []) {
      const fam = t.families.get(famId);
      for (const pid of [fam?.husbandId, fam?.wifeId]) if (pid) n += 1 + count(pid, seen);
    }
    memo.set(id, n);
    return n;
  };
  let best = '';
  let bestN = -1;
  for (const id of t.individuals.keys()) {
    const n = count(id, new Set());
    if (n > bestN) {
      bestN = n;
      best = id;
    }
  }
  return best;
}

function renderAnchorResults(query: string) {
  if (!tree) return;
  const q = query.trim().toLowerCase();
  const matches: Array<[string, string]> = [];
  for (const [id, ind] of tree.individuals) {
    if (matches.length >= 24) break;
    if (!q || ind.name.full.toLowerCase().includes(q)) {
      const span = ind.living ? '(living)' : `${ind.birth?.date?.year ?? '?'}–${ind.death?.date?.year ?? '?'}`;
      matches.push([id, `${ind.name.full} ${span}`]);
    }
  }
  anchorResults.innerHTML = '';
  for (const [id, label] of matches) {
    const div = document.createElement('div');
    div.textContent = (id === anchorId ? '▸ ' : '') + label;
    div.addEventListener('click', () => {
      anchorId = id;
      regenerate();
      renderAnchorResults(anchorSearch.value);
    });
    anchorResults.appendChild(div);
  }
  if (!matches.length) anchorResults.textContent = 'no matches';
}
anchorSearch.addEventListener('input', () => renderAnchorResults(anchorSearch.value));

// ── generation + mount ────────────────────────────────────────────────────
function regenerate() {
  if (!tree || !anchorId) return;
  const t0 = performance.now();
  const next = generateSceneSpec(tree, { anchorId, seed: Number(seedInput.value) || 0 });
  mountSpec(next, `generated ${Math.round(performance.now() - t0)}ms`);
}
regenBtn.addEventListener('click', regenerate);
seedInput.addEventListener('change', regenerate);

function mountSpec(next: SceneSpec, how: string) {
  spec = next;
  engine?.dispose();
  engine = createEngine(canvas, next, { onSelect: showHousehold });
  drop.classList.add('hidden');
  downloadBtn.disabled = false;
  const s = next.stats;
  statsEl.textContent =
    `anchor: ${next.anchor.name}\n` +
    `${how} · seed ${next.seed}\n` +
    `${s.householdsPlaced} households placed (${s.householdsUndatable} undatable)\n` +
    `${s.yearMin}–${s.yearMax}\n` +
    `documented ${s.bands.documented} · partial ${s.bands.partial} · lost ${s.bands.lost} · living ${s.bands.living}\n` +
    `lines: ${next.majorLines.map((l) => `${l.surname}(${l.households})`).join(' ')}`;
  selectedEl.textContent = 'tap a house';
}

function showHousehold(h: HouseholdSpec | null) {
  if (!h) {
    selectedEl.textContent = 'walking…';
    return;
  }
  if (h.band === 'living') {
    selectedEl.innerHTML = `<span class="band-living">● living</span>\n${h.surname} household\ndetails withheld`;
    return;
  }
  selectedEl.innerHTML =
    `<span class="band-${h.band}">● ${h.band}</span>  ${h.id}\n` +
    `${h.husbandName ?? '—'}${h.husbandLifespan ? ` (${h.husbandLifespan})` : ''}\n` +
    `${h.wifeName ?? '—'}${h.wifeLifespan ? ` (${h.wifeLifespan})` : ''}\n` +
    `${h.marriageDate ? `m. ${h.marriageDate}\n` : ''}` +
    `${h.place ?? 'place unrecorded'}\n` +
    `year ${h.year} · era ${h.era ?? '—'} · gen ${h.generation ?? '?'}\n` +
    `${h.children} children · ${h.sources} citations · score ${(h.score * 100).toFixed(0)}%`;
}

// ── snapshot download ─────────────────────────────────────────────────────
downloadBtn.addEventListener('click', () => {
  if (!spec) return;
  const blob = new Blob([JSON.stringify(spec, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `scene-spec-${spec.anchor.name.replace(/\W+/g, '_')}-seed${spec.seed}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

wireIntake();
