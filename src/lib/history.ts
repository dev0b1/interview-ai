export type InterviewRecord = {
  id: string;
  name: string;
  date: string; // ISO
  durationSec?: number;
  score?: number; // 0-100
  notes?: string;
};

const KEY = "interview_ai_history";

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
