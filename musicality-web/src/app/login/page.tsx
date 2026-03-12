'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || '/crews';
  const supabase = createClient();

  async function handleOAuth(provider: 'google' | 'kakao') {
    setLoading(provider);
    setError('');
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(redirect)}`,
      },
    });
    if (err) {
      setError(err.message);
      setLoading(null);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center space-y-2">
          <CardTitle className="text-3xl font-bold tracking-tight">
            🎵 Musicality
          </CardTitle>
          <CardDescription className="text-sm">
            소셜 계정으로 시작하세요
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {error && (
            <p className="text-sm text-destructive text-center rounded-md bg-destructive/10 py-2 px-3">
              {error}
            </p>
          )}

          {/* Google */}
          <Button
            variant="outline"
            className="w-full h-12 text-sm font-medium"
            onClick={() => handleOAuth('google')}
            disabled={loading !== null}
          >
            {loading === 'google' ? (
              <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <svg className="mr-3 h-5 w-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
            )}
            Google로 계속하기
          </Button>

          {/* Kakao */}
          <Button
            variant="outline"
            className="w-full h-12 text-sm font-medium border-[#FEE500]/40 hover:bg-[#FEE500]/10"
            onClick={() => handleOAuth('kakao')}
            disabled={loading !== null}
          >
            {loading === 'kakao' ? (
              <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <svg className="mr-3 h-5 w-5" viewBox="0 0 24 24" fill="none">
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M12 4C7.03 4 3 7.13 3 10.96c0 2.44 1.6 4.58 4.01 5.84l-.72 2.67a.37.37 0 0 0 .56.4l3.13-2.07c.65.1 1.32.16 2.02.16 4.97 0 9-3.13 9-6.96S16.97 4 12 4z"
                  fill="#3C1E1E"
                />
              </svg>
            )}
            카카오로 계속하기
          </Button>

          {/* Naver — Coming Soon */}
          <Button
            variant="outline"
            className="w-full h-12 text-sm font-medium opacity-40"
            disabled
          >
            <svg className="mr-3 h-5 w-5" viewBox="0 0 24 24" fill="none">
              <rect x="2" y="2" width="20" height="20" rx="4" fill="#03C75A" />
              <path d="M8 7.5h2.5l3 4.2V7.5H16v9h-2.5l-3-4.2v4.2H8v-9z" fill="white" />
            </svg>
            네이버로 계속하기
            <span className="ml-auto text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              준비중
            </span>
          </Button>

          <p className="text-[11px] text-center text-muted-foreground pt-3">
            로그인 시 자동으로 계정이 생성됩니다
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
