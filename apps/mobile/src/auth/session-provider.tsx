import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { Platform } from 'react-native';
import { clearTreeIndexCopies } from '@/lib/offline-tree';
import { supabase } from '@/lib/supabase';
import { invalidateTreeIndexCache } from '@/lib/tree-index-cache';
import { logEvent } from '@/lib/usage-events';

interface SessionContextValue {
  session: Session | null;
  isLoading: boolean;
}

const SessionContext = createContext<SessionContextValue>({ session: null, isLoading: true });

export function SessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Whether a session was already held before the latest auth event.
  const hadSession = useRef(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) hadSession.current = true;
      setIsLoading(false);
    });

    // A session restored from storage on cold start arrives as
    // INITIAL_SESSION (auth-js 2.x). SIGNED_IN is a real sign-in — a
    // password, Apple, a magic link, or the dev auto-login — but on the web
    // auth-js also fires SIGNED_IN every time a tab regains focus with a
    // live session, which counted ~35 "logins" a day per user on the
    // operator dashboard (2026-09-17). A login is the transition from no
    // session to a session; with one already held it is a focus event.
    // SIGNED_OUT isn't logged: by the time it fires, the client's own token
    // is already cleared, so an insert would just fail RLS's auth.uid() check.
    const { data: subscription } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      const wasSignedIn = hadSession.current;
      hadSession.current = !!newSession;
      if (event === 'SIGNED_OUT') {
        invalidateTreeIndexCache();
        // A shared computer must not keep the tree in IndexedDB after sign-
        // out; the phone's field copy is a document and stays.
        if (Platform.OS === 'web') clearTreeIndexCopies();
      }
      if (event === 'SIGNED_IN' && newSession && !wasSignedIn) {
        // isPad only means something on iOS — Platform.isPad is undefined
        // elsewhere, same guard as useBroadsheet.
        void logEvent(newSession.user.id, 'login', {
          platform: Platform.OS,
          ...(Platform.OS === 'ios' ? { isPad: Platform.isPad === true } : {}),
        });
      }
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  return <SessionContext.Provider value={{ session, isLoading }}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  return useContext(SessionContext);
}
