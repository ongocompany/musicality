'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';

const NAV_ITEMS = [
  { href: '/', label: 'Discover', icon: '🔍' },
  { href: '/crews', label: 'Crews', icon: '👥', auth: true },
  { href: '/profile', label: 'Profile', icon: '👤', auth: true },
];

export function MobileNav() {
  const pathname = usePathname();
  const { user } = useAuth();

  // Hide on auth pages
  if (pathname.startsWith('/login') || pathname.startsWith('/signup')) {
    return null;
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex md:hidden border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      {NAV_ITEMS.map((item) => {
        if (item.auth && !user) return null;
        const isActive =
          item.href === '/'
            ? pathname === '/'
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex flex-1 flex-col items-center gap-1 py-2 text-xs transition-colors',
              isActive
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <span className="text-lg">{item.icon}</span>
            {item.label}
          </Link>
        );
      })}
      {!user && (
        <Link
          href="/login"
          className="flex flex-1 flex-col items-center gap-1 py-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <span className="text-lg">🔑</span>
          Sign In
        </Link>
      )}
    </nav>
  );
}
