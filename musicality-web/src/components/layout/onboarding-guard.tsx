'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';

/**
 * Client-side safety net: if user is logged in but hasn't completed
 * onboarding (no nickname), redirect them to /onboarding.
 * This catches cases where the auth callback didn't redirect properly.
 */
export function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Wait until auth is fully loaded
    if (loading) return;
    // Not logged in — nothing to guard
    if (!user) return;
    // Already on onboarding page — don't redirect loop
    if (pathname === '/onboarding') return;

    // User is logged in but no nickname set → needs onboarding
    // profile === null means either not loaded yet or doesn't exist — both need onboarding
    // profile.nickname === null means profile exists but onboarding not completed
    if (!profile?.nickname) {
      // Small delay to allow profile to load on first render
      const timer = setTimeout(() => {
        if (!profile?.nickname) {
          router.replace('/onboarding');
        }
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [loading, user, profile, pathname, router]);

  return <>{children}</>;
}
