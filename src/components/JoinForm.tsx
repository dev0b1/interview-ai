"use client";

import React from "react";

type Props = {
  onStart: (name: string, room?: string) => void;
};

export default function JoinForm({ onStart }: Props) {
  const [name, setName] = React.useState("");
  const [room, setRoom] = React.useState("hroast-room");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onStart(name.trim(), room.trim() || "hroast-room");
      }}
      className="w-full max-w-md mx-auto"
    >
      <div className="mb-4">
        <label className="block text-sm font-medium mb-2 muted">Your name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-4 py-2 border border-surface-2 rounded-md focus:ring-2 focus:ring-accent/40 transition bg-transparent text-foreground"
          placeholder="Jane Doe"
          required
        />
      </div>

      <div className="mb-6">
        <label className="block text-sm font-medium mb-2 muted">Room</label>
        <input
          value={room}
          onChange={(e) => setRoom(e.target.value)}
          className="w-full px-4 py-2 border border-surface-2 rounded-md focus:ring-2 focus:ring-accent/40 transition bg-transparent text-foreground"
          placeholder="hroast-room"
        />
        <p className="mt-2 text-xs muted">You can leave the room name as-is to join the public Hroast room.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="submit"
          className="col-span-2 inline-flex items-center justify-center gap-2 bg-gradient-to-r from-accent to-accent-2 text-foreground py-2 rounded-md shadow hover:scale-[1.01] transform transition"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10 2a1 1 0 00-.993.883L9 3v6.586L5.707 7.293a1 1 0 00-1.414 1.414l5 5a1 1 0 001.414 0l5-5a1 1 0 00-1.414-1.414L11 9.586V3a1 1 0 00-1-1z" />
          </svg>
          Start Hroast
        </button>
      </div>
    </form>
  );
}
