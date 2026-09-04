'use dom';

/**
 * The walkable world, running inside the app.
 *
 * This is a DOM component: it is bundled as its own small web page and shown
 * in a web-page panel, and the world is put inside it as an iframe. The
 * world is the single self-contained page the design repository builds.
 *
 * How the world is found. Expo copies everything in apps/mobile/public/ into
 * the folder this page lives in (www.bundle inside the app; served at the
 * root by the dev server), so the world is opened by a plain path relative
 * to this page — no asset resolver in between. The path is *not* passed
 * through Metro's require(): for a file outside the app's own folder the
 * Release resolver builds an address that does not exist in the binary, and
 * the panel paints black. That was the first iPad reading (2026-09-04).
 *
 * `npm run world:sync -w @witness/fsv` puts the world in place.
 */
import type { DOMProps } from 'expo/dom';

export default function FsvWorldDom({ path }: { path: string; dom?: DOMProps }) {
  // Inside the binary this page is a file:// URL and the world sits beside
  // it. On the dev server this page is served under /_expo/@dom/, while the
  // public folder is served from the root, so there the path is absolute.
  const fromFile = typeof location !== 'undefined' && location.protocol === 'file:';
  const src = fromFile ? path : `/${path}`;
  return (
    <iframe
      src={src}
      title="The walkable world"
      allow="fullscreen; accelerometer; gyroscope"
      // Squared off, edge to edge, no chrome of its own: the world supplies
      // all of its own furniture, and a border or a margin here would read
      // as part of the world rather than as part of the app.
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        border: 'none',
        margin: 0,
        background: '#000',
      }}
    />
  );
}
