'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';

function buildStamp(): string {
  const iso = process.env.NEXT_PUBLIC_BUILD_TIME;
  if (!iso) return 'unknown';
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function UserMenu({ onSettings }: { onSettings: () => void }) {
  const { displayName, avatarUrl, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (root.current && !root.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="usermenu" ref={root}>
      <button
        className="user-btn"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" referrerPolicy="no-referrer" />
        ) : null}
        <span>{displayName}</span>
        <svg width="10" height="6" viewBox="0 0 10 6" aria-hidden="true">
          <path
            d="M1 1l4 4 4-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {open ? (
        <div className="menu" role="menu">
          <button
            role="menuitem"
            className="menu-item"
            onClick={() => {
              setOpen(false);
              onSettings();
            }}
          >
            Settings
          </button>
          <div className="menu-info">
            App last updated
            <span>{buildStamp()}</span>
          </div>
          <button role="menuitem" className="menu-item" onClick={signOut}>
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
