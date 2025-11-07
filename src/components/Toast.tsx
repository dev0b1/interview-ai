"use client";
import React, { useEffect } from 'react';

export default function Toast({ message, onClose, duration = 5000 }: { message: string; onClose?: () => void; duration?: number }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => {
      onClose?.();
    }, duration);
    return () => clearTimeout(t);
  }, [message, duration, onClose]);

  if (!message) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <div className="bg-surface-2 border border-muted px-4 py-2 rounded shadow-lg flex items-center gap-3">
        <div className="text-sm">{message}</div>
        <button
          className="text-sm text-muted hover:text-foreground"
          onClick={() => onClose?.()}
          aria-label="dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
