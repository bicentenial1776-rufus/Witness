import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from 'react';

/**
 * Whether this DEVICE has walked the narrative. Device-scoped by necessity:
 * the narrative now plays before any account exists (ux audit batch 4 — show
 * the value, and the price, before asking for the email). A returning reader
 * on a fresh install sees it once more and leaves through its Sign in link;
 * the old per-account profiles.onboarding_completed_at stays written for
 * history but no longer routes anything.
 */
const KEY = 'witness.narrative-seen';

const NarrativeContext = createContext<{
  /** null while the stored flag is still being read — hold the splash on it. */
  seen: boolean | null;
  markSeen: () => void;
}>({ seen: null, markSeen: () => {} });

export function NarrativeProvider({ children }: PropsWithChildren) {
  const [seen, setSeen] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((value) => setSeen(value === '1'))
      .catch(() => setSeen(false));
  }, []);

  function markSeen() {
    setSeen(true);
    AsyncStorage.setItem(KEY, '1').catch(() => {});
  }

  return (
    <NarrativeContext.Provider value={{ seen, markSeen }}>{children}</NarrativeContext.Provider>
  );
}

export function useNarrative() {
  return useContext(NarrativeContext);
}
