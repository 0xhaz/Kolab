'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { Sidebar } from '@/components/shell/sidebar';
import { Topbar } from '@/components/shell/topbar';
import { RoleGate } from '@/components/shell/role-gate';

export default function AppLayout({ children }: LayoutProps<'/'>) {
  const router = useRouter();
  const { ready, authenticated } = usePrivy();

  useEffect(() => {
    if (ready && !authenticated) router.replace('/login');
  }, [ready, authenticated, router]);

  if (!ready || !authenticated) return null;

  return (
    <div className="flex flex-1">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:px-8 md:py-8">
          <RoleGate>{children}</RoleGate>
        </main>
      </div>
    </div>
  );
}
