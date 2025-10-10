"use client";

import React from "react";
import { getHistory, deleteInterview, clearHistory, InterviewRecord } from "../../lib/history";
import { useRequireAuth } from "../../lib/useRequireAuth";

export default function HistoryPage() {
  // enforce auth
  const _auth = useRequireAuth();
  const [list, setList] = React.useState<InterviewRecord[]>([]);

  React.useEffect(() => setList(getHistory()), []);

  function handleDelete(id: string) {
    deleteInterview(id);
    setList(getHistory());
  }

  function handleExport() {
    const data = JSON.stringify(list, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "interview-history.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleClear() {
    clearHistory();
    setList([]);
  }

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">History</h2>
        <div className="flex gap-2">
          <button onClick={handleExport} className="px-3 py-1 border rounded">Export</button>
          <button onClick={handleClear} className="px-3 py-1 bg-red-500 text-white rounded">Clear</button>
        </div>
      </div>

      {list.length ? (
        <ul className="space-y-3">
          {list.map((r) => (
            <li key={r.id} className="flex items-center justify-between p-3 border rounded">
              <div>
                <div className="font-medium">{r.name}</div>
                <div className="text-sm text-gray-500">{new Date(r.date).toLocaleString()}</div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-sm text-gray-700">{r.score ? `${r.score}/100` : "—"}</div>
                <button onClick={() => handleDelete(r.id)} className="px-2 py-1 text-sm border rounded">Delete</button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="text-sm text-gray-500">No saved interviews.</div>
      )}
    </div>
  );
}
