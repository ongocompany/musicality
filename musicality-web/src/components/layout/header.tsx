'use client';

import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function Header() {
  const { user, profile, loading, signOut } = useAuth();

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 px-4 md:px-6">
      {/* Mobile logo */}
      <Link href="/" className="flex items-center gap-2 md:hidden">
        <span className="text-xl">🎵</span>
        <span className="font-bold text-lg">Musicality</span>
      </Link>

      {/* Desktop: spacer for sidebar offset */}
      <div className="hidden md:block" />

      {/* Right side */}
      <div className="flex items-center gap-2">
        {loading ? (
          <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
        ) : user ? (
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 rounded-full hover:opacity-80 transition-opacity md:hidden">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={profile?.avatarUrl ?? undefined} />
                  <AvatarFallback className="bg-primary/20 text-primary text-xs">
                    {(profile?.displayName ?? user.email ?? '?')[0].toUpperCase()}
                  </AvatarFallback>
                </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>
                <Link href="/profile">Profile</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={signOut}>Sign Out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Link href="/login" className="md:hidden">
            <Button size="sm">Sign In</Button>
          </Link>
        )}
      </div>
    </header>
  );
}
