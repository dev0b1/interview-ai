"use client";

import React from "react";
import {
  LiveKitRoom,
  useRoomContext,
  useLocalParticipant,
  useRemoteParticipants,
  RoomAudioRenderer,
} from "@livekit/components-react";
import TranscriptPanel, { Entry } from "./TranscriptPanel";
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import SummaryModal from "./SummaryModal";
import { useAuth } from "../lib/useAuth";
import { useRouter } from 'next/navigation';

type Props = {
  name: string;
  topic?: string;
  personality?: string;
  autoJoin?: boolean;
  onLeave?: () => void;
};

// Minimal local types to avoid using `any` across this file and satisfy lint rules.
type TrackLike = { track?: { enable?: (b: boolean) => void } };
type LocalParticipantLike = {
  setMicrophoneEnabled?: (b: boolean) => Promise<void> | void;
  publishData?: (data: string, opts?: Record<string, unknown>) => void;
  audioTracks?: TrackLike[];
  identity?: string;
};
type LKRoomLike = {
  localParticipant?: LocalParticipantLike & Record<string, unknown>;
  connectionState?: string;
  state?: string;
  disconnect?: () => void;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  off?: (event: string, handler: (...args: unknown[]) => void) => void;
};
// RemoteParticipantLike removed - not used in this file

