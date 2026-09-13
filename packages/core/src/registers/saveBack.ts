import type { SaveBackConfig } from './types.js';

/**
 * Variant C's save-back, rendered: the reader's typed values become the
 * card's record name and summary and the link's saved_payload. Pure and
 * config-driven so a register is config + data — the GLO and AAD
 * registers share this one renderer.
 */
export interface RenderedSaveBack {
  recordName: string;
  recordSummary: string;
  sourceCitation: string;
  findingAidUrl: string | null;
  savedPayload: Record<string, unknown>;
  /** Fields marked required that came back empty, by label. */
  missing: string[];
}

function fillSegments(template: string, values: Record<string, string>): string {
  // Segments are ` · ` or ` — ` separated; a segment whose every
  // placeholder is empty disappears with its separator.
  const parts = template.split(/( · | — )/);
  const kept: string[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    const segment = parts[i] ?? '';
    const separator = parts[i - 1] ?? '';
    const placeholders = [...segment.matchAll(/\{([a-zA-Z_]+)\}/g)].map((m) => m[1]!);
    const allEmpty = placeholders.length > 0 && placeholders.every((k) => !(values[k] ?? '').trim());
    if (allEmpty) continue;
    const filled = segment.replace(/\{([a-zA-Z_]+)\}/g, (_, k: string) => (values[k] ?? '').trim());
    if (kept.length > 0) kept.push(separator || ' · ');
    kept.push(filled);
  }
  return kept.join('').replace(/\s+/g, ' ').trim();
}

export function renderSaveBack(
  config: SaveBackConfig,
  input: Record<string, string | null | undefined>,
): RenderedSaveBack {
  const values: Record<string, string> = {};
  for (const field of config.fields) values[field.key] = (input[field.key] ?? '').trim();
  const missing = config.fields.filter((f) => f.required && !values[f.key]).map((f) => f.label);

  const savedPayload: Record<string, unknown> = {};
  for (const field of config.fields) {
    if (!values[field.key]) continue;
    savedPayload[field.key] = values[field.key];
    if (field.isYear) {
      const year = /(\d{4})/.exec(values[field.key]!)?.[1];
      if (year) savedPayload['event_year'] = Number(year);
    }
  }
  const url = config.urlKey ? values[config.urlKey] : '';
  return {
    recordName: fillSegments(config.recordNameTemplate, values),
    recordSummary: fillSegments(config.summaryTemplate, values),
    sourceCitation: config.sourceCitation,
    findingAidUrl: url && /^https?:\/\//i.test(url) ? url : null,
    savedPayload,
    missing,
  };
}
