import { Alert } from 'react-native';

/** Native alert dialog. See alert.web.ts — react-native-web's Alert.alert is a no-op stub. */
export function showAlert(title: string, message?: string): void {
  Alert.alert(title, message);
}
