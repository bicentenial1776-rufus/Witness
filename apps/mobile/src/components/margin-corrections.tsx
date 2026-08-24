import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { correctionSnapshot, subjectKey, subjectLabel } from '@witness/core/corrections';

import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { showAlert, showDestructiveConfirm } from '@/lib/alert';
import {
  addCorrection,
  deleteCorrection,
  fetchCorrectionsForPerson,
  setCorrectionStatus,
  updateCorrection,
  type CorrectionRow,
} from '@/lib/corrections';
import { Fonts } from '@/constants/theme';

/**
 * "In the margin" — the corrections a researcher pencils beside a person's
 * facts (Katie's round-trip arc; the piece b7e88ee deferred). The moment
 * you spot that her birth year is wrong is rarely the moment you're sitting
 * at Ancestry, so the annotation is written here, beside the record, and
 * travels to the source on the punch list. It NEVER changes the record
 * above — same covenant as the ancestor note, structured enough to export.
 *
 * Unlike the note this saves on an explicit button: a correction is a
 * structured row with a status, not a stream of prose.
 */

interface MarginPerson {
  id: string;
  tree_id: string;
  full_name: string;
  birth_year: number | null;
  death_year: number | null;
}

interface MarginEvent {
  event_type: string;
  date_year: number | null;
  date_raw: string | null;
  places: { raw: string } | null;
}

interface FactChoice {
  key: string;
  label: string;
  recordSays: string | null;
}

const eventLine = (event: MarginEvent): string =>
  [event.date_raw ?? (event.date_year != null ? String(event.date_year) : null), event.places?.raw]
    .filter(Boolean)
    .join(' · ') || 'No date or place recorded';

/** The facts a correction can attach to, from what this screen already holds. */
function factChoices(person: MarginPerson, events: readonly MarginEvent[]): FactChoice[] {
  const vital = (kind: 'birth' | 'death'): FactChoice => {
    const event = events.find((e) => e.event_type === kind);
    const year = kind === 'birth' ? person.birth_year : person.death_year;
    return {
      key: kind,
      label: subjectLabel(kind),
      recordSays: event ? eventLine(event) : year != null ? String(year) : null,
    };
  };
  const choices: FactChoice[] = [
    { key: 'name', label: subjectLabel('name'), recordSays: person.full_name },
    vital('birth'),
    vital('death'),
  ];
  for (const event of events) {
    if (event.event_type === 'birth' || event.event_type === 'death') continue;
    const key =
      event.event_type === 'burial'
        ? 'burial'
        : subjectKey({ kind: 'event', eventType: event.event_type, year: event.date_year });
    if (choices.some((c) => c.key === key)) continue;
    choices.push({ key, label: subjectLabel(key), recordSays: eventLine(event) });
  }
  choices.push(
    { key: 'parents', label: subjectLabel('parents'), recordSays: null },
    { key: 'spouse', label: subjectLabel('spouse'), recordSays: null },
    { key: 'other', label: subjectLabel('other'), recordSays: null },
  );
  return choices;
}

