import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const redirect = searchParams.get('redirect') || '/crews';

  if (code) {
    const supabase = await createClient();
    const { data } = await supabase.auth.exchangeCodeForSession(code);

    if (data?.session?.user) {
      // Check if profile is complete (nickname set = onboarding done)
      const { data: profile } = await supabase
        .from('profiles')
        .select('nickname')
        .eq('id', data.session.user.id)
        .single();

      if (!profile?.nickname) {
        // New user or incomplete profile → onboarding
        return NextResponse.redirect(`${origin}/onboarding`);
      }
    }
  }

  return NextResponse.redirect(`${origin}${redirect}`);
}
