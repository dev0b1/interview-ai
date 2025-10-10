export async function fetchLivekitToken(name: string, room = "interview-room") {
  const res = await fetch(`/api/livekit/token?username=${encodeURIComponent(name)}&room=${encodeURIComponent(room)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `Failed to fetch token: ${res.status}`);
  }
  const payload = await res.json();
  return { token: payload.token as string, interviewId: payload.interviewId as string | undefined };
}
