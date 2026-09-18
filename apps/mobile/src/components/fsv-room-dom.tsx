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
 * Untested on a device as of 19 September 2026: this is the dark branch.
 * The same exchange is proved every build in the design repo's stand-in
 * (witness_standin/build/walk.js), on the same room page, over a file://
 * frame — which is the stricter case.
 */
import type { DOMProps } from 'expo/dom';
import { useEffect, useRef, useState } from 'react';

interface RoomState { hour?: string; hourLabel?: string; weather?: string; fire?: boolean; sound?: boolean; year?: number; people?: number }

export default function FsvRoomDom({ path, record, day, title }: { path: string; record: unknown; day: number; title: string; dom?: DOMProps }) {
  const fromFile = typeof location !== 'undefined' && location.protocol === 'file:';
  const src = (fromFile ? path : `/${path}`) + '#embed=1&wait=1';
  const frame = useRef<HTMLIFrameElement>(null);
  const [st, setSt] = useState<RoomState>({});
  const [up, setUp] = useState(false);
  const tell = (m: Record<string, unknown>) => { try { frame.current?.contentWindow?.postMessage({ type: 'fsv-set', ...m }, '*'); } catch { /* not up yet */ } };
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const m = e.data;
      if (!m || (m.type !== 'fsv-state' && m.type !== 'fsv-room' && m.type !== 'fsv-ready')) return;
      if (m.type === 'fsv-ready') { try { frame.current?.contentWindow?.postMessage({ type: 'fsv-household', record, day }, '*'); } catch { /* not up yet */ } return; }
      setUp(true);
      if (m.type === 'fsv-state') setSt({ hour: m.hour, hourLabel: m.hourLabel, weather: m.weather, fire: m.fire, sound: m.sound, year: m.year, people: m.people });
    };
    addEventListener('message', onMsg);
    return () => removeEventListener('message', onMsg);
  }, [record, day]);
  const chip = (label: string, on: boolean, onClick: () => void) => (
    <button onClick={onClick} style={{ font: '500 13px "IBM Plex Mono", ui-monospace, monospace', padding: '8px 12px', border: '1px solid ' + (on ? '#B4501A' : '#C9BEAA'), color: on ? '#B4501A' : '#17140F', background: '#FCFAF6', cursor: 'pointer' }}>{label}</button>
  );
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateRows: 'auto 1fr', background: '#000', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: '#F0ECE3', borderBottom: '1px solid #C9BEAA', color: '#17140F' }}>
        <div style={{ font: '600 16px "Playfair Display", Georgia, serif' }}>{title}</div>
        <div style={{ font: '13px "IBM Plex Mono", ui-monospace, monospace', color: '#6B6257' }}>{st.year ? `${st.year}${st.people ? ` · ${st.people} at home` : ''}` : (up ? '' : 'Opening the room…')}</div>
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