function ParticipantsPanel({ onLeave }: { onLeave?: () => void }) {
  const localHook = useLocalParticipant();
  const remotes = useRemoteParticipants();
  // useRoomContext returns the room instance directly in this version
  const room = useRoomContext() as unknown as LKRoomLike | null;
  const [muted, setMuted] = React.useState(false);

  const toggleMute = async () => {
      try {
        // Try the most common API: setMicrophoneEnabled on localParticipant
        if (room?.localParticipant && typeof room.localParticipant.setMicrophoneEnabled === "function") {
          await room.localParticipant.setMicrophoneEnabled(!muted);
          setMuted((m) => !m);
          return;
        }
        // Fallback: try to enable/disable tracks directly
        const tracks = (room?.localParticipant?.audioTracks ?? []) as TrackLike[];
        tracks.forEach((t) => t.track?.enable ? t.track.enable(!muted) : null);
        setMuted((m) => !m);
      } catch {
        console.error("mute toggle failed");
      }
  };

  const leave = async () => {
    try {
      // stop local recorder if running
        try {
        const win = window as unknown as { __localRecorder?: MediaRecorder };
        const recorder = win.__localRecorder;
        if (recorder && recorder.state !== 'inactive') {
          recorder.stop();
        }
      } catch {
        // ignore
      }

      if (room && typeof room.disconnect === "function") {
        await room.disconnect();
      }
      try { onLeave?.(); } catch (err) { console.error('onLeave callback failed', err); }
    } catch (err) {
      console.error("leave failed", err);
    }
  };

  // recording helpers (attach recorder to window for debug)
  // recording helpers moved to parent InterviewRoom where refs/state are available

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">{(localHook as unknown as { localParticipant?: { identity?: string } })?.localParticipant?.identity?.[0] ?? "U"}</div>
            <div>
              <div className="font-semibold">You</div>
              <div className="text-sm text-gray-500">{(localHook as unknown as { localParticipant?: { identity?: string } })?.localParticipant?.identity ?? "local"}</div>
            </div>
          </div>
        <div className="flex items-center gap-2">
          <button onClick={toggleMute} className="px-3 py-1 bg-gray-100 rounded-md">
            {muted ? "Unmute" : "Mute"}
          </button>
          <button onClick={leave} className="px-3 py-1 bg-red-500 text-white rounded-md">
            Leave
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {remotes.map((p) => (
          <div key={p.sid} className="flex items-center gap-3 p-2 border rounded">
            <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center">{p?.identity?.[0] ?? "A"}</div>
            <div>
              <div className="font-medium">{p?.identity ?? "remote"}</div>
              <div className="text-sm text-gray-500">Remote participant</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RoomInstructionPublisher({ name, topic, personality }: { name: string; topic?: string; personality?: string }) {
  // This component must be rendered inside LiveKitRoom so hooks are available
  const room = useRoomContext() as unknown as LKRoomLike | null;

  React.useEffect(() => {
    if (!room) return;

    const payload = {
      type: 'agent.instruction',
      name: name || 'Candidate',
      topic: topic || '',
      personality: personality || 'Professional & Calm',
    };

    let cancelled = false;

    const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

    async function publishWithRetry() {
      const maxAttempts = 12;
      const baseBackoff = 300; // ms
      for (let attempt = 1; attempt <= maxAttempts && !cancelled; attempt++) {
        try {
          // only attempt publish when the room reports connected
          const state = room?.connectionState ?? room?.state ?? null;
          if (state === 'connected' && room?.localParticipant && typeof room.localParticipant.publishData === 'function') {
            // small extra delay after connection to allow PC manager to be ready
            if (attempt === 1) await delay(150);
            room.localParticipant.publishData(JSON.stringify(payload), { reliability: true });
            // success
            console.log('RoomInstructionPublisher: instruction published');
            return;
          }
        } catch {
          // swallow and retry
        }
        // exponential-ish backoff
          await delay(baseBackoff * attempt);
      }
  console.warn('RoomInstructionPublisher: failed to publish instruction after retries');
    }

    // fire-and-forget; the effect will clean up via cancelled flag
    void publishWithRetry();

    return () => {
      cancelled = true;
    };
  }, [room, name, topic, personality]);
  return null;
}

export default function InterviewRoom({ name, topic, personality, autoJoin }: Props) {
  // default mock personality
  const personalityLabel = personality ?? "Professional & Calm";
  const [token, setToken] = React.useState<string | null>(null);
  const [connecting, setConnecting] = React.useState(false);
  const [connected, setConnected] = React.useState(false);
  const [micLevel, setMicLevel] = React.useState(0);
  const analyserRef = React.useRef<AnalyserNode | null>(null);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const localStreamRef = React.useRef<MediaStream | null>(null);
  const [entries, setEntries] = React.useState<Entry[]>([]);
  const [running, setRunning] = React.useState(false);
  const [timeLeft, setTimeLeft] = React.useState(180); // default 3 minutes
  const [showSummary, setShowSummary] = React.useState(false);
  const [summary, setSummary] = React.useState<{ score: number; tone: string; pacing: string; notes: string } | null>(null);
  const [showTranscript, setShowTranscript] = React.useState(false);
  const [greeting, setGreeting] = React.useState<string | null>(null);

  // recording helpers (attach recorder to window for debug)
  const [interviewId, setInterviewId] = React.useState<string | null>(null);
  const [isRecording, setIsRecording] = React.useState(false);
  const [uploadStatus, setUploadStatus] = React.useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [uploadErrorText, setUploadErrorText] = React.useState<string | null>(null);
  // option: read session from global auth context so uploads include user's access token when available
  const { session } = useAuth();
  const router = useRouter();
  const autoJoinTriggeredRef = React.useRef(false);
  // client-side supabase (fallback) will be created on demand to read session for upload if needed
  const supabaseClientForBrowser = React.useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    if (!url || !anon) return null;
    try {
      return createSupabaseClient(url, anon, { auth: { persistSession: false } });
    } catch {
      return null;
    }
  }, []);

  React.useEffect(() => {
    let recorder: MediaRecorder | null = null;
    let recordedChunks: BlobPart[] = [];

    async function startRecording() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        localStreamRef.current = stream;
        const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        mr.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) recordedChunks.push(e.data);
        };
        mr.onstop = async () => {
          setIsRecording(false);
          try {
            // don't attempt upload when there's no recorded data
            if (!recordedChunks || recordedChunks.length === 0) {
              console.warn('no audio recorded — skipping upload');
              setUploadStatus('idle');
              return;
            }

            const blob = new Blob(recordedChunks, { type: 'audio/webm' });
            const form = new FormData();
            const id = interviewId || (Math.random().toString(36).slice(2, 10));
            form.append('interviewId', id);
            form.append('file', blob, `${id}.webm`);
            const base = process.env.NEXT_PUBLIC_BASE_URL || '';
            setUploadStatus('uploading');
            const headers: Record<string, string> = {};

            // Prefer session from useAuth(); fall back to client supabase if available
            try {
              const accessFromCtx = session?.access_token;
              if (accessFromCtx) {
                headers['Authorization'] = `Bearer ${accessFromCtx}`;
              } else if (supabaseClientForBrowser && typeof supabaseClientForBrowser.auth?.getSession === 'function') {
                const s = await supabaseClientForBrowser.auth.getSession();
                const access = s?.data?.session?.access_token;
                if (access) headers['Authorization'] = `Bearer ${access}`;
              }
            } catch {
              // ignore and continue; server will reject unauthorized uploads if needed
            }

            const res = await fetch(`${base}/api/interviews/audio/upload`, { method: 'POST', body: form, headers });
            if (!res.ok) {
              const text = await res.text().catch(() => '<no-body>');
              console.error('audio upload failed', res.status, text);
              setUploadStatus('error');
              setUploadErrorText(`Upload failed (${res.status}): ${text}`);
              return;
            }
            setUploadStatus('success');
            setUploadErrorText(null);
            // if we didn't have an interviewId yet, store the returned id (server doesn't return one here, so keep id)
            if (!interviewId) setInterviewId(id);
            // clear chunks
            recordedChunks = [];
          } catch (err) {
            console.error('audio upload failed', err);
            setUploadStatus('error');
            setUploadErrorText(String(err ?? 'unknown'));
          }
        };
        mr.start();
        setIsRecording(true);
        recorder = mr;
  const win = window as unknown as { __localRecorder?: MediaRecorder };
  win.__localRecorder = mr;
      } catch (err) {
        console.warn('could not start local recording', err);
      }
    }

    // start recording only when we are actually connected to the room
    if (connected) {
      startRecording();
    }

    return () => {
      try {
        if (recorder && recorder.state !== 'inactive') recorder.stop();
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach((t) => t.stop());
        }
        setIsRecording(false);
      } catch {
        // ignore cleanup errors
      }
    };
  }, [connected, interviewId, supabaseClientForBrowser, session?.access_token]);

  React.useEffect(() => {
    let raf = 0;
    const tick = () => {
      if (analyserRef.current) {
        const data = new Uint8Array(analyserRef.current.fftSize);
        analyserRef.current.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        setMicLevel(Math.min(1, rms * 3));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // mock AI questions rotation
  React.useEffect(() => {
    let id: number | undefined;
    const questionsFor = (topicName = "General") => {
      return [
        `Tell me about a recent ${topicName} project you worked on.`,
        `What was a technical challenge you faced on a ${topicName} problem?`,
        `How do you approach debugging and testing in ${topicName}?`,
        `Describe a time you improved performance or reliability in ${topicName}.`,
      ];
    };
    if (running) {
      const qs = questionsFor(topic ?? "General");
      let idx = 0;
      id = window.setInterval(() => {
        pushEntry("AI", qs[idx % qs.length]);
        idx++;
      }, 20_000);
    }
    return () => { if (id !== undefined) clearInterval(id); };
  }, [running, topic]);

  // simple timer effect
  // compute summary either via server endpoint or local heuristic
  const computeSummary = React.useCallback(async () => {
    // try server-side summarizer if available
    try {
      const res = await fetch("/api/ai/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries }),
      });
      if (res.ok) {
        const data = await res.json();
        setSummary(data);
        setShowSummary(true);
        return;
      }
      } catch {
        // ignore and fall back
        console.warn("server summary failed, falling back to local");
      }

    // local heuristic
    const userEntries = entries.filter((e) => e.who === "User");
    const totalUserWords = userEntries.reduce((s, e) => s + e.text.split(/\s+/).filter(Boolean).length, 0);
    const avgWords = userEntries.length ? totalUserWords / userEntries.length : 0;
    const pacing = avgWords < 8 ? "Slow" : avgWords < 20 ? "Good" : "Fast";
    const textAll = entries.map((e) => e.text).join(" ").toLowerCase();
    let tone = "Neutral";
    if (/thank|great|excellent|awesome|confident|confidently/.test(textAll)) tone = "Positive";
    if (/sorry|um\b|uh\b|like\b|guess\b|maybe\b/.test(textAll)) tone = "Hesitant";
    const score = Math.round(Math.min(100, 40 + userEntries.length * 8 + Math.min(20, avgWords)));
    const notes = userEntries.slice(-3).map((u) => `• ${u.text}`).join("\n");
    const local = { score, tone, pacing, notes };
    setSummary(local);
    setShowSummary(true);
  }, [entries]);

  React.useEffect(() => {
    if (!running) return;
    if (timeLeft <= 0) {
      setRunning(false);
      // compute and show summary when timer ends
      computeSummary();
      return;
    }
    const id = window.setInterval(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearInterval(id);
  }, [running, timeLeft, computeSummary]);

  // helper to append transcript entries (mocked for now)
  const pushEntry = (who: Entry["who"], text: string) => {
    setEntries((s) => [...s, { who, text, ts: Date.now() }]);
  };

  // Controls component: uses LiveKit hooks inside LiveKitRoom context
  function Controls({ onLeave }: { onLeave?: () => void }) {
  const room = useRoomContext() as unknown as LKRoomLike | null;
    const [mutedLocal, setMutedLocal] = React.useState(false);

    const toggleMuteLocal = async () => {
      try {
        if (room?.localParticipant && typeof room.localParticipant.setMicrophoneEnabled === "function") {
          await room.localParticipant.setMicrophoneEnabled(!mutedLocal);
          setMutedLocal((m) => !m);
          return;
        }
        const tracks = (room?.localParticipant?.audioTracks ?? []) as TrackLike[];
        tracks.forEach((t) => t.track?.enable ? t.track.enable(!mutedLocal) : null);
        setMutedLocal((m) => !m);
      } catch {
        console.error("mute toggle failed");
      }
    };

    const leaveLocal = async () => {
      try {
        // stop local recorder if running
        try {
        const win = window as unknown as { __localRecorder?: MediaRecorder };
        const recorder = win.__localRecorder;
        if (recorder && recorder.state !== 'inactive') {
          recorder.stop();
        }
      } catch {
          // ignore
        }

        if (room && typeof room.disconnect === "function") {
          await room.disconnect();
        }
        setToken(null);
        setConnected(false);
        try { onLeave?.(); } catch (err) { console.error('onLeave callback failed', err); }
      } catch (err) {
        console.error("leave failed", err);
      }
    };

    return (
      <div className="flex gap-2 mt-3">
        <button onClick={toggleMuteLocal} className="px-3 py-1 bg-gray-100 rounded">{mutedLocal ? "Unmute" : "Mute"}</button>
        <button onClick={leaveLocal} className="px-3 py-1 bg-red-500 text-white rounded">Leave</button>
        <button onClick={() => { setToken(null); setConnected(false); join(); }} className="px-3 py-1 border rounded">Reconnect</button>
        <button onClick={() => { setRunning(false); computeSummary(); }} className="px-3 py-1 bg-amber-500 text-white rounded">End Interview</button>
        <button onClick={() => { pushEntry("User", "(mock answer) I led the migration to TypeScript and improved performance by 30%."); }} className="px-3 py-1 border rounded">Add Mock Answer</button>
        <button onClick={() => setShowTranscript((s: boolean) => !s)} className="px-3 py-1 border rounded">Toggle Transcript</button>
      </div>
    );
  }

  const join = React.useCallback(async () => {
    try {
      setConnecting(true);

      // require a signed-in session before allowing join + uploads
      if (!session || !session.access_token) {
        // push user to auth page to sign in
        try {
          router.replace('/auth');
        } catch (err) {
          // fallback to full-page navigation (log for debugging)
          console.warn('router.replace failed, falling back to full navigation', err);
          window.location.href = '/auth';
        }
        return;
      }


  // request microphone + camera permission for local preview
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });

  try {
  const win = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  const Ctor = win.AudioContext || win.webkitAudioContext;
  // Ctor might be undefined in some browsers; the 'any' here is constrained to the runtime constructor
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctx = new (Ctor as any)();
        const src = ctx.createMediaStreamSource(stream as MediaStream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        src.connect(analyser);
        analyserRef.current = analyser;
      } catch {
        console.warn("AudioContext not available");
      }

      // set up local video preview
      try {
        localStreamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      } catch {
        console.warn("video preview failed");
      }

  // fetch token from our secure server route
  const { fetchLivekitToken } = await import("../lib/fetchLivekitToken");
  const resp = await fetchLivekitToken(name, "interview-room");
  if (!resp || !resp.token) throw new Error("no token returned");
  setToken(resp.token);
  if (resp.interviewId) setInterviewId(resp.interviewId);
      // start timer and add a welcome question from AI after join
      setRunning(true);
      setTimeLeft(180);
      setEntries([]);
      setSummary(null);
      setShowSummary(false);
      setTimeout(() => pushEntry("AI", "Hi! Let's begin the interview. Tell me about your recent project."), 1200);
    } catch (e) {
      console.error("join failed", e);
      // show a generic user-friendly message without leaking internal error shape
      alert("Failed to join interview: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setConnecting(false);
    }
  }, [session, router, name]);

  const retryUpload = React.useCallback(() => {
    // force a stop/start cycle of the recorder to re-trigger onstop upload flow
    try {
      const win = window as unknown as { __localRecorder?: MediaRecorder };
      const rec = win.__localRecorder;
      if (rec && rec.state !== 'inactive') {
        rec.stop();
      }
    } catch {
      // ignore
    }
  }, []);

  // Auto-join when autoJoin prop is set. join() is a stable callback.
  React.useEffect(() => {
    if (autoJoin && !autoJoinTriggeredRef.current) {
      autoJoinTriggeredRef.current = true;
      void join();
    }
  }, [autoJoin, join]);

  return (
  <div className="w-full max-w-4xl mx-auto bg-white rounded-2xl shadow-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">🎙️ <span>AI Interview Assistant</span></h2>
        <div className="flex items-center gap-3">
          <div className="text-sm text-gray-600">{connected ? "Connected" : token ? "Connecting..." : "Not connected"}</div>
          {/* recording badge */}
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-gray-300'}`} />
            <div className="text-xs text-gray-500">{isRecording ? 'Recording' : 'Idle'}</div>
          </div>
          {/* upload status */}
          <div className="text-xs">
            {uploadStatus === 'idle' && <span className="text-gray-500">No upload</span>}
            {uploadStatus === 'uploading' && <span className="text-amber-600">Uploading…</span>}
            {uploadStatus === 'success' && <span className="text-emerald-600">Upload OK</span>}
            {uploadStatus === 'error' && <span className="text-red-600">Upload failed</span>}
            {uploadStatus === 'error' && uploadErrorText ? (
              <div className="mt-2 text-xs text-red-600">
                <div>{uploadErrorText}</div>
                <button onClick={retryUpload} className="mt-1 px-2 py-1 bg-red-100 text-red-700 rounded text-xs">Retry</button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

  {!token ? (
        <div className="p-6 border rounded-md">
          <p className="mb-3 text-gray-700">Ready to join the live AI interview as <span className="font-semibold">{name}</span>.</p>

          <div className="mb-4">
            <div className="text-sm text-gray-600 mb-2">Microphone level</div>
            <div className="w-full h-3 bg-gradient-to-r from-gray-100 to-gray-200 rounded overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-400 via-yellow-300 to-red-400 transition-all"
                style={{ width: `${Math.round(micLevel * 100)}%`, transitionDuration: "120ms" }}
              />
            </div>
            <div className="text-xs text-gray-500 mt-2">Speak to see the level update. Make sure your mic is allowed.</div>
          </div>

          <div className="flex gap-3">
            <button onClick={join} disabled={connecting} className="px-4 py-2 bg-gradient-to-r from-sky-600 to-indigo-600 text-white rounded-md shadow hover:scale-[1.01] transition inline-flex items-center gap-2">
              {connecting ? (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25"/><path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="4" className="opacity-75"/></svg>
                  Joining…
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M10 2a1 1 0 00-.993.883L9 3v6.586L5.707 7.293a1 1 0 00-1.414 1.414l5 5a1 1 0 001.414 0l5-5a1 1 0 00-1.414-1.414L11 9.586V3a1 1 0 00-1-1z"/></svg>
                  Join Interview
                </>
              )}
            </button>
            <button onClick={() => alert('Test sound')} className="px-4 py-2 border rounded-md inline-flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-600" viewBox="0 0 20 20" fill="currentColor"><path d="M9 2a1 1 0 00-1 1v3H5a1 1 0 100 2h3v3a1 1 0 102 0V8h3a1 1 0 100-2H11V3a1 1 0 00-1-1z"/></svg>
              Test Audio
            </button>
          </div>
        </div>
      ) : (
        <LiveKitRoom
          token={token}
          serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL}
          connect={true}
          audio={true}
          video={false}
          onConnected={() => setConnected(true)}
          onDisconnected={() => {
            setConnected(false);
            setToken(null);
          }}
        >
          {/* show greeting banner if the agent published a greeting data message */}
          {greeting ? (
            <div className="p-3 mb-3 bg-amber-100 border-l-4 border-amber-400 rounded">
              <div className="font-semibold">Agent greeting</div>
              <div className="text-sm text-gray-700">{greeting}</div>
              <button onClick={() => setGreeting(null)} className="text-xs text-gray-500 mt-1">Dismiss</button>
            </div>
          ) : null}

          {/* DataMessageHandler attaches inside LiveKitRoom so hooks are available */}
          <DataMessageHandler onGreeting={(text: string) => { console.log('agent.greeting', text); setGreeting(text); }} />
          <RoomAudioRenderer />
          <RoomInstructionPublisher name={name} topic={topic} personality={personality} />
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 relative">
              {/* AI interviewer central feed (mock) */}
              <div className="w-full h-64 bg-gray-100 rounded-lg flex items-center justify-center">
                <div className="text-center">
                  <div className="w-40 h-40 rounded-full bg-gradient-to-br from-sky-400 to-indigo-600 flex items-center justify-center text-white text-xl font-bold mx-auto">AI</div>
                  <div className="mt-3 font-semibold">{personalityLabel} — AI Interviewer</div>
                  <div className="text-sm text-gray-500">(Mock video feed)</div>
                </div>
              </div>

              {/* bottom-left local preview */}
              <div className="absolute left-4 bottom-4 w-36 h-24 bg-black rounded overflow-hidden shadow">
                <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
              </div>

              <ParticipantsPanel />
              <div className="mt-4 text-sm text-gray-500">Time left: {Math.max(0, timeLeft)}s</div>
              <Controls />
            </div>
            <div>
              {/** transcript drawer **/}
              {showTranscript ? (
                <TranscriptPanel entries={entries} />
              ) : (
                <div className="p-4 border rounded text-sm text-gray-500">Transcript hidden — click Toggle Transcript to open.</div>
              )}
            </div>
          </div>
          <SummaryModal open={showSummary} onClose={() => setShowSummary(false)} summary={summary ?? { score: 0, tone: "", pacing: "", notes: "" }} />
        </LiveKitRoom>
      )}
    </div>
  );
}

function DataMessageHandler({ onGreeting }: { onGreeting: (text: string) => void }) {
  // This component must be inside LiveKitRoom to use the hook
  const room = useRoomContext() as unknown as LKRoomLike | null;

  React.useEffect(() => {
    if (!room) return;

  const handler = (payload: unknown) => {
      try {
        let data: unknown = payload;
        if (payload instanceof ArrayBuffer) {
          data = new TextDecoder().decode(new Uint8Array(payload));
        } else if (payload instanceof Uint8Array) {
          data = new TextDecoder().decode(payload);
        }

        if (typeof data === 'object' && data !== null && Object.prototype.hasOwnProperty.call(data, 'data')) {
          const rec = data as Record<string, unknown>;
          data = rec.data as unknown;
        }

        let obj: unknown = null;
        if (typeof data === 'string') {
          try {
            obj = JSON.parse(data);
          } catch {
            obj = null;
          }
        } else if (typeof data === 'object' && data !== null) {
          obj = data;
        }

        if (obj && typeof obj === 'object' && (obj as Record<string, unknown>).type === 'agent.greeting') {
          const candidate = (obj as Record<string, unknown>);
          const text = (candidate.text as string) || (candidate.message as string) || String(candidate);
          onGreeting(text);
        }
      } catch {
        console.warn('DataMessageHandler: error processing data message');
      }
    };

    try {
      if (typeof room.on === 'function') {
        room.on('dataReceived', handler);
        room.on('data_received', handler);
      }
    } catch {
      console.warn('DataMessageHandler: failed to attach handlers');
    }

    return () => {
      try {
        if (typeof room.off === 'function') {
          room.off('dataReceived', handler);
          room.off('data_received', handler);
        }
      } catch {
        // ignore
      }
    };
  }, [room, onGreeting]);

  return null;
}
