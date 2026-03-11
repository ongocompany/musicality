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
import type { Crew, CrewMember, JoinRequest, CrewType } from '@/lib/types';

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

  // Check captain
  useEffect(() => {
    if (!loading && crew && user && crew.captainId !== user.id) {
      toast.error('Only the captain can manage this crew');
      router.push(`/crews/${id}`);
    }
  }, [loading, crew, user, id, router]);

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

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  if (!crew) return <div className="text-center py-12 text-muted-foreground">Crew not found</div>;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Manage Crew</h1>

      {/* Edit Info */}
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
                    ✓
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleReject(req.id)}>
                    ✗
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Members */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Members ({members.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {members.map((m) => (
            <div key={m.id}>
              <div className="flex items-center gap-3 py-2">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={m.profile?.avatarUrl ?? undefined} />
                  <AvatarFallback className="text-xs bg-primary/20 text-primary">
                    {(m.profile?.displayName ?? '?')[0].toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium flex-1">
                  {m.profile?.displayName ?? 'Unknown'}
                </span>
                {m.role === 'captain' ? (
                  <Badge className="text-xs bg-primary/80">Captain</Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleKick(m.userId, m.profile?.displayName ?? 'member')}
                  >
                    Remove
                  </Button>
                )}
              </div>
              <Separator />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
