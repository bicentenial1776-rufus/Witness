import { Stack } from 'expo-router';

import { NearMe } from '@/components/near-me';

/**
 * The Near me experience as a routable page. On the phone the Map tab
 * embeds <NearMe/> directly as a mode; this route exists for the web
 * carrier (see nearby.web.tsx for its broadsheet layout) and for anything
 * that deep-links to /nearby now that the tab is gone.
 */
export default function NearbyScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Near me' }} />
      <NearMe />
    </>
  );
}
