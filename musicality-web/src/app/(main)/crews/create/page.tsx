'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-client';
import { createCrew } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import type { CrewType } from '@/lib/types';

const DANCE_STYLES = ['bachata', 'salsa', 'kizomba', 'zouk', 'other'];

export default function CreateCrewPage() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [crewType, setCrewType] = useState<CrewType>('open');
  const [danceStyle, setDanceStyle] = useState('bachata');
  const [memberLimit, setMemberLimit] = useState(50);
  const [region, setRegion] = useState('global');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Crew name is required');
      return;
    }
    setLoading(true);
    try {
      const crew = await createCrew(supabase, {
        name,
        description,
        crewType,
        danceStyle,
        memberLimit,
        region,
      });
      toast.success('Crew created!');
      router.push(`/crews/${crew.id}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create crew');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Create a Crew</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Crew Name *</Label>
              <Input
                id="name"
                placeholder="My Dance Crew"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={50}
                required
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="desc">Description</Label>
              <textarea
                id="desc"
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="What's your crew about?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
              />
            </div>

            {/* Type */}
            <div className="space-y-2">
              <Label>Crew Type</Label>
              <div className="flex gap-2">
                {(['open', 'closed'] as CrewType[]).map((t) => (
                  <Badge
                    key={t}
                    variant={crewType === t ? 'default' : 'secondary'}
                    className="cursor-pointer text-sm px-3 py-1"
                    onClick={() => setCrewType(t)}
                  >
                    {t === 'open' ? '🔓 Open' : '🔒 Closed'}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Dance Style */}
            <div className="space-y-2">
              <Label>Dance Style</Label>
              <div className="flex gap-2 flex-wrap">
                {DANCE_STYLES.map((s) => (
                  <Badge
                    key={s}
                    variant={danceStyle === s ? 'default' : 'secondary'}
                    className="cursor-pointer text-sm px-3 py-1 capitalize"
                    onClick={() => setDanceStyle(s)}
                  >
                    {s}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Region */}
            <div className="space-y-2">
              <Label>Region</Label>
              <div className="flex gap-2">
                <Badge
                  variant={region === 'global' ? 'default' : 'secondary'}
                  className="cursor-pointer text-sm px-3 py-1"
                  onClick={() => setRegion('global')}
                >
                  🌐 Global
                </Badge>
                <Input
                  placeholder="Country code (e.g. KR, US)"
                  value={region === 'global' ? '' : region}
                  onChange={(e) => setRegion(e.target.value.toUpperCase() || 'global')}
                  className="w-40"
                  maxLength={2}
                />
              </div>
            </div>

            {/* Member Limit */}
            <div className="space-y-2">
              <Label htmlFor="limit">Member Limit</Label>
              <Input
                id="limit"
                type="number"
                min={2}
                max={500}
                value={memberLimit}
                onChange={(e) => setMemberLimit(Number(e.target.value))}
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Creating...' : 'Create Crew'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
