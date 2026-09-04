import { Stack } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

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
 * The world lives in apps/mobile/public/world/, put there by
 *
 *     npm run world:sync -w @witness/fsv
 *
 * from the top of the repository. Expo copies the app's public folder into
 * the DOM panel's own folder at build time, so the panel opens the world by
 * this plain relative path. It is deliberately NOT a Metro require(): the
 * first iPad reading (2026-09-04) came up black because, for a file outside
 * the app's own folder, the Release-build asset resolver hands back an
 * address that does not exist in the binary. The public folder is
 * git-ignored at the repository root, so the world cannot be committed by
 * accident.
 *
 * The price of not going through require() is that a build no longer stops
 * when the world is missing; it ships a panel that opens on nothing. Run the
 * copy step first.
 */
const WORLD_PATH = 'world/witness_fsv_demo.html';

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
        <FsvWorldDom
          path={measured(WORLD_PATH)}
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
      </View>

      <View style={[styles.bar, { borderTopColor: theme.border, backgroundColor: theme.background }]}>
        <Text style={[styles.note, { color: theme.textSecondary }]}>
          The world above is the copy shipped inside the app. Its measuring panel is already
          up, in the top-left corner; press Walk 10 minutes there.
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
