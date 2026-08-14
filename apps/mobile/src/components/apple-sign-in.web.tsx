/**
 * Sign in with Apple is native-only for now: the web flow needs a Services
 * ID + redirect configuration that the app's bundle-id flow does not, and
 * email + password already works everywhere on web. Rendering nothing keeps
 * the auth screens' layout identical rather than quietly downgraded.
 */
export function AppleSignInButton(_props: { intent: 'sign-in' | 'sign-up' }) {
  return null;
}
