"use client";

import React from 'react';
import { usePathname } from 'next/navigation';
import ClientLayout from './ClientLayout';
import { AuthProvider } from '../lib/AuthProvider';

export default function ConditionalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Pages that should NOT show the sidebar / client layout
  const publicPaths = ['/', '/auth'];

  return (
    <AuthProvider>
      {publicPaths.includes(pathname || '/') ? <>{children}</> : <ClientLayout>{children}</ClientLayout>}
    </AuthProvider>
  );
}
