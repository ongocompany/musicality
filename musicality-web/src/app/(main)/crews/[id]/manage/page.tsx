'use client';

import { useEffect, useState, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-client';
import {
  fetchCrewById,
  fetchCrewMembers,
  fetchJoinRequests,
  updateCrew,
  kickMember,
  changeMemberRole,
  transferCaptainship,
  approveJoinRequest,
  rejectJoinRequest,
} from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { Crew, CrewMember, JoinRequest, CrewType, MemberRole } from '@/lib/types';
import { ROLE_CONFIG, ROLE_LEVELS } from '@/lib/types';

/** Roles a captain can assign (excludes captain — use transfer instead) */
const ASSIGNABLE_ROLES_CAPTAIN: MemberRole[] = ['seedling', 'member', 'regular', 'moderator'];
/** Roles a moderator can assign */
const ASSIGNABLE_ROLES_MOD: MemberRole[] = ['seedling', 'member', 'regular'];

export default function ManageCrewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const supabase = createClient();
  const { user } = useAuth();

  const [crew, setCrew] = useState<Crew | null>(null);
  const [members, setMembers] = useState<CrewMember[]>([]);
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Edit fields
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editType, setEditType] = useState<CrewType>('open');
  const [editLimit, setEditLimit] = useState(50);
  const [editRegion, setEditRegion] = useState('global');

  // Transfer captainship
  const [transferTarget, setTransferTarget] = useState<string | null>(null);
  const [transferring, setTransferring] = useState(false);

  const myMember = members.find((m) => m.userId === user?.id);
  const myRole = myMember?.role as MemberRole | undefined;
  const isCaptain = myRole === 'captain';
  const isModerator = myRole === 'moderator';
  const canManage = isCaptain || isModerator;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, m, r] = await Promise.all([
        fetchCrewById(supabase, id),
        fetchCrewMembers(supabase, id),
        fetchJoinRequests(supabase, id),
      ]);
      if (c) {
        setCrew(c);
        setEditName(c.name);
        setEditDescription(c.description);
        setEditType(c.crewType);
        setEditLimit(c.memberLimit);
        setEditRegion(c.region || 'global');
      }
      setMembers(m);
      setRequests(r);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [supabase, id]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Check permissions — captain or moderator only
  useEffect(() => {
    if (!loading && crew && user) {
      const me = members.find((m) => m.userId === user.id);
      const role = me?.role as MemberRole | undefined;
      if (role !== 'captain' && role !== 'moderator') {
        toast.error('Only captain or moderator can manage this crew');
        router.push(`/crews/${id}`);
      }
    }
  }, [loading, crew, user, members, id, router]);

  async function handleSave() {
    setSaving(true);
    try {
      await updateCrew(supabase, id, {
        name: editName,
        description: editDescription,
        crewType: editType,
        memberLimit: editLimit,
        region: editRegion,
      });
      toast.success('Crew updated!');
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handleKick(userId: string, name: string) {
    if (!confirm(`Remove ${name} from the crew?`)) return;
    try {
      await kickMember(supabase, id, userId);
      toast.success(`${name} removed`);
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    }
  }

  async function handleRoleChange(targetUserId: string, newRole: MemberRole) {
    try {
      await changeMemberRole(supabase, id, targetUserId, newRole);
      toast.success(`Role changed to ${ROLE_CONFIG[newRole].label}`);
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to change role');
    }
  }

  async function handleTransfer() {
    if (!transferTarget) return;
    const target = members.find((m) => m.userId === transferTarget);
    const targetName = target?.profile?.displayName ?? 'this member';
    if (!confirm(`Transfer captainship to ${targetName}? You will become a Moderator.`)) return;

    setTransferring(true);
    try {
      await transferCaptainship(supabase, id, transferTarget);
      toast.success('Captainship transferred!');
      setTransferTarget(null);
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to transfer');
    } finally {
      setTransferring(false);
    }
  }

  async function handleApprove(reqId: string) {
    try {
      await approveJoinRequest(supabase, reqId);
      toast.success('Request approved');
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    }
  }

  async function handleReject(reqId: string) {
    try {
      await rejectJoinRequest(supabase, reqId);
      toast.success('Request rejected');
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    }
  }

  /** Can the current user change this member's role? */
  function canChangeRole(target: CrewMember): boolean {
    if (target.userId === user?.id) return false;
    const targetLevel = ROLE_LEVELS[target.role as MemberRole] ?? 0;
    if (isCaptain) return targetLevel < 4; // captain can change anyone below
    if (isModerator) return targetLevel < 3; // moderator can change below moderator
    return false;
  }

  /** Can the current user kick this member? */
  function canKick(target: CrewMember): boolean {
    if (target.userId === user?.id) return false;
    const targetLevel = ROLE_LEVELS[target.role as MemberRole] ?? 0;
    const myLevel = ROLE_LEVELS[myRole ?? 'seedling'] ?? 0;
    return myLevel > targetLevel;
  }

  /** Get assignable roles for the current user targeting a specific member */
  function getAssignableRoles(target: CrewMember): MemberRole[] {
    const base = isCaptain ? ASSIGNABLE_ROLES_CAPTAIN : ASSIGNABLE_ROLES_MOD;
    return base.filter((r) => r !== target.role);
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  if (!crew) return <div className="text-center py-12 text-muted-foreground">Crew not found</div>;

  const sortedMembers = [...members].sort(
    (a, b) => (ROLE_LEVELS[b.role as MemberRole] ?? 0) - (ROLE_LEVELS[a.role as MemberRole] ?? 0)
  );

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Manage Crew</h1>
        <Badge variant="secondary" className="text-xs">
          {isCaptain ? '👑 Captain' : '🛡️ Moderator'}
        </Badge>
      </div>

      {/* Edit Info — Captain only */}
      {isCaptain && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Crew Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} maxLength={50} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <textarea
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                maxLength={500}
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <div className="flex gap-2">
                {(['open', 'closed'] as CrewType[]).map((t) => (
                  <Badge
                    key={t}
                    variant={editType === t ? 'default' : 'secondary'}
                    className="cursor-pointer px-3 py-1"
                    onClick={() => setEditType(t)}
                  >
                    {t === 'open' ? '🔓 Open' : '🔒 Closed'}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Region</Label>
              <div className="flex gap-2">
                <Badge
                  variant={editRegion === 'global' ? 'default' : 'secondary'}
                  className="cursor-pointer px-3 py-1"
                  onClick={() => setEditRegion('global')}
                >
                  🌐 Global
                </Badge>
                <Input
                  placeholder="Country code (KR, US...)"
                  value={editRegion === 'global' ? '' : editRegion}
                  onChange={(e) => setEditRegion(e.target.value.toUpperCase() || 'global')}
                  className="w-40"
                  maxLength={2}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Member Limit</Label>
              <Input
                type="number"
                min={2}
                max={500}
                value={editLimit}
                onChange={(e) => setEditLimit(Number(e.target.value))}
              />
            </div>
            <Button onClick={handleSave} disabled={saving} className="w-full">
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Captain Transfer — Captain only */}
      {isCaptain && (
        <Card className="border-orange-500/30">
          <CardHeader>
            <CardTitle className="text-lg text-orange-400">Transfer Captainship</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Transfer your captain role to another member. You will become a Moderator.
            </p>
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={transferTarget ?? ''}
              onChange={(e) => setTransferTarget(e.target.value || null)}
            >
              <option value="">Select member...</option>
              {members
                .filter((m) => m.userId !== user?.id)
                .map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.profile?.displayName ?? 'Unknown'} ({ROLE_CONFIG[m.role as MemberRole]?.label})
                  </option>
                ))}
            </select>
            <Button
              variant="outline"
              className="w-full border-orange-500/50 text-orange-400 hover:bg-orange-500/10"
              onClick={handleTransfer}
              disabled={!transferTarget || transferring}
            >
              {transferring ? 'Transferring...' : 'Transfer Captain'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Join Requests */}
      {requests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              Join Requests ({requests.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {requests.map((req) => (
              <div key={req.id} className="flex items-center gap-3">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={req.profile?.avatarUrl ?? undefined} />
                  <AvatarFallback className="text-xs bg-primary/20 text-primary">
                    {(req.profile?.displayName ?? '?')[0].toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <span className="text-sm font-medium">
                    {req.profile?.displayName ?? 'Unknown'}
                  </span>
                  {req.message && (
                    <p className="text-xs text-muted-foreground">{req.message}</p>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button size="sm" onClick={() => handleApprove(req.id)}>
                    Approve
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleReject(req.id)}>
                    Reject
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Members — Role Management */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Members ({members.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {sortedMembers.map((m) => {
            const roleKey = m.role as MemberRole;
            const rc = ROLE_CONFIG[roleKey];
            const isMe = m.userId === user?.id;

            return (
              <div key={m.id}>
                <div className="flex items-center gap-3 py-3">
                  {/* Avatar */}
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={m.profile?.avatarUrl ?? undefined} />
                    <AvatarFallback className="text-xs bg-primary/20 text-primary">
                      {(m.profile?.displayName ?? '?')[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>

                  {/* Name + nickname */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">
                        {m.profile?.displayName ?? 'Unknown'}
                      </span>
                      {isMe && (
                        <span className="text-[10px] text-muted-foreground">(you)</span>
                      )}
                    </div>
                    {m.profile?.nickname && (
                      <p className="text-xs text-muted-foreground">@{m.profile.nickname}</p>
                    )}
                  </div>

                  {/* Role badge */}
                  <span className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded-full border font-medium shrink-0",
                    rc.color,
                  )}>
                    {rc.emoji} {rc.label}
                  </span>

                  {/* Actions */}
                  {!isMe && canManage && (
                    <div className="flex items-center gap-1 shrink-0">
                      {/* Role change dropdown */}
                      {canChangeRole(m) && (
                        <select
                          className="text-xs rounded border border-border bg-background px-1.5 py-1"
                          value=""
                          onChange={(e) => {
                            if (e.target.value) {
                              handleRoleChange(m.userId, e.target.value as MemberRole);
                            }
                          }}
                        >
                          <option value="">Role...</option>
                          {getAssignableRoles(m).map((r) => (
                            <option key={r} value={r}>
                              {ROLE_CONFIG[r].emoji} {ROLE_CONFIG[r].label}
                            </option>
                          ))}
                        </select>
                      )}

                      {/* Kick button */}
                      {canKick(m) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive h-7 px-2 text-xs"
                          onClick={() => handleKick(m.userId, m.profile?.displayName ?? 'member')}
                        >
                          Kick
                        </Button>
                      )}
                    </div>
                  )}
                </div>
                <Separator />
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
