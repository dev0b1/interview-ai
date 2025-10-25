/**
 * IMPROVED InterviewRoom Component
 * Key improvements:
 * 1. Use LiveKit's built-in transcript features
 * 2. Leverage @livekit/components-react properly
 * 3. Remove duplicate MediaRecorder (LiveKit already records)
 * 4. Better data message handling
 * 5. Proper TypeScript types
 * 6. Cleaner state management
 */

"use client";

import React from "react";
import {
  LiveKitRoom,
  useRoomContext,
  useLocalParticipant,
  useRemoteParticipants,
  RoomAudioRenderer,
  useDataChannel,
  useTracks,
} from "@livekit/components-react";
import { Track, RoomEvent } from "livekit-client";
import type { Room, RemoteParticipant } from "livekit-client";
import TranscriptPanel, { Entry } from "./TranscriptPanel";
import { saveInterview } from "../lib/history";
import SummaryModal from "./SummaryModal";
import { useAuth } from "../lib/useAuth";
import { useRouter } from "next/navigation";

// ============================================================================
// TYPES
// ============================================================================

interface InterviewRoomProps {
  name: string;
  topic?: string;
  personality?: string;
  autoJoin?: boolean;
  onLeave?: () => void;
}

interface AgentDataMessage {
  type: string;
  [key: string]: unknown;
}

interface InterviewSummary {
  score: number;
  tone: string;
  pacing: string;
  notes: string;
  metrics?: {
    clarity?: number;
    confidence?: number;
    filler_words?: number;
  };
  ai_feedback?: string;
}

// ============================================================================
// HOOK: Use LiveKit's DataChannel (simpler than manual handlers)
// ============================================================================

function useAgentMessages() {
  const [greeting, setGreeting] = React.useState<string | null>(null);
  const [summary, setSummary] = React.useState<InterviewSummary | null>(null);
  const [behaviorFlags, setBehaviorFlags] = React.useState<string[]>([]);
  const _rawMessagesRef = React.useRef<Array<{ topic?: string; data: Record<string, unknown> }>>([]);

  // LiveKit provides this hook to handle data messages
  // Agent may publish on different topics; listen to both common ones used by agent.py
  const { message: msgAgent } = useDataChannel("agent-messages");
  const { message: msgInterview } = useDataChannel("interview_results");

  React.useEffect(() => {
    const process = (messageVar: unknown) => {
        if (!messageVar) return;
        try {
          const mv = messageVar as { payload?: Uint8Array; topic?: string };
          const text = new TextDecoder().decode(mv.payload as Uint8Array);
          const data = JSON.parse(text) as AgentDataMessage | Record<string, unknown>;
          _rawMessagesRef.current = [{ topic: mv.topic, data }, ..._rawMessagesRef.current].slice(0, 20);

        // Normalize some common event shapes the backend uses
        const type = data?.type || data?.event || null;

        switch (type) {
          case "agent.greeting":
            setGreeting(data.text as string || data.message as string);
            break;

          case "interview_complete":
          case "agent.interview_complete":
            console.log("Interview complete:", (data as Record<string, unknown>)['results'] || data);
            // if the payload contains summary/metrics attach to summary (use safe access)
            const results = ((data as Record<string, unknown>)['results'] ?? data) as Record<string, unknown> | undefined;
            if (results) {
              const scoreObj = results['score'] as Record<string, unknown> | undefined;
              const overall = scoreObj && typeof scoreObj === 'object' ? Number(scoreObj['overall_score'] as number || 0) : 0;
              const tone = String(results['personality'] || '');
              const ai_fb = String(results['ai_feedback'] || results['aiFeedback'] || '');
              setSummary({
                score: overall,
                tone,
                pacing: "",
                notes: ai_fb,
                metrics: {},
                ai_feedback: ai_fb,
              });
            }
            break;

          case "agent.behavior_flag":
            setBehaviorFlags((prev) => [...prev, ...(data.issues as string[] || [])]);
            break;

          case "agent.post_interview_summary":
            setSummary({
              score: (data.metrics as { clarity?: number })?.clarity || 0,
              tone: "Professional",
              pacing: "Good",
              notes: (data.ai_feedback as string) || "",
              metrics: data.metrics as InterviewSummary["metrics"],
              ai_feedback: (data.ai_feedback as string),
            });
            break;
        }
      } catch (err) {
        console.warn("Failed to parse agent message:", err);
      }
    };

    process(msgAgent);
    process(msgInterview);
  }, [msgAgent, msgInterview]);

  return { greeting, summary, behaviorFlags, setGreeting };
}


