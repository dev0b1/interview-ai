"use client";

import React from "react";
import { motion } from "framer-motion";

export default function SummaryModal({ open, onClose, summary }: { open: boolean; onClose: () => void; summary: { score: number; tone: string; pacing: string; notes: string } }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
  <div className="absolute inset-0 bg-surface/40" onClick={onClose} />
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-surface rounded-2xl shadow-lg p-6 z-10 w-full max-w-md border border-surface-2">
        <h3 className="text-lg font-semibold mb-2 text-foreground">Your Interview Summary</h3>
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="p-3 bg-surface-2 rounded text-center">
            <div className="text-sm muted">Score</div>
            <div className="text-2xl font-bold text-foreground">{summary.score}</div>
          </div>
          <div className="p-3 bg-surface-2 rounded text-center">
            <div className="text-sm muted">Tone</div>
            <div className="text-lg text-foreground">{summary.tone}</div>
          </div>
          <div className="p-3 bg-surface-2 rounded text-center">
            <div className="text-sm muted">Pacing</div>
            <div className="text-lg text-foreground">{summary.pacing}</div>
          </div>
        </div>

        <div className="mb-4 text-sm text-foreground">{summary.notes}</div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 border border-surface-2 rounded text-foreground">Close</button>
          <button onClick={() => { onClose(); }} className="px-4 py-2 bg-accent text-foreground rounded">Retry with another personality</button>
        </div>
      </motion.div>
    </div>
  );
}
