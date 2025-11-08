"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";

export default function Sidebar({ onClose }: { onClose?: () => void } = {}) {
  const pathname = usePathname();

  function NavLink({ href, label, icon }: { href: string; label: string; icon?: React.ReactNode }) {
    const active = pathname === href;
    return (
      <Link
        href={href}
        onClick={() => onClose && onClose()}
        className={`flex items-center gap-3 px-3 py-2 rounded-md font-medium transition ${
          active
            ? "bg-gradient-to-r from-accent to-accent-2 text-foreground shadow"
            : "text-muted hover:bg-surface-2"
        }`}
      >
        <span className="w-5 h-5 text-foreground">{icon}</span>
        <span className="text-foreground">{label}</span>
      </Link>
    );
  }

  return (
    <nav className="space-y-4">
  <NavLink href="/dashboard" label="Dashboard" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M3 3h4v4H3V3zM3 13h4v4H3v-4zM13 3h4v4h-4V3zM13 13h4v4h-4v-4z"/></svg>} />
  <NavLink href="/interview" label="Hroasts" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M9 2a1 1 0 00-1 1v3H5a1 1 0 100 2h3v3a1 1 0 102 0V8h3a1 1 0 100-2H11V3a1 1 0 00-1-1z"/></svg>} />
  <NavLink href="/history" label="History" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M10 2a8 8 0 106.32 12.906l.687.687A1 1 0 0018.32 16l-.687-.687A8 8 0 0010 2zM9 8V5h2v4H9z"/></svg>} />
  <NavLink href="/settings" label="Settings" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M11 17a1 1 0 01-2 0v-1.07A6.002 6.002 0 015.07 11H4a1 1 0 010-2h1.07A6.002 6.002 0 009 5.07V4a1 1 0 012 0v1.07A6.002 6.002 0 0114.93 9H16a1 1 0 010 2h-1.07A6.002 6.002 0 0111 15.93V17z"/></svg>} />
    </nav>
  );
}