// ============================================================================
// COMPONENT: DebugPanel - small in-room debug UI to inspect participants/tracks/data
// ============================================================================

function DebugPanel() {
  const room = useRoomContext();
  const remotes = useRemoteParticipants();
  const [events, setEvents] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (!room) return;

    const log = (msg: string) => setEvents((s) => [msg, ...s].slice(0, 50));

    const onParticipant = (p: unknown) => {
      const id = (p as Record<string, unknown>)['identity'] as string | undefined;
      log(`participant: ${id} connected`);
    };
    const offParticipant = (p: unknown) => {
      const id = (p as Record<string, unknown>)['identity'] as string | undefined;
      log(`participant: ${id} disconnected`);
    };
    const onData = (pkt: unknown) => {
      try {
        const pk = pkt as { data?: Uint8Array; topic?: string };
        const text = new TextDecoder().decode(pk.data as Uint8Array);
        log(`data[${pk.topic || 'unknown'}]: ${text.substring(0,120)}`);
      } catch {
        log(`data: <binary>`);
      }
    };

    try {
      room.on(RoomEvent.ParticipantConnected as never, onParticipant as never);
      room.on(RoomEvent.ParticipantDisconnected as never, offParticipant as never);
      room.on(RoomEvent.DataReceived as never, onData as never);
      } catch {
      // ignore
    }

    return () => {
      try {
        room.off(RoomEvent.ParticipantConnected as never, onParticipant as never);
        room.off(RoomEvent.ParticipantDisconnected as never, offParticipant as never);
        room.off(RoomEvent.DataReceived as never, onData as never);
  } catch {}
    };
  }, [room]);

  return (
    <div className="mt-4 p-3 border rounded bg-gray-50 text-sm">
      <div className="font-medium mb-2">Debug</div>
      <div className="mb-2">Local: {room?.localParticipant?.identity || 'unknown'}</div>
      <div className="mb-2">Remotes: {remotes.map(r => r.identity).join(', ') || 'none'}</div>
      <div className="max-h-40 overflow-auto bg-white p-2 border rounded">
        {events.length === 0 ? <div className="text-gray-400">No recent events</div> : events.map((e, i) => (
          <div key={i} className="text-xs">{e}</div>
        ))}
      </div>
    </div>
  );
}


// ============================================================================
// HOOK: LiveKit Transcript (built-in, no need for manual tracking)
// ============================================================================

function useInterviewTranscript() {
  const [entries, setEntries] = React.useState<Entry[]>([]);
  const room = useRoomContext();

  React.useEffect(() => {
    if (!room) return;

    // LiveKit emits transcription events
    const handleTranscription = (
        transcription: unknown,
        participant?: RemoteParticipant
      ) => {
      // transcription may come as a string or an object depending on LiveKit version/provider
      let text = '';
      if (!transcription) text = '';
      else if (typeof transcription === 'string') text = transcription;
      else if (typeof transcription === 'object') {
        // common shapes: { text }, { transcript }, { segments: [...] }
        const tObj = transcription as Record<string, unknown>;
        if (typeof tObj.text === 'string') text = String(tObj.text);
        else if (typeof tObj.transcript === 'string') text = String(tObj.transcript);
        else if (Array.isArray(tObj.segments)) {
          // join segments if present
          try {
            text = (tObj.segments as unknown[]).map((s) => String(((s as Record<string, unknown>)['text']) || ((s as Record<string, unknown>)['content']) || '')).join(' ');
          } catch {
            text = String(transcription);
          }
        } else {
          text = String(transcription);
        }
      } else {
        text = String(transcription);
      }

      const who = participant ? 'AI' : 'User';
      if (!text) return;
      setEntries((prev) => [
        ...prev,
        {
          who,
          text,
          ts: Date.now(),
        },
      ]);
    };

    // Some LiveKit versions use different event names
  room.on(RoomEvent.TranscriptionReceived as never, handleTranscription as never);
    
    return () => {
      room.off(RoomEvent.TranscriptionReceived as never, handleTranscription as never);
    };
  }, [room]);

  return entries;
}

// ============================================================================
// COMPONENT: Interview Controls (Mute, Leave, etc.)
// ============================================================================

