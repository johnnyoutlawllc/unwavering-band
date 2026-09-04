'use client';

import { Field } from '@/components/Field';
import { AppNav } from '@/components/AppNav';
import { RequireAuth } from '@/components/RequireAuth';
import { VaultGate } from '@/components/VaultGate';
import { VaultProvider } from '@/lib/vault';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <VaultProvider>
        <Field />
        <VaultGate>
          <div className="app-shell">
            <AppNav />
            <main className="app-main">{children}</main>
          </div>
        </VaultGate>
      </VaultProvider>
    </RequireAuth>
  );
}
