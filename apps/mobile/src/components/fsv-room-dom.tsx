'use dom';

/**
 * A ROOM, RUNNING INSIDE THE APP.
 *
 * A DOM component, like fsv-world-dom: bundled as its own small web page
 * and shown in a web-page panel, with the room page inside it as an
 * iframe. The room page is the design repository's census day page, copied
 * in beside the world by `npm run world:sync -w @witness/fsv`.
 *
 * What this page does that the world's panel does not: it is HANDED THE
 * HOUSEHOLD. The room page carries no record of anybody's family; the app
 * reads the household from the tree on the device (@witness/core/fsv,
 * fsvHouseholdRecord) and this posts it into the frame
 * ({type:'fsv-household', record, day}). The room decides which house that
 * household stands in from the same catalogue the world uses, builds it,
 * and reports back ({type:'fsv-state'}) — which is how the bar above the
 * room knows the hour, the weather, whether the fire is lit and whether the
 * sound is on. The bar's four controls are the hall's, sent down the same
 * way ({type:'fsv-set'}).
 *
 * And it SAYS HOW IT WENT, once, through `onOutcome`: the room came up
 * (with the milliseconds it took); the world had no room for this household
 * (the page says so, and the bar says so); nothing came back in twenty
 * seconds, which is what a black panel looks like from here; or the page
 * threw. The screen writes that one line to the server (fsv_room_log). It
 * is the rooms' error report, and the only one the app has.
 *
 * Untested on a device as of 19 September 2026: this is the dark branch.
 * The same exchange is proved every build in the design repo's stand-in
 * (witness_standin/build/walk.js), on the same room page, over a file://
 * frame — which is the stricter case.
 */
import type { DOMProps } from 'expo/dom';
import { useEffect, useRef, useState } from 'react';

interface RoomState { hour?: string; hourLabel?: string; weather?: string; fire?: boolean; sound?: boolean; year?: number; people?: number }
export type RoomOutcome = 'opened' | 'no-room' | 'timed-out' | 'failed';

const PATIENCE_MS = 20000;

export default function FsvRoomDom({ path, record, day, title, onOutcome }: {
  path: string; record: unknown; day: number; title: string;
  onOutcome?: (outcome: RoomOutcome, ms: number, note: string) => Promise<void>;
  dom?: DOMProps;
}) {
  const fromFile = typeof location !== 'undefined' && location.protocol === 'file:';
  const src = (fromFile ? path : `/${path}`) + '#embed=1&wait=1';
  const frame = useRef<HTMLIFrameElement>(null);
  const [st, setSt] = useState<RoomState>({});
  const [up, setUp] = useState(false);
  const [noRoom, setNoRoom] = useState<string | null>(null);
  const told = useRef(false);
  const t0 = useRef(Date.now());
  const tell = (m: Record<string, unknown>) => { try { frame.current?.contentWindow?.postMessage({ type: 'fsv-set', ...m }, '*'); } catch { /* not up yet */ } };
  const say = (outcome: RoomOutcome, note = '') => {
    if (told.current) return;
    told.current = true;
    void onOutcome?.(outcome, Date.now() - t0.current, note).catch(() => { /* the report is not the room */ });
  };
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const m = e.data;
      if (!m || typeof m.type !== 'string' || !m.type.startsWith('fsv-')) return;
      if (m.type === 'fsv-ready') { try { frame.current?.contentWindow?.postMessage({ type: 'fsv-household', record, day }, '*'); } catch { /* not up yet */ } return; }
      if (m.type === 'fsv-noroom') { setNoRoom(String(m.why ?? '')); say('no-room', String(m.why ?? '')); return; }
      if (m.type !== 'fsv-state' && m.type !== 'fsv-room') return;
      setUp(true);
      say('opened');
      if (m.type === 'fsv-state') setSt({ hour: m.hour, hourLabel: m.hourLabel, weather: m.weather, fire: m.fire, sound: m.sound, year: m.year, people: m.people });
    };
    const onErr = (e: ErrorEvent) => say('failed', String(e.message ?? 'error'));
    const late = setTimeout(() => say('timed-out'), PATIENCE_MS);
    addEventListener('message', onMsg);
    addEventListener('error', onErr);
    return () => { removeEventListener('message', onMsg); removeEventListener('error', onErr); clearTimeout(late); };
  }, [record, day]);
  const chip = (label: string, on: boolean, onClick: () => void) => (
    <button onClick={onClick} style={{ font: '500 13px "IBM Plex Mono", ui-monospace, monospace', padding: '8px 12px', border: '1px solid ' + (on ? '#B4501A' : '#C9BEAA'), color: on ? '#B4501A' : '#17140F', background: '#FCFAF6', cursor: 'pointer' }}>{label}</button>
  );
  const word = st.year ? `${st.year}${st.people ? ` · ${st.people} at home` : ''}` : noRoom ? 'The world has no room for this household yet.' : (up ? '' : 'Opening the room…');
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateRows: 'auto 1fr', background: '#000', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: '#F0ECE3', borderBottom: '1px solid #C9BEAA', color: '#17140F' }}>
        <div style={{ font: '600 16px "Playfair Display", Georgia, serif' }}>{title}</div>
        <div style={{ font: '13px "IBM Plex Mono", ui-monospace, monospace', color: '#6B6257' }}>{word}</div>
        <div style={{ flex: 1 }} />
        {chip(st.hourLabel || 'hour', st.hour !== 'night', () => tell({ hour: 'next', begin: true }))}
        {chip(st.weather || 'weather', !!st.weather && st.weather !== 'clear', () => tell({ weather: 'next', begin: true }))}
        {chip(st.fire === false ? 'light fire' : 'douse fire', st.fire !== false, () => tell({ fire: st.fire === false, begin: true }))}
        {chip(st.sound === false ? 'silent' : 'sound', st.sound !== false, () => tell({ sound: st.sound === false, begin: true }))}
      </div>
      <iframe ref={frame} src={src} title="The room" allow="fullscreen; autoplay; accelerometer; gyroscope"
        style={{ width: '100%', height: '100%', border: 'none', margin: 0, background: '#000' }} />
    </div>
  );
}
