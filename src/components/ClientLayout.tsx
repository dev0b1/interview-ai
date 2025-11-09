"use client";

import React from "react";
import { Sidebar } from "./index";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = React.useState(false);

  // Persist mobile sidebar open state across navigation / reloads
  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem("sidebarOpen");
      if (stored === "true") setMobileOpen(true);
    } catch {
      // ignore localStorage errors on some browsers
    }
  }, []);

  // Ensure mobile slide-over doesn't remain open on larger screens.
  React.useEffect(() => {
    const check = () => {
      try {
        if (window.innerWidth >= 768 && mobileOpen) {
          setMobileOpen(false);
        }
      } catch {
        // ignore
      }
    };

    // Run on mount and on resize
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [mobileOpen]);

  React.useEffect(() => {
    try {
      window.localStorage.setItem("sidebarOpen", mobileOpen ? "true" : "false");
    } catch {
      // ignore
    }
  }, [mobileOpen]);

  return (
    <div className="min-h-screen bg-transparent text-foreground">
      <div className="flex">
        {/* Sidebar for md+ screens */}
          <aside className="hidden md:flex md:flex-col md:w-72 bg-surface/60 backdrop-blur border-r border-surface-2 p-6 sticky top-0 h-screen">
            <div className="flex-1">
              <div className="text-2xl font-bold mb-6">Hroast</div>
              <div className="space-y-6">
                <Sidebar />
              </div>
            </div>
            <div className="mt-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-surface-2" />
                <div>
                  <div className="text-sm font-medium text-foreground">Elisha</div>
                  <div className="text-xs muted">You</div>
                </div>
              </div>
            </div>
          </aside>
        

        <main className="flex-1 p-6 md:p-10">
          {/* Mobile header with hamburger */}
          <div className="md:hidden mb-4 flex items-center justify-between">
            <button
              aria-label="Open menu"
              onClick={() => setMobileOpen(true)}
              className="p-2 rounded-md bg-surface-2 shadow"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="text-sm">
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-2 text-foreground">
                <span className="w-2 h-2 bg-danger rounded-full" />
                Disconnected
              </span>
            </div>
          </div>

          {/* Top header for main area (md+) */}
          <header className="hidden md:flex items-center justify-between mb-6">
            <h1 className="text-2xl font-semibold text-foreground">Live Interview</h1>
            <div className="text-sm">
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-2 text-foreground">
                <span className="w-2 h-2 bg-danger rounded-full" />
                Disconnected
              </span>
            </div>
          </header>

          <div className="max-w-6xl mx-auto">{children}</div>
        </main>
      </div>

      {/* Mobile slide-over */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden pointer-events-none">
          <div className="absolute inset-0 bg-surface/30 pointer-events-auto" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-72 bg-surface-2 p-4 shadow-lg overflow-auto border-r border-surface-2 pointer-events-auto">
            <div className="flex items-center justify-between mb-4">
              <div className="text-lg font-bold">Hroast</div>
              <button onClick={() => setMobileOpen(false)} aria-label="Close menu" className="p-2 rounded-md">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
            <Sidebar onClose={() => setMobileOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
