import { Alert } from 'react-native';

/** Native alert dialog. See alert.web.ts — react-native-web's Alert.alert is a no-op stub. */
export function showAlert(title: string, message?: string): void {
  Alert.alert(title, message);
}

/** Cancel-or-confirm for destructive actions; runs onConfirm only on confirm. */
export function showDestructiveConfirm(
  title: string,
  message: string,
  confirmLabel: string,
  onConfirm: () => void,
): void {
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
}
