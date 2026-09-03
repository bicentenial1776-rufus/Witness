'use dom';

/**
 * The walkable world, running inside the app.
 *
 * This is an Expo DOM component: the directive above tells the bundler to
 * compile this file as a web page and show it in a web view, rather than as
 * a native screen. It is the first one in this app — nothing here has used
 * `'use dom'` before — so treat its first run on a device as the experiment
 * it is, not as settled ground.
 *
 * The world itself is not written in React. It is a single self-contained
 * page, built in the design repository and copied into the app, which draws
 * its own canvas and runs its own loop. So this component does one thing:
 * it hands that page a frame to fill. The frame is a plain inline frame
 * pointed at the copied file, which the web view can read because it opens
 * its own page from the same file store.
 *
 * Why the world is not simply drawn here: it is three megabytes of one
 * page, and the point of the exercise is to measure that page exactly as it
 * is, unchanged, on the device. Anything that rewrote or re-wrapped it
 * would be measuring something else.
 *
 * The address it is given already carries the measuring switch, because the
 * only reason this screen exists is to take a number.
 */

import type { DOMProps } from 'expo/dom';

export default function FsvWorldDom({ uri }: { uri: string; dom?: DOMProps }) {
  return (
    <iframe
      src={uri}
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
