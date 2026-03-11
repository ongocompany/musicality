'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-client';
import { updateProfile, uploadProfileAvatar, fetchMyCrews, checkNicknameAvailable } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CrewCard } from '@/components/crew/crew-card';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { Crew } from '@/lib/types';

const DANCE_STYLES = ['bachata', 'salsa', 'kizomba', 'zouk', 'other'];

export default function ProfilePage() {
  const router = useRouter();
  const supabase = createClient();
  const { user, profile, loading: authLoading, refreshProfile, signOut } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [nickname, setNickname] = useState('');
  const [phone, setPhone] = useState('');
  const [danceStyle, setDanceStyle] = useState('bachata');
  const [saving, setSaving] = useState(false);
  const [crews, setCrews] = useState<Crew[]>([]);

  // Nickname availability
  const [nicknameStatus, setNicknameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [nicknameTimer, setNicknameTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName);
      setNickname(profile.nickname ?? '');
      setPhone(profile.phone ?? '');
      setDanceStyle(profile.danceStyle);
    }
  }, [profile]);

  useEffect(() => {
    if (user) {
      fetchMyCrews(supabase).then(setCrews).catch(console.error);
    }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login?redirect=/profile');
    }
  }, [authLoading, user, router]);

  // Debounced nickname availability check
  const checkNickname = useCallback((value: string) => {
    if (nicknameTimer) clearTimeout(nicknameTimer);

    // Same as current — no need to check
    if (value === (profile?.nickname ?? '')) {
      setNicknameStatus('idle');
      return;
    }

    if (!value.trim() || value.length < 2) {
      setNicknameStatus('idle');
      return;
    }

    // Validate format: alphanumeric + underscore, 2-20 chars
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
  }, [supabase, profile?.nickname, nicknameTimer]);

  function handleNicknameChange(value: string) {
    // Only allow valid characters
    const cleaned = value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20);
    setNickname(cleaned);
    checkNickname(cleaned);
  }

  async function handleSave() {
    if (nicknameStatus === 'taken') {
      toast.error('Nickname is already taken');
      return;
    }
    if (nickname && !/^[a-zA-Z0-9_]{2,20}$/.test(nickname)) {
      toast.error('Nickname must be 2-20 characters (letters, numbers, underscore)');
      return;
    }

    setSaving(true);
    try {
      await updateProfile(supabase, {
        displayName,
        nickname: nickname || undefined,
        phone: phone || undefined,
        danceStyle,
      });
      await refreshProfile();
      setNicknameStatus('idle');
      toast.success('Profile updated!');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const url = await uploadProfileAvatar(supabase, file);
      await updateProfile(supabase, { avatarUrl: url });
      await refreshProfile();
      toast.success('Avatar updated!');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    }
  }

  async function handleSignOut() {
    await signOut();
    router.push('/');
  }

  if (authLoading) {
    return (
      <div className="max-w-lg mx-auto">
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Profile</h1>

      <Card>
        <CardContent className="p-6 space-y-6">
          {/* Avatar */}
          <div className="flex items-center gap-4">
            <label className="cursor-pointer group relative">
              <Avatar className="h-16 w-16">
                <AvatarImage src={profile?.avatarUrl ?? undefined} />
                <AvatarFallback className="bg-primary/20 text-primary text-xl">
                  {(profile?.displayName ?? user?.email ?? '?')[0].toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-white text-xs">Edit</span>
              </div>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatar}
              />
            </label>
            <div>
              <p className="font-medium">{profile?.displayName || 'Set your name'}</p>
              {profile?.nickname && (
                <p className="text-sm text-primary">@{profile.nickname}</p>
              )}
              <p className="text-sm text-muted-foreground">{user?.email}</p>
            </div>
          </div>

          {/* Display Name */}
          <div className="space-y-2">
            <Label>Display Name</Label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={30}
            />
          </div>

          {/* Nickname */}
          <div className="space-y-2">
            <Label>
              Nickname
              <span className="text-xs text-muted-foreground ml-2">
                (unique across all crews)
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
                  {nicknameStatus === 'checking' && 'Checking...'}
                  {nicknameStatus === 'available' && 'Available'}
                  {nicknameStatus === 'taken' && 'Taken'}
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              2-20 characters. Letters, numbers, underscore only.
            </p>
          </div>

          {/* Phone */}
          <div className="space-y-2">
            <Label>
              Phone
              <span className="text-xs text-muted-foreground ml-2">(optional)</span>
            </Label>
            <Input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+82 10-1234-5678"
              maxLength={20}
            />
          </div>

          {/* Dance Style */}
          <div className="space-y-2">
            <Label>Dance Style</Label>
            <div className="flex gap-2 flex-wrap">
              {DANCE_STYLES.map((s) => (
                <Badge
                  key={s}
                  variant={danceStyle === s ? 'default' : 'secondary'}
                  className="cursor-pointer px-3 py-1 capitalize"
                  onClick={() => setDanceStyle(s)}
                >
                  {s}
                </Badge>
              ))}
            </div>
          </div>

          <Button onClick={handleSave} disabled={saving || nicknameStatus === 'taken'} className="w-full">
            {saving ? 'Saving...' : 'Save Profile'}
          </Button>
        </CardContent>
      </Card>

      {/* My Crews */}
      {crews.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">My Crews</h2>
          {crews.map((crew) => (
            <CrewCard
              key={crew.id}
              crew={crew}
              showCaptainBadge={crew.captainId === user?.id}
            />
          ))}
        </div>
      )}

      <Button variant="outline" className="w-full" onClick={handleSignOut}>
        Sign Out
      </Button>
    </div>
  );
}
