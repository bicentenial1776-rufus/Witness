import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';

import { useSession } from '@/auth/session-provider';
import { supabase } from '@/lib/supabase';

interface ProfileContextValue {
  isLoading: boolean;
  onboardingCompleted: boolean;
  markOnboardingComplete: () => Promise<void>;
}

const ProfileContext = createContext<ProfileContextValue>({
  isLoading: true,
  onboardingCompleted: false,
  markOnboardingComplete: async () => {},
});

/**
 * The onboarding-narrative flow (Problem → Temporal → Geographic →
 * Remarkable Lives → Invitation) runs once per account, tracked server
 * side on `profiles` — a trigger inserts the row at signup, so this only
 * ever reads and updates one existing row.
 */
export function ProfileProvider({ children }: PropsWithChildren) {
  const { session } = useSession();
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!session) {
      setOnboardingCompleted(false);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    supabase
      .from('profiles')
      .select('onboarding_completed_at')
      .eq('id', session.user.id)
      .single()
      .then(({ data, error }) => {
        if (error) console.warn('Failed to load profile', error);
        setOnboardingCompleted(Boolean(data?.onboarding_completed_at));
        setIsLoading(false);
      });
  }, [session]);

  async function markOnboardingComplete() {
    if (!session) return;
    const { error } = await supabase
      .from('profiles')
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq('id', session.user.id);
    if (error) {
      console.warn('Failed to save onboarding completion', error);
      return;
    }
    setOnboardingCompleted(true);
  }

  return (
    <ProfileContext.Provider value={{ isLoading, onboardingCompleted, markOnboardingComplete }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile(): ProfileContextValue {
  return useContext(ProfileContext);
}