export function MarginCorrections({
  person,
  events,
  onChanged,
}: {
  person: MarginPerson;
  events: readonly MarginEvent[];
  onChanged: (open: CorrectionRow[]) => void;
}) {
  const theme = useTheme();
  const [rows, setRows] = useState<CorrectionRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<FactChoice | null>(null);
  const [correctedValue, setCorrectedValue] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;

  const publish = (next: CorrectionRow[]) => {
    setRows(next);
    onChangedRef.current(next.filter((r) => r.status === 'open'));
  };

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setAdding(false);
    setPicked(null);
    setCorrectedValue('');
    setNote('');
    void fetchCorrectionsForPerson(person.id).then((data) => {
      if (cancelled) return;
      setRows(data);
      onChangedRef.current(data.filter((r) => r.status === 'open'));
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [person.id]);

  const choices = factChoices(person, events);
  /** Picking a fact that already carries an open correction edits it. */
  const editing = picked
    ? (rows.find((r) => r.subject === picked.key && r.status === 'open') ?? null)
    : null;

  function pick(choice: FactChoice) {
    const existing = rows.find((r) => r.subject === choice.key && r.status === 'open');
    setPicked(choice);
    setCorrectedValue(existing?.corrected_value ?? '');
    setNote(existing?.note ?? '');
  }

  async function save() {
    if (!picked || !correctedValue.trim() || saving) return;
    setSaving(true);
    const trimmedNote = note.trim() || null;
    const saved = editing
      ? await updateCorrection(editing.id, {
          correctedValue: correctedValue.trim(),
          note: trimmedNote,
        })
      : await addCorrection({
          individualId: person.id,
          treeId: person.tree_id,
          subject: picked.key,
          currentValue: picked.recordSays,
          snapshotKey: correctionSnapshot(picked.key, person),
          correctedValue: correctedValue.trim(),
          note: trimmedNote,
        });
    setSaving(false);
    if (!saved) {
      showAlert("Couldn't save", 'Check your connection and try again.');
      return;
    }
    publish(editing ? rows.map((r) => (r.id === saved.id ? saved : r)) : [...rows, saved]);
    setAdding(false);
    setPicked(null);
    setCorrectedValue('');
    setNote('');
  }

  async function toggleStatus(row: CorrectionRow) {
    const next = row.status === 'open' ? 'resolved' : 'open';
    const saved = await setCorrectionStatus(row.id, next);
    if (saved) publish(rows.map((r) => (r.id === saved.id ? saved : r)));
  }

  function remove(row: CorrectionRow) {
    showDestructiveConfirm(
      'Erase this correction?',
      'This removes your pencilled note from the margin. The record itself was never changed.',
      'Erase',
      () => {
        void deleteCorrection(row.id).then((ok) => {
          if (ok) publish(rows.filter((r) => r.id !== row.id));
        });
      },
    );
  }

  if (!loaded) return null;

  return (
    <>
      <ThemedText type="subtitle" style={{ marginTop: 16 }}>
        In the margin
      </ThemedText>

      {rows.map((row) => (
        <View
          key={row.id}
          style={{
            borderWidth: 1,
            borderColor: theme.border,
            borderLeftWidth: 2,
            borderLeftColor: row.status === 'open' ? theme.accent : theme.border,
            borderRadius: 2,
            padding: 12,
            gap: 4,
            opacity: row.status === 'resolved' ? 0.6 : 1,
          }}
        >
          <Text
            style={{
              fontFamily: Fonts.mono,
              fontSize: 13,
              letterSpacing: 1.2,
              textTransform: 'uppercase',
              color: row.status === 'open' ? theme.accent : theme.textSecondary,
            }}
          >
            {subjectLabel(row.subject)}
            {row.status === 'resolved' ? '  ·  entered at the source' : ''}
          </Text>
          {row.current_value && (
            <Text style={{ fontFamily: Fonts.mono, fontSize: 12, color: theme.textSecondary }}>
              Record says: {row.current_value}
            </Text>
          )}
          <Text style={{ fontFamily: Fonts.mono, fontSize: 12, color: theme.text }}>
            Should be: {row.corrected_value}
          </Text>
          {row.note && (
            <ThemedText type="small" style={{ fontStyle: 'italic' }}>
              {row.note}
            </ThemedText>
          )}
          <View style={{ flexDirection: 'row', gap: 16, marginTop: 4 }}>
            <Pressable onPress={() => void toggleStatus(row)}>
              <ThemedText type="smallBold" themeColor="accent">
                {row.status === 'open' ? 'Entered at the source ✓' : 'Reopen'}
              </ThemedText>
            </Pressable>
            <Pressable onPress={() => remove(row)}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                Erase
              </ThemedText>
            </Pressable>
          </View>
        </View>
      ))}

      {!adding ? (
        <Pressable onPress={() => setAdding(true)}>
          <ThemedText type="smallBold" themeColor="accent">
            ✎ Correct the record ›
          </ThemedText>
        </Pressable>
      ) : (
        <View
          style={{
            backgroundColor: theme.backgroundElement,
            borderWidth: 1,
            borderColor: theme.border,
            borderLeftWidth: 2,
            borderLeftColor: theme.accent,
            borderRadius: 2,
            padding: 14,
            gap: 10,
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
            Which fact?
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {choices.map((choice) => {
              const selected = picked?.key === choice.key;
              return (
                <Pressable
                  key={choice.key}
                  onPress={() => pick(choice)}
                  style={{
                    borderWidth: 1,
                    borderColor: selected ? theme.accent : theme.border,
                    borderRadius: 2,
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: Fonts.mono,
                      fontSize: 13,
                      color: selected ? theme.accent : theme.textSecondary,
                    }}
                  >
                    {choice.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {picked && (
            <>
              {picked.recordSays && (
                <Text style={{ fontFamily: Fonts.mono, fontSize: 12, color: theme.textSecondary }}>
                  Record says: {picked.recordSays}
                </Text>
              )}
              <TextField
                value={correctedValue}
                onChangeText={setCorrectedValue}
                placeholder="Should be…"
              />
              <TextField
                value={note}
                onChangeText={setNote}
                multiline
                style={{ minHeight: 64, textAlignVertical: 'top' }}
                placeholder="Why — the source or reasoning, if you want it on the punch list."
              />
              <Button
                title={saving ? 'Saving…' : editing ? 'Update the margin' : 'Add to the margin'}
                disabled={saving || !correctedValue.trim()}
                onPress={() => void save()}
              />
            </>
          )}
          <Pressable
            onPress={() => {
              setAdding(false);
              setPicked(null);
            }}
          >
            <ThemedText type="small" themeColor="textSecondary">
              Never mind
            </ThemedText>
          </Pressable>
        </View>
      )}

      <ThemedText type="small" themeColor="textSecondary">
        Only you see these, and they never change the record above. They travel on the punch list —
        the fix itself belongs at the source.
      </ThemedText>
    </>
  );
}
