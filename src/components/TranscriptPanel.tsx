"use client";

import React from "react";

export type Entry = { who: "AI" | "User"; text: string; ts: number };

export default function TranscriptPanel({ entries }: { entries: Entry[] }) {
  const ref = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [entries]);

  return (
    <div className="w-80 bg-surface rounded-lg shadow p-4">
      <h3 className="font-semibold mb-2 text-foreground">Transcript</h3>
      <div ref={ref} className="space-y-3 max-h-96 overflow-auto">
        {entries.map((e, i) => (
          <div
            key={i}
            className={`p-2 rounded ${e.who === "AI" ? "bg-surface-2" : "bg-accent/10"}`}
          >
            <div className="text-xs muted">{e.who} • {new Date(e.ts).toLocaleTimeString()}</div>
            <div className="text-sm mt-1 text-foreground">{e.text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
