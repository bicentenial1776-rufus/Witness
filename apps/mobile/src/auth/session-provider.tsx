import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { supabase } from '@/lib/supabase';
import { logEvent } from '@/lib/usage-events';

interface SessionContextValue {
  session: Session | null;
  isLoading: boolean;
}

const SessionContext = createContext<SessionContextValue>({ session: null, isLoading: true });

export function SessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsLoading(false);
    });

    // A session restored from storage on cold start arrives as
    // INITIAL_SESSION (auth-js 2.x), so SIGNED_IN is a real sign-in: a
    // password, Apple, a magic link, or the dev auto-login. SIGNED_OUT
    // isn't logged: by the time it fires, the client's own token is already
    // cleared, so an insert would just fail RLS's auth.uid() check.
    const { data: subscription } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      if (event === 'SIGNED_IN' && newSession) {
        void logEvent(newSession.user.id, 'login');
      }
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  return <SessionContext.Provider value={{ session, isLoading }}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  return useContext(SessionContext);
}
