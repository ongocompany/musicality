'use client';

import Link from 'next/link';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import type { Crew, MemberRole } from '@/lib/types';
import { ROLE_CONFIG } from '@/lib/types';
import { cn, countryToFlag } from '@/lib/utils';

const ROLE_BORDER: Record<MemberRole, string> = {
  captain:   'border-red-500/50 hover:border-red-500/80',
  moderator: 'border-orange-500/50 hover:border-orange-500/80',
  regular:   'border-purple-500/50 hover:border-purple-500/80',
  member:    'border-blue-500/50 hover:border-blue-500/80',
  seedling:  'border-green-500/50 hover:border-green-500/80',
};

interface CrewCardProps {
  crew: Crew;
  memberRole?: MemberRole;
}

export function CrewCard({ crew, memberRole }: CrewCardProps) {
  const roleConfig = memberRole ? ROLE_CONFIG[memberRole] : null;

  return (
    <Link href={`/crews/${crew.id}`}>
      <Card className={cn(
        "hover:border-primary/50 transition-colors cursor-pointer h-full",
        memberRole && ROLE_BORDER[memberRole],
      )}>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Avatar className="h-12 w-12 rounded-lg">
              <AvatarImage src={crew.thumbnailUrl ?? undefined} />
              <AvatarFallback className="rounded-lg bg-primary/20 text-primary text-lg">
                {crew.name[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold truncate">{crew.name}</h3>
                {roleConfig && (
                  <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 border", roleConfig.color)}>
                    {roleConfig.emoji} {roleConfig.label}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground line-clamp-1 mt-0.5">
                {crew.description || 'No description'}
              </p>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <Badge variant="secondary" className="text-xs">
                  {crew.crewType === 'open' ? '🔓 Open' : '🔒 Closed'}
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  👥 {crew.memberCount}/{crew.memberLimit}
                </Badge>
                <Badge variant="secondary" className="text-xs capitalize">
                  💃 {crew.danceStyle}
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  {countryToFlag(crew.region)} {crew.region}
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
