export async function fetchLivekitToken(name: string, room = "hroast-room", token?: string) {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`/api/livekit/token?username=${encodeURIComponent(name)}&room=${encodeURIComponent(room)}`, { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `Failed to fetch token: ${res.status}`);
  }
  const payload = await res.json();
  return { token: payload.token as string, interviewId: payload.interviewId as string | undefined };
}
