"use client";

import React from "react";

export default function ShareControls({ audioUrl }: { audioUrl?: string | null }) {
  const handleCopy = async () => {
    if (!audioUrl) return;
    try {
      await navigator.clipboard.writeText(audioUrl);
      alert("Link copied to clipboard");
    } catch {
      // fallback
      const a = document.createElement('a');
      a.href = audioUrl;
      a.click();
    }
  };

  const handleShare = async () => {
    if (!audioUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Interview recording', url: audioUrl });
      } catch {
        // ignore
      }
    } else {
      handleCopy();
    }
  };

  return (
    <div className="flex items-center gap-3 mt-2">
      {audioUrl ? (
        <>
          <button onClick={handleShare} className="px-3 py-1 bg-sky-600 text-white rounded text-sm">Share</button>
          <button onClick={handleCopy} className="px-3 py-1 border rounded text-sm">Copy link</button>
          <a href={audioUrl} target="_blank" rel="noreferrer" className="px-3 py-1 bg-gray-100 rounded text-sm">Open</a>
        </>
      ) : null}
    </div>
  );
}
