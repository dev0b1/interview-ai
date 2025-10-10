"use client";

import React from "react";
import { useAuth } from "../../lib/useAuth";

export default function SettingsPage() {
  // enforce auth
  const _auth = useAuth();
  const { signOut } = _auth;
  const [dark, setDark] = React.useState(false);

  React.useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 space-y-4">
      <h2 className="text-xl font-semibold">Settings</h2>

      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium">Dark theme</div>
          <div className="text-sm text-gray-500">Toggle the app theme</div>
        </div>
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={dark} onChange={(e) => setDark(e.target.checked)} />
          <span className="text-sm">{dark ? "On" : "Off"}</span>
        </label>
      </div>

      <div>
        <div className="font-medium">Audio device</div>
        <div className="text-sm text-gray-500">Select microphone and speaker (coming soon)</div>
      </div>

      <div className="pt-4">
        <button
          className="px-4 py-2 bg-red-600 text-white rounded"
          onClick={async () => {
            try {
              await signOut();
              // send the user to the auth page after sign out
              window.location.href = '/auth';
            } catch (err) {
              console.error('Sign out failed', err);
              alert('Sign out failed');
            }
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
