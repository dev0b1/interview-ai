export type InterviewRecord = {
  id: string;
  name: string;
  date: string; // ISO
  durationSec?: number;
  score?: number; // 0-100
  notes?: string;
};

const KEY = "hroast_history";

export function getHistory(): InterviewRecord[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as InterviewRecord[];
  } catch (e) {
    console.error("getHistory failed", e);
    return [];
  }
}

export function saveInterview(rec: InterviewRecord) {
  const list = getHistory();
  list.unshift(rec);
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function deleteInterview(id: string) {
  const list = getHistory().filter((r) => r.id !== id);
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function clearHistory() {
  localStorage.removeItem(KEY);
}

// Return any pending uploads stored in the IndexedDB by InterviewRoom
export async function getPendingUploads(): Promise<Array<{ id: string; ts: number }>> {
  try {
    const req = indexedDB.open('hroast-uploads', 1);
    return await new Promise((resolve) => {
      req.onsuccess = () => {
        try {
          const db = req.result;
          const tx = db.transaction('uploads', 'readonly');
          const store = tx.objectStore('uploads');
          const all = store.getAll();
          interface Rec { id: string; blob?: Blob; ts?: number }
          all.onsuccess = () => resolve((all.result || []).map((r: Rec) => ({ id: r.id, ts: (r.ts || Date.now()) })));
          all.onerror = () => resolve([]);
        } catch {
          resolve([]);
        }
      };
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}
