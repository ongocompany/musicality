'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-client';
import { updateProfile, uploadProfileAvatar, fetchMyCrews, checkNicknameAvailable, deleteMyAccount, fetchBlockedUsers, toggleBlock } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { CrewCard } from '@/components/crew/crew-card';
import { FollowListDialog } from '@/components/social/follow-list-dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { Crew, UserBlock } from '@/lib/types';

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

  // Blocked users
  const [blockedUsers, setBlockedUsers] = useState<UserBlock[]>([]);
  const [blockedLoading, setBlockedLoading] = useState(false);

  // Account deletion
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

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
      setBlockedLoading(true);
      fetchBlockedUsers(supabase).then(setBlockedUsers).catch(console.error).finally(() => setBlockedLoading(false));
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
      toast.error('이미 사용 중인 닉네임입니다');
      return;
    }
    if (nickname && !/^[a-zA-Z0-9_]{2,20}$/.test(nickname)) {
      toast.error('닉네임은 2-20자, 영문/숫자/밑줄만 가능합니다');
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
      toast.success('프로필이 저장되었습니다!');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '저장 실패');
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
      toast.success('프로필 사진이 변경되었습니다!');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '실패');
    }
  }

  async function handleSignOut() {
    await signOut();
    router.push('/');
  }

  // Check if user is captain of any crew
  const captainCrews = crews.filter((c) => c.captainId === user?.id);
  const isCaptainOfAny = captainCrews.length > 0;

  async function handleDeleteAccount() {
    if (deleteConfirmText !== '탈퇴') return;

    setDeleting(true);
    try {
      await deleteMyAccount(supabase);
      toast.success('계정이 삭제되었습니다. 이용해주셔서 감사합니다.');
      await supabase.auth.signOut();
      router.push('/');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '계정 삭제 실패');
    } finally {
      setDeleting(false);
    }
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
                <span className="text-white text-xs">변경</span>
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

          {/* Follower / Following counts */}
          {profile && (
            <div className="flex gap-6 text-sm">
              <FollowListDialog userId={user!.id} type="followers" count={profile.followerCount}>
                <button className="hover:underline cursor-pointer">
                  <span className="font-semibold">{profile.followerCount}</span>{' '}
                  <span className="text-muted-foreground">followers</span>
                </button>
              </FollowListDialog>
              <FollowListDialog userId={user!.id} type="following" count={profile.followingCount}>
                <button className="hover:underline cursor-pointer">
                  <span className="font-semibold">{profile.followingCount}</span>{' '}
                  <span className="text-muted-foreground">following</span>
                </button>
              </FollowListDialog>
            </div>
          )}

          {/* Display Name */}
          <div className="space-y-2">
            <Label>이름</Label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={30}
            />
          </div>

          {/* Nickname */}
          <div className="space-y-2">
            <Label>
              닉네임
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

          {/* Dance Style */}
          <div className="space-y-2">
            <Label>댄스 스타일</Label>
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
            {saving ? '저장 중...' : '프로필 저장'}
          </Button>
        </CardContent>
      </Card>

      {/* My Crews */}
      {crews.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">내 크루</h2>
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
        로그아웃
      </Button>

      {/* Blocked Users */}
      <Separator />
      <Card>
        <CardContent className="p-6 space-y-4">
          <h3 className="text-sm font-semibold">차단한 사용자</h3>
          {blockedLoading ? (
            <div className="h-8 animate-pulse rounded bg-muted" />
          ) : blockedUsers.length === 0 ? (
            <p className="text-xs text-muted-foreground">차단한 사용자가 없습니다</p>
          ) : (
            <div className="space-y-2">
              {blockedUsers.map((block) => {
                const bp = block.profile;
                return (
                  <div key={block.id} className="flex items-center gap-3 py-1">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={bp?.avatarUrl ?? undefined} />
                      <AvatarFallback className="text-xs bg-primary/20 text-primary">
                        {(bp?.displayName ?? '?')[0].toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm flex-1 truncate">{bp?.displayName ?? 'Unknown'}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={async () => {
                        try {
                          await toggleBlock(supabase, block.blockedId);
                          setBlockedUsers((prev) => prev.filter((b) => b.id !== block.id));
                          toast.success('차단이 해제되었습니다');
                        } catch {
                          toast.error('차단 해제에 실패했습니다');
                        }
                      }}
                    >
                      차단 해제
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Account */}
      <Separator />

      <Card className="border-destructive/30">
        <CardContent className="p-6 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-destructive">계정 삭제</h3>
            <p className="text-xs text-muted-foreground mt-1">
              계정을 삭제하면 모든 데이터(프로필, 게시글, 크루 멤버십)가 영구 삭제되며 복구할 수 없습니다.
            </p>
          </div>

          {isCaptainOfAny && (
            <div className="rounded-md bg-orange-500/10 border border-orange-500/30 p-3">
              <p className="text-xs text-orange-400 font-medium">
                ⚠️ 크루 캡틴 안내
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                현재 다음 크루의 캡틴입니다. 탈퇴 전에 캡틴 권한을 양도하거나 크루를 삭제해주세요.
              </p>
              <ul className="mt-2 space-y-1">
                {captainCrews.map((c) => (
                  <li key={c.id} className="text-xs text-orange-400">
                    • {c.name}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!showDeleteConfirm ? (
            <Button
              variant="outline"
              className="w-full border-destructive/50 text-destructive hover:bg-destructive/10"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={isCaptainOfAny}
            >
              {isCaptainOfAny ? '캡틴 권한 양도 후 탈퇴 가능' : '계정 삭제'}
            </Button>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                정말 탈퇴하시겠습니까? 확인을 위해 아래에 <strong className="text-foreground">&quot;탈퇴&quot;</strong>를 입력해주세요.
              </p>
              <Input
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="탈퇴"
                className="border-destructive/50"
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeleteConfirmText('');
                  }}
                >
                  취소
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  disabled={deleteConfirmText !== '탈퇴' || deleting}
                  onClick={handleDeleteAccount}
                >
                  {deleting ? '삭제 중...' : '계정 영구 삭제'}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
