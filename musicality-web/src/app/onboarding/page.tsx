'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-client';
import { updateProfile, uploadProfileAvatar, checkNicknameAvailable } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = createClient();
  const { user, profile, loading: authLoading, refreshProfile } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [nickname, setNickname] = useState('');
  const [phone, setPhone] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Nickname availability
  const [nicknameStatus, setNicknameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [nicknameTimer, setNicknameTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  // Pre-fill from social profile data (once)
  useEffect(() => {
    if (user && !initialized) {
      const meta = user.user_metadata;
      const socialName = meta?.full_name || meta?.name || '';
      const socialAvatar = meta?.avatar_url || meta?.picture || '';

      setDisplayName(profile?.displayName || socialName || '');
      setAvatarPreview(profile?.avatarUrl || socialAvatar || null);
      setInitialized(true);
    }
  }, [user, profile, initialized]);

  // If profile is already complete → redirect away
  useEffect(() => {
    if (!authLoading && profile?.nickname) {
      router.replace('/crews');
    }
  }, [authLoading, profile, router]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/login');
    }
  }, [authLoading, user, router]);

  // Debounced nickname availability check
  const checkNickname = useCallback((value: string) => {
    if (nicknameTimer) clearTimeout(nicknameTimer);

    if (!value.trim() || value.length < 2) {
      setNicknameStatus('idle');
      return;
    }
    if (!/^[a-zA-Z0-9_]{2,20}$/.test(value)) {
      setNicknameStatus('idle');
      return;
    }

    setNicknameStatus('checking');
    const timer = setTimeout(async () => {
      try {
        const available = await checkNicknameAvailable(supabase, value);
        setNicknameStatus(available ? 'available' : 'taken');
      } catch {
        setNicknameStatus('idle');
      }
    }, 500);
    setNicknameTimer(timer);
  }, [supabase, nicknameTimer]);

  function handleNicknameChange(value: string) {
    const cleaned = value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20);
    setNickname(cleaned);
    checkNickname(cleaned);
  }

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  async function handleSubmit() {
    if (!displayName.trim()) {
      toast.error('이름을 입력해주세요');
      return;
    }
    if (!nickname.trim()) {
      toast.error('닉네임을 입력해주세요');
      return;
    }
    if (!/^[a-zA-Z0-9_]{2,20}$/.test(nickname)) {
      toast.error('닉네임은 2-20자, 영문/숫자/밑줄만 가능합니다');
      return;
    }
    if (nicknameStatus === 'taken') {
      toast.error('이미 사용 중인 닉네임입니다');
      return;
    }

    setSaving(true);
    try {
      // Upload avatar if a new file was selected
      let avatarUrl: string | undefined;
      if (avatarFile) {
        avatarUrl = await uploadProfileAvatar(supabase, avatarFile);
      } else if (avatarPreview && !profile?.avatarUrl) {
        // Use social avatar URL directly if no custom upload
        avatarUrl = avatarPreview;
      }

      await updateProfile(supabase, {
        displayName: displayName.trim(),
        nickname: nickname.trim(),
        phone: phone.trim() || undefined,
        ...(avatarUrl ? { avatarUrl } : {}),
      });

      await refreshProfile();
      toast.success('프로필이 설정되었습니다! 🎉');
      router.push('/crews');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '프로필 설정에 실패했습니다');
    } finally {
      setSaving(false);
    }
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center space-y-2">
          <CardTitle className="text-2xl font-bold">프로필 설정</CardTitle>
          <CardDescription>
            커뮤니티에서 사용할 프로필을 완성해주세요
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Avatar */}
          <div className="flex flex-col items-center gap-2">
            <label className="cursor-pointer group relative">
              <Avatar className="h-20 w-20">
                <AvatarImage src={avatarPreview ?? undefined} />
                <AvatarFallback className="bg-primary/20 text-primary text-2xl">
                  {(displayName || user?.email || '?')[0].toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-white text-xs font-medium">변경</span>
              </div>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarChange}
              />
            </label>
            <p className="text-[11px] text-muted-foreground">
              클릭하여 프로필 사진 변경
            </p>
          </div>

          {/* Display Name */}
          <div className="space-y-2">
            <Label>
              이름 <span className="text-destructive">*</span>
            </Label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="표시될 이름"
              maxLength={30}
            />
          </div>

          {/* Nickname */}
          <div className="space-y-2">
            <Label>
              닉네임 <span className="text-destructive">*</span>
              <span className="text-xs text-muted-foreground ml-2">
                (모든 크루에서 고유)
              </span>
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">@</span>
              <Input
                value={nickname}
                onChange={(e) => handleNicknameChange(e.target.value)}
                className="pl-7"
                placeholder="your_nickname"
                maxLength={20}
              />
              {nicknameStatus !== 'idle' && (
                <span className={cn(
                  "absolute right-3 top-1/2 -translate-y-1/2 text-xs",
                  nicknameStatus === 'checking' && "text-muted-foreground",
                  nicknameStatus === 'available' && "text-green-400",
                  nicknameStatus === 'taken' && "text-destructive",
                )}>
                  {nicknameStatus === 'checking' && '확인중...'}
                  {nicknameStatus === 'available' && '사용 가능 ✓'}
                  {nicknameStatus === 'taken' && '이미 사용중'}
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              2-20자. 영문, 숫자, 밑줄(_)만 사용 가능
            </p>
          </div>

          {/* Phone */}
          <div className="space-y-2">
            <Label>
              전화번호
              <span className="text-xs text-muted-foreground ml-2">(선택)</span>
            </Label>
            <Input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+82 10-1234-5678"
              maxLength={20}
            />
          </div>

          <Button
            onClick={handleSubmit}
            disabled={saving || nicknameStatus === 'taken' || !nickname.trim() || !displayName.trim()}
            className="w-full h-11"
          >
            {saving ? '설정 중...' : '시작하기 🚀'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
