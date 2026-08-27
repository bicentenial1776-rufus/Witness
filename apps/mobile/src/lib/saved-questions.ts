import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The reader's own questions (Explore redesign, 2026-08-27): free-text
 * questions they want to keep asking of their tree, saved ON THIS DEVICE
 * only — never synced, never sent anywhere. Asking one runs it through
 * the ordinary Explore search; keeping it is the feature, so a question
 * that can't be answered yet ("who was the first Howe in Vermont?")
 * waits for the tree to grow instead of being lost.
 */

export interface SavedQuestion {
  id: string;
  text: string;
  /** Epoch ms, for newest-first display. */
  askedAt: number;
}

const KEY = 'witness.savedQuestions.v1';
const MAX_QUESTIONS = 50;

export async function getSavedQuestions(): Promise<SavedQuestion[]> {
  try {
    const stored = await AsyncStorage.getItem(KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (q): q is SavedQuestion =>
        typeof q === 'object' &&
        q !== null &&
        typeof (q as SavedQuestion).id === 'string' &&
        typeof (q as SavedQuestion).text === 'string' &&
        typeof (q as SavedQuestion).askedAt === 'number',
    );
  } catch {
    return [];
  }
}

/** Saves (newest first, deduped by trimmed text, capped). Returns the list. */
export async function saveQuestion(text: string): Promise<SavedQuestion[]> {
  const trimmed = text.trim();
  const existing = await getSavedQuestions();
  if (!trimmed) return existing;
  const kept = existing.filter((q) => q.text.toLowerCase() !== trimmed.toLowerCase());
  const next = [
    { id: `${Date.now()}-${trimmed.length}`, text: trimmed, askedAt: Date.now() },
    ...kept,
  ].slice(0, MAX_QUESTIONS);
  await AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
  return next;
}

export async function deleteQuestion(id: string): Promise<SavedQuestion[]> {
  const next = (await getSavedQuestions()).filter((q) => q.id !== id);
  await AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
  return next;
}
