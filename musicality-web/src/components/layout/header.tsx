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
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="max-w-4xl mx-auto flex h-14 items-center justify-between px-4">
        {/* Logo */}
        <Link href="/" className="shrink-0">
          <span className="font-bold text-lg bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Ritmo
          </span>
        </Link>

        {/* Right side: search + auth */}
        <div className="flex items-center gap-2">
          {/* Search icon */}
          <Link href="/#search">
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground gap-1.5 px-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
              <span className="hidden sm:inline text-sm">Search</span>
            </Button>
          </Link>

          {/* Auth */}
          {loading ? (
            <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
          ) : user ? (
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-2 rounded-full hover:opacity-80 transition-opacity">
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
                <DropdownMenuItem>
                  <Link href="/crews">My Crews</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut}>Sign Out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Link href="/login">
              <Button size="sm" variant="outline" className="border-primary/50 text-primary hover:bg-primary/10">
                Sign In
              </Button>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
