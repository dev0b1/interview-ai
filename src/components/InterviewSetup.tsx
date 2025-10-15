"use client";

import React from "react";
import { motion } from "framer-motion";
import { useAuth } from "../lib/useAuth";

type Props = {
  onStart: (opts: { topic: string; personality: string }) => void;
  initialName?: string;
};

const personalities = [
  "Professional & Calm",
  "Aggressive HR",
  "Casual Startup Founder",
  "Technical Expert (Deep Dives)",
];

export default function InterviewSetup({ onStart, initialName = "" }: Props) {
  // No name input required — app requires authenticated users. Frontend will
  // provide a descriptive name (display name + email fallback) when starting.
  const [topic, setTopic] = React.useState("Frontend Engineer");
  const [personality, setPersonality] = React.useState(personalities[0]);

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl shadow-lg p-6">
      <h2 className="text-xl font-semibold mb-4">Interview Setup</h2>

      <div className="grid gap-4">
        {/* Name is taken from authenticated session; no input required */}

        <div>
          <label className="block text-sm text-gray-600 mb-1">Interview topic</label>
          <input value={topic} onChange={(e) => setTopic(e.target.value)} className="w-full px-4 py-2 border rounded" />
        </div>

        <div>
          <label className="block text-sm text-gray-600 mb-1">AI interviewer personality</label>
          <select value={personality} onChange={(e) => setPersonality(e.target.value)} className="w-full px-4 py-2 border rounded">
            {personalities.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        <div className="flex justify-end">
          <button onClick={() => onStart({ topic, personality })} className="px-4 py-2 bg-sky-600 text-white rounded">Join Interview</button>
        </div>
      </div>
    </motion.div>
  );
}
