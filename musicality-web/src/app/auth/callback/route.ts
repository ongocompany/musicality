import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const redirect = searchParams.get('redirect') || '/crews';

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error('[auth/callback] exchangeCodeForSession error:', error.message);
      return NextResponse.redirect(`${origin}/login`);
    }

    const userId = data?.session?.user?.id ?? data?.user?.id;

    if (userId) {
      // Small delay to allow DB trigger to create profile row
      await new Promise((r) => setTimeout(r, 500));

      // Check if profile is complete (nickname set = onboarding done)
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('nickname')
        .eq('id', userId)
        .maybeSingle();

      if (profileError) {
        console.error('[auth/callback] profile query error:', profileError.message);
      }

      // No profile row yet, or nickname not set → onboarding
      if (!profile || !profile.nickname) {
        return NextResponse.redirect(`${origin}/onboarding`);
      }
    }
  }

  return NextResponse.redirect(`${origin}${redirect}`);
}
