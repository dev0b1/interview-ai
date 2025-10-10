"use client";

import React from 'react';

export default function ClientFormattedDate({ iso }: { iso?: string | null }) {
  if (!iso) return <>{'—'}</>;
  try {
    const d = new Date(iso);
    return <>{d.toLocaleString()}</>;
  } catch {
    return <>{iso}</>;
  }
}
