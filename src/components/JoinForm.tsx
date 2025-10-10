"use client";

import React from "react";

type Props = {
  onStart: (name: string, room?: string) => void;
};

export default function JoinForm({ onStart }: Props) {
  const [name, setName] = React.useState("");
  const [room, setRoom] = React.useState("interview-room");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onStart(name.trim(), room.trim() || "interview-room");
      }}
      className="w-full max-w-md mx-auto"
    >
      <div className="mb-4">
        <label className="block text-sm font-medium mb-2 text-gray-700">Your name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-4 py-2 border border-gray-200 rounded-md focus:ring-2 focus:ring-blue-200 transition"
          placeholder="Jane Doe"
          required
        />
      </div>

      <div className="mb-6">
        <label className="block text-sm font-medium mb-2 text-gray-700">Room</label>
        <input
          value={room}
          onChange={(e) => setRoom(e.target.value)}
          className="w-full px-4 py-2 border border-gray-200 rounded-md focus:ring-2 focus:ring-blue-200 transition"
          placeholder="interview-room"
        />
        <p className="mt-2 text-xs text-gray-500">You can leave the room name as-is to join the public interview room.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="submit"
          className="col-span-2 inline-flex items-center justify-center gap-2 bg-gradient-to-r from-sky-600 to-indigo-600 text-white py-2 rounded-md shadow hover:scale-[1.01] transform transition"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10 2a1 1 0 00-.993.883L9 3v6.586L5.707 7.293a1 1 0 00-1.414 1.414l5 5a1 1 0 001.414 0l5-5a1 1 0 00-1.414-1.414L11 9.586V3a1 1 0 00-1-1z" />
          </svg>
          Start Interview
        </button>
      </div>
    </form>
  );
}
