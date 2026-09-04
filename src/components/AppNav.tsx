'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';

const LINKS = [
  { href: '/app/history', label: 'History' },
  { href: '/app/people', label: 'People' },
  { href: '/app/now', label: 'Now' },
  { href: '/app/settings', label: 'Settings' },
];

export function AppNav() {
  const pathname = usePathname();
  const { displayName, signOut } = useAuth();

  return (
    <header className="app-nav">
      <Link href="/" className="app-nav-brand">
        unwavering<span className="dot">.band</span>
      </Link>
      <nav className="app-nav-links">
        {LINKS.map((l) => {
          const active = pathname === l.href || pathname.startsWith(l.href + '/');
          return (
            <Link
              key={l.href}
              href={l.href}
              className={active ? 'app-nav-link active' : 'app-nav-link'}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
      <div className="app-nav-user">
        <span>{displayName}</span>
        <button type="button" className="btn-quiet" onClick={() => signOut()}>
          Sign out
        </button>
      </div>
    </header>
  );
}
