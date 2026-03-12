'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export function Header() {
  const { user, profile, loading, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync search value from URL on mount
  useEffect(() => {
    const q = searchParams.get('q') ?? '';
    setSearchValue(q);
    if (q) setSearchOpen(true);
  }, [searchParams]);

  // Auto-focus when search opens
  useEffect(() => {
    if (searchOpen) {
      // Small delay to allow transition to start
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [searchOpen]);

  function handleSearchToggle() {
    if (searchOpen) {
      // Close: clear search and navigate to home without query
      setSearchOpen(false);
      setSearchValue('');
      if (pathname === '/') {
        router.replace('/');
      }
    } else {
      setSearchOpen(true);
    }
  }

  function handleSearchChange(value: string) {
    setSearchValue(value);
    // Navigate to home with search query (debounced in home page)
    if (pathname !== '/') {
      router.push(`/?q=${encodeURIComponent(value)}`);
    } else {
      router.replace(`/?q=${encodeURIComponent(value)}`, { scroll: false });
    }
  }

  function handleSearchKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setSearchOpen(false);
      setSearchValue('');
      if (pathname === '/') {
        router.replace('/');
      }
    }
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="max-w-4xl mx-auto flex h-14 items-center justify-between px-4">
        {/* Logo — hidden when search is open on mobile */}
        <Link
          href="/"
          className={cn(
            'shrink-0 transition-opacity duration-200',
            searchOpen ? 'opacity-0 w-0 overflow-hidden sm:opacity-100 sm:w-auto' : '',
          )}
        >
          <div>
            <span className="font-bold text-lg bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Ritmo
            </span>
            <p className="text-[9px] text-muted-foreground tracking-widest uppercase leading-none hidden sm:block">Vibe with crew</p>
          </div>
        </Link>

        {/* Right side: search bar + auth */}
        <div className="flex items-center gap-2 flex-1 justify-end">
          {/* Slide-in search input */}
          <div
            className={cn(
              'flex items-center transition-all duration-300 ease-in-out overflow-hidden',
              searchOpen
                ? 'w-full sm:w-72 opacity-100 mr-1'
                : 'w-0 opacity-0',
            )}
          >
            <div className="relative w-full">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <Input
                ref={inputRef}
                value={searchValue}
                onChange={(e) => handleSearchChange(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="크루 검색..."
                className="pl-8 pr-2 h-9 text-sm bg-muted/50 border-border/50"
              />
            </div>
          </div>

          {/* Search toggle button */}
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'shrink-0 h-9 w-9 text-muted-foreground hover:text-foreground',
              searchOpen && 'text-primary hover:text-primary/80',
            )}
            onClick={handleSearchToggle}
          >
            {searchOpen ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            )}
          </Button>

          {/* Auth */}
          {loading ? (
            <div className="h-8 w-8 animate-pulse rounded-full bg-muted shrink-0" />
          ) : user ? (
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-2 rounded-full hover:opacity-80 transition-opacity shrink-0">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={profile?.avatarUrl ?? undefined} />
                  <AvatarFallback className="bg-primary/20 text-primary text-xs">
                    {(profile?.displayName ?? user.email ?? '?')[0].toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <Link href="/profile">
                  <DropdownMenuItem className="cursor-pointer">Profile</DropdownMenuItem>
                </Link>
                <Link href="/crews">
                  <DropdownMenuItem className="cursor-pointer">My Crews</DropdownMenuItem>
                </Link>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="cursor-pointer" onClick={signOut}>Sign Out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Link href="/login" className="shrink-0">
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
