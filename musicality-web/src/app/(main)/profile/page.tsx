'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-client';
import { updateProfile, uploadProfileAvatar, fetchMyCrews } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CrewCard } from '@/components/crew/crew-card';
import { toast } from 'sonner';
import type { Crew } from '@/lib/types';

const DANCE_STYLES = ['bachata', 'salsa', 'kizomba', 'zouk', 'other'];

export default function ProfilePage() {
  const router = useRouter();
  const supabase = createClient();
  const { user, profile, loading: authLoading, refreshProfile, signOut } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [danceStyle, setDanceStyle] = useState('bachata');
  const [saving, setSaving] = useState(false);
  const [crews, setCrews] = useState<Crew[]>([]);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName);
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

  async function handleSave() {
    setSaving(true);
    try {
      await updateProfile(supabase, { displayName, danceStyle });
      await refreshProfile();
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

          <Button onClick={handleSave} disabled={saving} className="w-full">
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
