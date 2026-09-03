import { Stack } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import FsvWorldDom from '@/components/fsv-world-dom';
import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * THE FIELD — a door into the walkable world, and nothing else.
 *
 * This screen is deliberately hidden. It is not a tab, no other screen links
 * to it, and nothing in the app mentions it; the only way in is to type its
 * address. That is what the bridge brief asks for — the week-six spike
 * behind a hidden route, not a tab — because the world has never run on a
 * device inside this app and an unmeasured door does not belong in anyone's
 * way.
 *
 * On a device: open Safari and type
 *
 *     mobile://field
 *
 * or, from a Mac with the phone or tablet attached,
 *
 *     npx uri-scheme open mobile://field --ios
 *
 * There are two doors here, onto the same world.
 *
 *   The main door is the world shipped inside the app: the built page is
 *   copied into this repository by the copy step, carried inside the app
 *   binary, and shown in a web view. This is the one the week is trying to
 *   measure, and the one nobody has run yet.
 *
 *   The fallback door is one button that opens the hosted world in the
 *   app's own built-in browser view — the same one the ancestor screen and
 *   the field guide already use. It needs nothing new added to the app, so
 *   if the main door comes up blank the session still yields a number.
 *
 * The world switches its own measuring readout on when the address ends in
 * `#measure`, which is what this screen hands it, because taking a number is
 * the only reason the screen exists.
 */

/**
 * The address of the hosted world, for the fallback door.
 *
 * There is no hosted world yet, so this is empty and the fallback button
 * says so rather than pretending. Greg or Rufus fills in the address here
 * — the page that serves the built world — and the second door starts
 * working with no other change. Leave the `#measure` off the end: the code
 * below adds it.
 */
const HOSTED_WORLD = '';

/**
 * The world as a file inside the app.
 *
 * `require` rather than an import, because this is not code: it is a page
 * the app carries and hands to a web view whole. Metro is told a web page
 * counts as a shippable file in metro.config.js; without that line this
 * does not resolve and the app does not build.
 *
 * The path reaches out of this app and into the one home the monorepo gives
 * the world, apps/fsv/public/world, rather than keeping a second copy under
 * this app. Two reasons, and the second is the one that decided it. The
 * world is three megabytes, rebuilt every time it changes, and belongs to
 * another repository; that folder is the only place set up to hold it, and
 * it is the one folder git is told to ignore, so the world cannot be
 * committed into this repository by accident. Anywhere under this app's own
 * files would be tracked, and a copy step that writes three megabytes over
 * a tracked file is one careless commit away from putting the world into
 * this history for good.
 *
 * The price is that the world has to be there before the app is built. Run
 *
 *     npm run world:sync -w @witness/fsv
 *
 * from the top of the repository first. Skip it and the build stops with
 * "unable to resolve", naming this file — a loud failure with an obvious
 * cure, chosen over a quiet one that ships a stand-in page pretending to be
 * the world.
 */
const WORLD_URI: string | null = (() => {
  try {
    const source = Image.resolveAssetSource(
      require('../../../../fsv/public/world/witness_fsv_demo.html')
    );
    return source?.uri ?? null;
  } catch {
    return null;
  }
})();

/** The same address with the world's measuring readout switched on. */
function measured(uri: string): string {
  return uri.includes('#') ? uri : `${uri}#measure`;
}

export default function FieldScreen() {
  const theme = useTheme();

  const openHosted = () => {
    if (!HOSTED_WORLD) return;
    WebBrowser.openBrowserAsync(measured(HOSTED_WORLD)).catch(() => {});
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ title: 'The Field' }} />

      <View style={styles.world}>
        {WORLD_URI ? (
          <FsvWorldDom
            uri={measured(WORLD_URI)}
            dom={{
              style: styles.world,
              // A world you walk by dragging must not have the page scroll
              // out from under the drag, and it must never bounce at the
              // edges: both read as the world slipping.
              scrollEnabled: false,
              bounces: false,
              // So Safari's Web Inspector on a Mac can see the world's own
              // log while it runs on the device. Without this the inspector
              // lists the app and shows nothing inside it.
              webviewDebuggingEnabled: true,
            }}
          />
        ) : (
          <View style={styles.empty}>
            <Text style={[styles.body, { color: theme.textSecondary }]}>
              The app is not carrying a copy of the world. Run the copy step at the top of the
              repository, build again, and this door will open on it. The button below opens the
              hosted world instead.
            </Text>
          </View>
        )}
      </View>

      <View style={[styles.bar, { borderTopColor: theme.border, backgroundColor: theme.background }]}>
        <Text style={[styles.note, { color: theme.textSecondary }]}>
          {WORLD_URI
            ? 'The world above is the copy shipped inside the app. Three taps in its top-left corner show the numbers.'
            : 'No copy of the world is shipped inside the app.'}
        </Text>
        <Pressable
          accessibilityRole="button"
          disabled={!HOSTED_WORLD}
          onPress={openHosted}
          style={({ pressed }) => [
            styles.button,
            {
              borderColor: theme.border,
              backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement,
              opacity: HOSTED_WORLD ? 1 : 0.5,
            },
          ]}
        >
          <Text style={[styles.buttonLabel, { color: theme.accent }]}>
            {HOSTED_WORLD ? 'Open the hosted world instead' : 'No hosted address yet'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  world: { flex: 1 },
  empty: { flex: 1, justifyContent: 'center', padding: Spacing.four },
  body: { fontFamily: Fonts.serif, fontSize: 16, lineHeight: 24 },
  bar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Platform.OS === 'ios' ? Spacing.three : Spacing.two,
    gap: Spacing.two,
  },
  note: { fontFamily: Fonts.mono, fontSize: 12, lineHeight: 18 },
  button: {
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
  },
  buttonLabel: { fontFamily: Fonts.sans, fontSize: 15, fontWeight: '600' },
});
