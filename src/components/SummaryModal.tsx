"use client";

import React from "react";
import { motion } from "framer-motion";

export default function SummaryModal({ open, onClose, summary }: { open: boolean; onClose: () => void; summary: { score: number; tone: string; pacing: string; notes: string } }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-2xl shadow-lg p-6 z-10 w-full max-w-md">
        <h3 className="text-lg font-semibold mb-2">Your Interview Summary</h3>
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="p-3 bg-gray-50 rounded text-center">
            <div className="text-sm text-gray-500">Score</div>
            <div className="text-2xl font-bold">{summary.score}</div>
          </div>
          <div className="p-3 bg-gray-50 rounded text-center">
            <div className="text-sm text-gray-500">Tone</div>
            <div className="text-lg">{summary.tone}</div>
          </div>
          <div className="p-3 bg-gray-50 rounded text-center">
            <div className="text-sm text-gray-500">Pacing</div>
            <div className="text-lg">{summary.pacing}</div>
          </div>
        </div>

        <div className="mb-4 text-sm text-gray-700">{summary.notes}</div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 border rounded">Close</button>
          <button onClick={() => { onClose(); }} className="px-4 py-2 bg-sky-600 text-white rounded">Retry with another personality</button>
        </div>
      </motion.div>
    </div>
  );
}
