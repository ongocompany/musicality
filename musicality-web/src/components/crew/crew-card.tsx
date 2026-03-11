'use client';

import Link from 'next/link';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import type { Crew } from '@/lib/types';
import { cn, countryToFlag } from '@/lib/utils';

interface CrewCardProps {
  crew: Crew;
  showCaptainBadge?: boolean;
  isCaptain?: boolean;
}

export function CrewCard({ crew, showCaptainBadge, isCaptain }: CrewCardProps) {
  return (
    <Link href={`/crews/${crew.id}`}>
      <Card className={cn(
        "hover:border-primary/50 transition-colors cursor-pointer h-full",
        isCaptain && "border-accent/60 hover:border-accent"
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
                {showCaptainBadge && (
                  <Badge variant="default" className="text-[10px] px-1.5 py-0 bg-primary/80">
                    Captain
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
