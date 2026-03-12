'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase-client';
import type { Profile } from '@/lib/types';
import { fetchMyProfile } from '@/lib/api';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const supabase = createClient();

  const loadProfile = useCallback(async () => {
    const p = await fetchMyProfile(supabase);
    setProfile(p);
  }, [supabase]);

  useEffect(() => {
    // Get initial session
    supabase.auth.getUser().then(({ data: { user: u } }) => {
      setUser(u);
      if (u) loadProfile();
      setLoading(false);
    });

    // Listen to auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadProfile();
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    router.push('/');
  }, [supabase, router]);

  /** Profile is complete when nickname is set (onboarding done) */
  const isProfileComplete = !!profile?.nickname;

  return {
    user,
    profile,
    loading,
    signOut,
    refreshProfile: loadProfile,
    isProfileComplete,
  };
}