function InterviewControls({
  onEndInterview,
  onLeave,
  interviewId,
}: {
  onEndInterview: () => void;
  onLeave: () => void;
  interviewId?: string | null;
}) {
  const { localParticipant } = useLocalParticipant();
  const [isMuted, setIsMuted] = React.useState(false);
  const [isRecording, setIsRecording] = React.useState(false);
  const [egressId, setEgressId] = React.useState<string | null>(null);
  const room = useRoomContext();

  const toggleMute = async () => {
    if (!localParticipant) return;
    
    try {
      await localParticipant.setMicrophoneEnabled(!isMuted);
      setIsMuted(!isMuted);
    } catch (err) {
      console.error("Failed to toggle mute:", err);
    }
  };

  const startRecording = async () => {
    try {
      if (!room) throw new Error('missing room');
      const roomName = String((room as unknown as Room).name || '');
      const interviewIdToSend = interviewId || null;

      if (!roomName || !interviewIdToSend) throw new Error('missing roomName or interviewId');

      const body = { roomName, interviewId: interviewIdToSend, format: 'mp4' };
      const res = await fetch('/api/livekit/egress/start', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'failed to start egress');
      const id = json?.result?.egressId || json?.result?.id || json?.result?.egress?.id || null;
      setEgressId(id);
      setIsRecording(true);
    } catch (err) {
      console.error('Failed to start recording', err);
      alert(`Failed to start recording: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const stopRecording = async () => {
    try {
      if (!egressId) throw new Error('no egressId');
      const res = await fetch('/api/livekit/egress/stop', { method: 'POST', body: JSON.stringify({ egressId }), headers: { 'Content-Type': 'application/json' } });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'failed to stop egress');
      setIsRecording(false);
      // keep egressId around for potential inspection
    } catch (err) {
      console.error('Failed to stop recording', err);
      alert(`Failed to stop recording: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleLeave = async () => {
    try {
      await room?.disconnect();
      onLeave();
    } catch (err) {
      console.error("Failed to leave:", err);
    }
  };

  return (
    <div className="flex gap-2 mt-4">
      <button
        onClick={toggleMute}
        className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-md transition"
      >
        {isMuted ? "🔇 Unmute" : "🎤 Mute"}
      </button>
      
      <button
        onClick={onEndInterview}
        className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-md transition"
      >
        End Interview
      </button>
      
      <button
        onClick={handleLeave}
        className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-md transition"
      >
        Leave Room
      </button>

      {/* Recording controls */}
      <div className="ml-2 flex items-center gap-2">
        {!isRecording ? (
          <button
            onClick={startRecording}
            className="px-3 py-2 bg-green-500 hover:bg-green-600 text-white rounded-md transition"
            title="Start recording"
          >
            ⏺ Start Recording
          </button>
        ) : (
          <button
            onClick={stopRecording}
            className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md transition"
            title="Stop recording"
          >
            ⏹ Stop Recording
          </button>
        )}

        <div className="text-sm text-gray-600">
          {isRecording ? (egressId ? `Recording (${egressId})` : 'Recording...') : 'Not recording'}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// COMPONENT: Audio Visualizer
// - Prejoin variant uses navigator.mediaDevices.getUserMedia so it can run
//   before joining a LiveKit Room (no LiveKit hooks required).
// - In-room variant uses LiveKit's `useTracks` hook and must be rendered
//   inside a `LiveKitRoom` provider.
// ============================================================================

function AudioVisualizerInRoom() {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const audioContextRef = React.useRef<AudioContext | null>(null);
  const analyserRef = React.useRef<AnalyserNode | null>(null);
  
  // This component must only be used inside a LiveKitRoom provider
  const tracks = useTracks([Track.Source.Microphone]);
  
  React.useEffect(() => {
    const audioTrack = tracks.find((t) => t.source === Track.Source.Microphone);
    // audioTrack can have different shapes depending on SDK versions; attempt common access patterns
    let mediaStreamTrack: MediaStreamTrack | null = null;
    try {
      const at = audioTrack as unknown as Record<string, unknown>;
      if (at?.track && typeof at.track === 'object') {
        mediaStreamTrack = ((at.track as Record<string, unknown>)['mediaStreamTrack']) as MediaStreamTrack | undefined ?? null;
      } else {
        mediaStreamTrack = ((at as Record<string, unknown>)['mediaStreamTrack']) as MediaStreamTrack | undefined ?? null;
      }
    } catch {
      mediaStreamTrack = null;
    }
    if (!mediaStreamTrack) return;

    try {
      const AudioContextClass = window.AudioContext || (window as never)['webkitAudioContext'];
      const ctx = new AudioContextClass();
      const stream = new MediaStream([mediaStreamTrack]);
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);

      audioContextRef.current = ctx;
      analyserRef.current = analyser;

      let animationId: number;
      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const draw = () => {
        const canvas = canvasRef.current;
        if (!canvas || !analyserRef.current) {
          animationId = requestAnimationFrame(draw);
          return;
        }

        const ctx2 = canvas.getContext('2d');
        if (!ctx2) {
          animationId = requestAnimationFrame(draw);
          return;
        }

        analyserRef.current!.getByteTimeDomainData(dataArray);

        ctx2.fillStyle = 'rgb(17, 24, 39)';
        ctx2.fillRect(0, 0, canvas.width, canvas.height);

        ctx2.lineWidth = 2;
        ctx2.strokeStyle = 'rgb(6, 182, 212)';
        ctx2.beginPath();

        const sliceWidth = canvas.width / dataArray.length;
        let x = 0;

        for (let i = 0; i < dataArray.length; i++) {
          const v = dataArray[i] / 128.0;
          const y = (v * canvas.height) / 2;

          if (i === 0) ctx2.moveTo(x, y);
          else ctx2.lineTo(x, y);

          x += sliceWidth;
        }

        ctx2.stroke();
        animationId = requestAnimationFrame(draw);
      };

      animationId = requestAnimationFrame(draw);

      return () => {
        cancelAnimationFrame(animationId);
        ctx.close();
      };
    } catch (err) {
      console.error('Failed to set up audio visualizer:', err);
    }
  }, [tracks]);

  return (
    <canvas ref={canvasRef} width={400} height={100} className="w-full h-20 rounded bg-gray-900" />
  );
}

function AudioVisualizerPrejoin() {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const audioContextRef = React.useRef<AudioContext | null>(null);
  const analyserRef = React.useRef<AnalyserNode | null>(null);
  const mediaStreamRef = React.useRef<MediaStream | null>(null);

  React.useEffect(() => {
    let mounted = true;

    const setup = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!mounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        mediaStreamRef.current = stream;

        const AudioContextClass = window.AudioContext || (window as never)['webkitAudioContext'];
        const ctx = new AudioContextClass();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        source.connect(analyser);

        audioContextRef.current = ctx;
        analyserRef.current = analyser;

        let animationId: number;
        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const draw = () => {
          const canvas = canvasRef.current;
          if (!canvas || !analyserRef.current) {
            animationId = requestAnimationFrame(draw);
            return;
          }

          const ctx2 = canvas.getContext('2d');
          if (!ctx2) {
            animationId = requestAnimationFrame(draw);
            return;
          }

          analyserRef.current!.getByteTimeDomainData(dataArray);

          ctx2.fillStyle = 'rgb(17, 24, 39)';
          ctx2.fillRect(0, 0, canvas.width, canvas.height);

          ctx2.lineWidth = 2;
          ctx2.strokeStyle = 'rgb(6, 182, 212)';
          ctx2.beginPath();

          const sliceWidth = canvas.width / dataArray.length;
          let x = 0;

          for (let i = 0; i < dataArray.length; i++) {
            const v = dataArray[i] / 128.0;
            const y = (v * canvas.height) / 2;

            if (i === 0) ctx2.moveTo(x, y);
            else ctx2.lineTo(x, y);

            x += sliceWidth;
          }

          ctx2.stroke();
          animationId = requestAnimationFrame(draw);
        };

        animationId = requestAnimationFrame(draw);

        // cleanup for canvas/analyser
        return () => {
          cancelAnimationFrame(animationId);
          ctx.close();
        };
      } catch (err) {
        console.error('Failed to set up prejoin visualizer:', err);
      }
    };

    const cleanupPromise = setup();

    return () => {
      mounted = false;
      // stop tracks
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      // audio context closed in inner cleanup
      // if setup hasn't finished, ensure we still attempt to close
      cleanupPromise.catch(() => {});
    };
  }, []);

  return <canvas ref={canvasRef} width={400} height={100} className="w-full h-20 rounded bg-gray-900" />;
}

// ============================================================================
// COMPONENT: Send Interview Config to Agent
// ============================================================================

function InterviewConfigPublisher({
  name,
  topic,
  personality,
  interviewId,
}: {
  name: string;
  topic?: string;
  personality?: string;
  interviewId?: string;
}) {
  const { localParticipant } = useLocalParticipant();
  const [published, setPublished] = React.useState(false);

  React.useEffect(() => {
    if (!localParticipant || published) return;

    // Wait a bit for connection to stabilize
    const timer = setTimeout(() => {
      try {
        const config = {
          type: "agent.instruction",
          name: name || "Candidate",
          topic: topic || "General",
          personality: personality || "balanced",
          interviewId: interviewId || null,
          instruction: `Conduct a ${personality || "balanced"} interview about ${topic || "general topics"} with ${name}.`,
        };

        localParticipant.publishData(
          new TextEncoder().encode(JSON.stringify(config)),
          { reliable: true }
        );

        setPublished(true);
        console.log("✅ Published interview config to agent");
      } catch (err) {
        console.error("Failed to publish config:", err);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [localParticipant, published, name, topic, personality, interviewId]);

  return null;
}

// ============================================================================
// MAIN COMPONENT: InterviewRoom
// ============================================================================

export default function InterviewRoom({
  name,
  topic,
  personality = "balanced",
  autoJoin = false,
  onLeave,
}: InterviewRoomProps) {
  const { session } = useAuth();
  const router = useRouter();

  const [token, setToken] = React.useState<string | null>(null);
  // track whether the LiveKitRoom reports we're connected
  const [, setConnected] = React.useState(false);
  const [interviewId, setInterviewId] = React.useState<string | null>(null);
  const [connecting, setConnecting] = React.useState(false);
  const [showTranscript, setShowTranscript] = React.useState(false);
  const [showSummary, setShowSummary] = React.useState(false);

  // ========================================================================
  // JOIN INTERVIEW
  // ========================================================================

  const joinInterview = React.useCallback(async () => {
    if (!session?.access_token) {
      router.push("/auth");
      return;
    }

    setConnecting(true);

    try {
      // Request mic permission
      await navigator.mediaDevices.getUserMedia({ audio: true });

      // Get LiveKit token from your backend
      const { fetchLivekitToken } = await import("../lib/fetchLivekitToken");
      const resp = await fetchLivekitToken(name, "interview-room");

      if (!resp?.token) {
        throw new Error("Failed to get token");
      }

      setToken(resp.token);
      setInterviewId(resp.interviewId || `interview-${Date.now()}`);

      // Save to history
      if (resp.interviewId) {
        saveInterview({
          id: resp.interviewId,
          name: name || "Interview",
          date: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error("Join failed:", err);
      alert(`Failed to join: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setConnecting(false);
    }
  }, [session, router, name]);

  // Auto-join if prop is set
  React.useEffect(() => {
    if (autoJoin && !token) {
      void joinInterview();
    }
  }, [autoJoin, token, joinInterview]);

  // ========================================================================
  // RENDER: Pre-join screen
  // ========================================================================

  if (!token) {
    return (
      <div className="w-full max-w-4xl mx-auto bg-white rounded-2xl shadow-lg p-8">
        <h2 className="text-2xl font-bold mb-6">🎙️ AI Interview Setup</h2>
        
        <div className="space-y-4 mb-6">
          <div>
            <span className="font-medium">Candidate:</span> {name}
          </div>
          <div>
            <span className="font-medium">Topic:</span> {topic || "General"}
          </div>
          <div>
            <span className="font-medium">Personality:</span> {personality}
          </div>
        </div>

  <AudioVisualizerPrejoin />

        <button
          onClick={joinInterview}
          disabled={connecting}
          className="mt-6 px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg font-medium hover:scale-105 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {connecting ? "Connecting..." : "🚀 Start Interview"}
        </button>
      </div>
    );
  }

  // ========================================================================
  // RENDER: In-interview screen
  // ========================================================================

  return (
    <div className="w-full max-w-6xl mx-auto bg-white rounded-2xl shadow-lg p-6">
      <LiveKitRoom
        token={token}
        serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL}
        connect={true}
        audio={true}
        video={false}
        // Enable LiveKit recording-friendly options
        options={{
          dynacast: true,
          adaptiveStream: true,
        }}
        onConnected={() => setConnected(true)}
        onDisconnected={() => {
          setConnected(false);
          setToken(null);
          onLeave?.();
        }}
      >
        {/* This component lives INSIDE LiveKitRoom so it can use hooks */}
        <InterviewRoomContent
          name={name}
          topic={topic}
          personality={personality}
          interviewId={interviewId}
          showTranscript={showTranscript}
          showSummary={showSummary}
          onToggleTranscript={() => setShowTranscript(!showTranscript)}
          onEndInterview={() => setShowSummary(true)}
          onLeave={() => {
            setToken(null);
            onLeave?.();
          }}
        />
      </LiveKitRoom>
    </div>
  );
}

// ============================================================================
// INNER COMPONENT: Must be inside LiveKitRoom to use hooks
// ============================================================================

function InterviewRoomContent({
  name,
  topic,
  personality,
  interviewId,
  showTranscript,
  showSummary,
  onToggleTranscript,
  onEndInterview,
  onLeave,
}: {
  name: string;
  topic?: string;
  personality?: string;
  interviewId?: string | null;
  showTranscript: boolean;
  showSummary: boolean;
  onToggleTranscript: () => void;
  onEndInterview: () => void;
  onLeave: () => void;
}) {
  const { greeting, summary, behaviorFlags, setGreeting } = useAgentMessages();
  const entries = useInterviewTranscript();
  const room = useRoomContext();
  const remotes = useRemoteParticipants();

  // room.state is a string-like state; avoid using the ConnectionState component type here
  const connectionState = room?.state as unknown as string | undefined;
  const isConnected = connectionState === 'connected' || connectionState === 'Connected';

  return (
    <>
      <RoomAudioRenderer />
      
      {/* Send config to agent once connected */}
      {isConnected && (
        <InterviewConfigPublisher
          name={name}
          topic={topic}
          personality={personality}
          interviewId={interviewId || undefined}
        />
      )}

      {/* Connection status */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">
          🎤 Live Interview
        </h2>
        <div className="flex items-center gap-3">
          <div
            className={`px-3 py-1 rounded-full text-sm ${
              isConnected
                ? "bg-green-100 text-green-700"
                : "bg-yellow-100 text-yellow-700"
            }`}
          >
            {isConnected ? "● Connected" : "○ Connecting..."}
          </div>
          <div className="text-sm text-gray-600">
            {remotes.length > 0 ? "AI Agent Active" : "Waiting for agent..."}
          </div>
        </div>
      </div>

      {/* Agent greeting banner */}
      {greeting && (
        <div className="mb-4 p-4 bg-blue-50 border-l-4 border-blue-500 rounded">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-medium text-blue-900">Agent says:</div>
              <div className="text-blue-800">{greeting}</div>
            </div>
            <button
              onClick={() => setGreeting(null)}
              className="text-blue-600 hover:text-blue-800"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Behavior flags */}
      {behaviorFlags.length > 0 && (
        <div className="mb-4 p-3 bg-amber-50 border-l-4 border-amber-500 rounded">
          <div className="font-medium text-amber-900">⚠️ Areas to improve:</div>
          <ul className="mt-2 space-y-1">
            {behaviorFlags.map((flag, i) => (
              <li key={i} className="text-sm text-amber-800">
                • {flag}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Video area */}
        <div className="lg:col-span-2">
          <div className="aspect-video bg-gradient-to-br from-gray-900 to-gray-800 rounded-lg flex items-center justify-center">
            <div className="text-center text-white">
              <div className="w-32 h-32 mx-auto rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-4xl">
                🤖
              </div>
              <div className="mt-4 text-lg font-medium">{personality} AI Interviewer</div>
              <div className="text-sm text-gray-400">Voice-only interview</div>
            </div>
          </div>

          <AudioVisualizerInRoom />
          
          <InterviewControls
            onEndInterview={onEndInterview}
            onLeave={onLeave}
            interviewId={interviewId}
          />
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <button
            onClick={onToggleTranscript}
            className="w-full px-4 py-2 border rounded-lg hover:bg-gray-50"
          >
            {showTranscript ? "Hide" : "Show"} Transcript
          </button>

          {showTranscript && <TranscriptPanel entries={entries} />}
          {/* Debug panel to help diagnose missing audio/transcript */}
          <DebugPanel />
        </div>
      </div>

      {/* Summary modal */}
      {showSummary && summary && (
        <SummaryModal
          open={true}
          summary={summary}
          onClose={() => window.location.reload()}
        />
      )}
    </>
  );
}
