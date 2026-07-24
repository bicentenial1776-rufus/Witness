import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';

/**
 * Everything the root layout needs from expo-notifications, isolated here
 * so the web bundle (notification-routing.web.ts) never imports the
 * native module.
 */

/** Show digest notifications even when the app is foregrounded. */
export function installNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

/** Tapping a notification deep-links to the screen named in its data. */
export function useNotificationDeepLinks(): void {
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const url = response.notification.request.content.data?.url;
      if (typeof url === 'string') router.push(url as never);
    });
    return () => subscription.remove();
  }, []);
}
