'use client';

import { usePathname } from 'next/navigation';
import { Field } from '@/components/Field';
import { AppNav } from '@/components/AppNav';
import { RequireAuth } from '@/components/RequireAuth';
import { VaultGate } from '@/components/VaultGate';
import { VaultProvider } from '@/lib/vault';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const wide = pathname?.startsWith('/app/history') ?? false;

  return (
    <RequireAuth>
      <VaultProvider>
        <Field />
        <VaultGate>
          <div className="app-shell">
            <AppNav />
            <main className={wide ? 'app-main app-main-wide' : 'app-main'}>
              {children}
            </main>
          </div>
        </VaultGate>
      </VaultProvider>
    </RequireAuth>
  );
}
