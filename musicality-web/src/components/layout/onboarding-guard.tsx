'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';

/**
 * Client-side safety net: if user is logged in but hasn't completed
 * onboarding (no nickname), redirect them to /onboarding.
 * Shows a loading screen while checking — never flashes main content.
 */
export function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!user) return;
    if (pathname === '/onboarding') return;

    // User is logged in but no nickname → needs onboarding
    if (!profile?.nickname) {
      router.replace('/onboarding');
    }
  }, [loading, user, profile, pathname, router]);

  // Still loading auth + profile
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  // Logged in but no nickname — show loading while redirecting to onboarding
  if (user && !profile?.nickname) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return <>{children}</>;
}
