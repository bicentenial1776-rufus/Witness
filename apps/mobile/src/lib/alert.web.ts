/** react-native-web's Alert.alert() is a no-op stub, so sign-up/sign-in errors and
 * confirmations were silently swallowed on web. window.alert is the closest native
 * equivalent — a blocking dialog the reader actually sees. */
export function showAlert(title: string, message?: string): void {
  window.alert(message ? `${title}\n\n${message}` : title);
}

/** Cancel-or-confirm for destructive actions; runs onConfirm only on confirm. */
export function showDestructiveConfirm(
  title: string,
  message: string,
  _confirmLabel: string,
  onConfirm: () => void,
): void {
  if (window.confirm(`${title}\n\n${message}`)) onConfirm();
}
