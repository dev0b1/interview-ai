"use client";

import React from 'react';

type Props = {
  size?: number; // rem units for outer container sizing hint
  label?: string; // visible label
};

export default function Loading({ size = 3, label = 'Loading' }: Props) {
  return (
    <div style={{ minHeight: '100vh' }} className="flex items-center justify-center" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-3">
        <div
          className={`rounded-full border-4 border-sky-200 border-t-sky-600 animate-spin motion-reduce:animate-none dark:border-slate-700 dark:border-t-sky-400`}
          style={{ width: `${size}rem`, height: `${size}rem` }}
          aria-hidden="true"
        />

        <div className="text-sm text-gray-600 dark:text-gray-300">
          <span className="sr-only">{label}</span>
          <span aria-hidden>{label}…</span>
        </div>
      </div>
    </div>
  );
}
