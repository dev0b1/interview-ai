/**
 * Single Page Interview - Everything visible from start
 * Dropdowns under the video card, Start button toggles to control buttons
 */

"use client";

import React from "react";
import { motion } from "framer-motion";
import { useAuth } from "../../lib/useAuth";
import { useRouter } from 'next/navigation';
import {
  LiveKitRoom,
  useRoomContext,
  useLocalParticipant,
  useRemoteParticipants,
  RoomAudioRenderer,
  useDataChannel,
  useTracks,
  BarVisualizer,
  useTranscriptions,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import type { Room } from "livekit-client";
import TranscriptPanel, { Entry } from "../../components/TranscriptPanel";
import { saveInterview } from "../../lib/history";
import SummaryModal from "../../components/SummaryModal";

// ============================================================================
// TYPES
// ============================================================================

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
// CONFIGURATION OPTIONS
// ============================================================================

const INTERVIEW_ROLES = [
  { id: "frontend", label: "Frontend Developer" },
  { id: "backend", label: "Backend Developer" },
  { id: "fullstack", label: "Full Stack Developer" },
  { id: "data", label: "Data Scientist" },
  { id: "devops", label: "DevOps Engineer" },
  { id: "product", label: "Product Manager" },
  { id: "general", label: "General Interview" },
];

// Roast mode only - no personality selection needed

// ============================================================================
// HOOKS
// ============================================================================

function useAgentMessages() {
  const [greeting, setGreeting] = React.useState<string | null>(null);
  const [summary, setSummary] = React.useState<InterviewSummary | null>(null);
  const [behaviorFlags, setBehaviorFlags] = React.useState<string[]>([]);
  const [confidence, setConfidence] = React.useState<number | null>(null);
  const [professionalism, setProfessionalism] = React.useState<number | null>(null);
  const [roastMessages, setRoastMessages] = React.useState<string[]>([]);

  const { message: msgAgent } = useDataChannel("agent-messages");
  const { message: msgInterview } = useDataChannel("interview_results");
  const { message: msgLiveMetrics } = useDataChannel("live-metrics");

  React.useEffect(() => {
    const process = (messageVar: unknown) => {
      if (!messageVar) return;
      try {
        const mv = messageVar as { payload?: Uint8Array; topic?: string };
        const text = new TextDecoder().decode(mv.payload as Uint8Array);
        const data = JSON.parse(text) as AgentDataMessage | Record<string, unknown>;

        const type = data?.type || data?.event || null;

  switch (type) {
          case "agent.greeting":
            setGreeting(data.text as string || data.message as string);
            break;

          case "interview_complete":
          case "agent.interview_complete":
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
            // also push a brief roast message if provided
            if ((data as Record<string, unknown>)['message']) {
              setRoastMessages((r) => [String((data as Record<string, unknown>)['message']), ...r].slice(0, 5));
            }
            break;

          case "agent.post_interview_summary":
            // Extract potential numeric metrics if present
            const metricsRec = (data as Record<string, unknown>)['metrics'] as Record<string, unknown> | undefined;
            const conf = metricsRec ? Number(metricsRec['confidence'] as number ?? metricsRec['clarity'] as number ?? NaN) : NaN;
            const prof = metricsRec ? Number(metricsRec['professionalism'] as number ?? NaN) : NaN;
            // Agent metrics are usually 0-100; convert to 0-10 scale for UI consistency
            if (!Number.isNaN(conf)) setConfidence(Math.round(conf / 10));
            if (!Number.isNaN(prof)) setProfessionalism(Math.round(prof / 10));
            setSummary({
              score: (data.metrics as { clarity?: number })?.clarity || 0,
              tone: "Professional",
              pacing: "Good",
              notes: (data.ai_feedback as string) || "",
              metrics: data.metrics as InterviewSummary["metrics"],
              ai_feedback: (data.ai_feedback as string),
            });
            if ((data as Record<string, unknown>)['ai_feedback']) {
              setRoastMessages((r) => [String((data as Record<string, unknown>)['ai_feedback']), ...r].slice(0, 5));
            }
            break;
        }
      } catch (err) {
        console.warn("Failed to parse agent message:", err);
      }
    };

    process(msgAgent);
    process(msgInterview);
    // live metrics channel: lightweight numeric updates
    try {
      if (msgLiveMetrics) {
        const mv = msgLiveMetrics as { payload?: Uint8Array };
        const text = new TextDecoder().decode(mv.payload as Uint8Array);
        const d = JSON.parse(text) as Record<string, unknown> | null;
        if (d) {
          const confRaw = Number(d['confidence_score'] ?? d['confidence'] ?? NaN);
          const profRaw = Number(d['professionalism_score'] ?? d['professionalism'] ?? NaN);
          if (!Number.isNaN(confRaw)) setConfidence(Math.round(confRaw / 10));
          if (!Number.isNaN(profRaw)) setProfessionalism(Math.round(profRaw / 10));
          if (d['ai_feedback']) setRoastMessages((r) => [String(d['ai_feedback']), ...r].slice(0, 5));
        }
      }
    } catch (err) {
      console.warn('Failed to parse live-metrics message', err);
    }
  }, [msgAgent, msgInterview, msgLiveMetrics]);

  return { greeting, summary, behaviorFlags, setGreeting, confidence, professionalism, roastMessages };
}

function useInterviewTranscript(): Entry[] {
  const transcriptions = useTranscriptions();
  const { localParticipant } = useLocalParticipant();
  
  const entries = React.useMemo((): Entry[] => {
    if (!transcriptions || transcriptions.length === 0) return [];
    
    return transcriptions.map((transcription): Entry => {
      const data = transcription as unknown as { 
        text?: string; 
        participant?: { identity?: string };
        participantIdentity?: string;
      };
      
      const participantId = data.participantIdentity || data.participant?.identity;
      const isLocal = participantId === localParticipant?.identity;
      
      return {
        who: isLocal ? 'User' : 'AI',
        text: data.text || '',
        ts: Date.now(),
      };
    }).filter(entry => entry.text.trim().length > 0);
  }, [transcriptions, localParticipant]);

  return entries;
}

// ============================================================================
// COMPONENTS
// ============================================================================

function InterviewConfigPublisher({
  name,
  topic,
  interviewId,
  enabled,
}: {
  name: string;
  topic: string;
  interviewId?: string;
  enabled: boolean;
}) {
  const { localParticipant } = useLocalParticipant();
  const [published, setPublished] = React.useState(false);

  React.useEffect(() => {
    if (!localParticipant || published || !enabled) return;

    const timer = setTimeout(() => {
      try {
        const config = {
          type: "agent.instruction",
          name: name || "Candidate",
          topic: topic || "General",
          personality: 'roast',
          interviewId: interviewId || null,
          instruction: `Conduct a roast interview about ${topic} with ${name}.`,
        };

        const encoder = new TextEncoder();
        const data = encoder.encode(JSON.stringify(config));
        
        localParticipant.publishData(data, { reliable: true });

        setPublished(true);
        console.log("✅ Published interview config to agent");
      } catch (err) {
        console.error("Failed to publish config:", err);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [localParticipant, published, name, topic, interviewId, enabled]);

  return null;
}

function InterviewControls({
  isInterviewStarted,
  onStartInterview,
  onEndInterview,
  interviewId,
  disabled,
}: {
  isInterviewStarted: boolean;
  onStartInterview: () => void;
  onEndInterview: () => void;
  interviewId?: string | null;
  disabled?: boolean;
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
      const res = await fetch('/api/livekit/egress/start', { 
        method: 'POST', 
        body: JSON.stringify(body), 
        headers: { 'Content-Type': 'application/json' } 
      });
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
      const res = await fetch('/api/livekit/egress/stop', { 
        method: 'POST', 
        body: JSON.stringify({ egressId }), 
        headers: { 'Content-Type': 'application/json' } 
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'failed to stop egress');
      setIsRecording(false);
    } catch (err) {
      console.error('Failed to stop recording', err);
      alert(`Failed to stop recording: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  if (!isInterviewStarted) {
    return (
      <button
        onClick={onStartInterview}
        disabled={disabled}
        className="w-full px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg font-semibold text-lg hover:scale-105 transform transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_8px_30px_rgba(99,102,241,0.08)]"
      >
        🚀 Start Interview
      </button>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          onClick={toggleMute}
          className={`px-4 py-2 rounded-md transition font-medium ${isMuted ? 'bg-red-600 text-white' : 'bg-gray-800 text-white'} shadow-md hover:brightness-105`}
        >
          {isMuted ? "🔇 Unmute" : "🎤 Mute"}
        </button>
        
        <button
          onClick={onEndInterview}
          className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-md transition font-medium shadow-[0_6px_20px_rgba(245,158,11,0.08)] hover:brightness-105"
        >
          ⏹ End Interview
        </button>

        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-gradient-to-r from-red-600 to-rose-600 text-white rounded-md transition font-medium shadow-[0_6px_20px_rgba(239,68,68,0.08)] hover:brightness-105"
        >
          Leave & End Interview
        </button>

        {!isRecording ? (
          <button
            onClick={startRecording}
            className="px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-500 text-white rounded-md transition font-medium shadow-[0_8px_30px_rgba(59,130,246,0.08)] hover:brightness-105"
          >
            ⏺ Record
          </button>
        ) : (
          <button
            onClick={stopRecording}
            className="px-4 py-2 bg-gradient-to-r from-sky-700 to-blue-800 text-white rounded-md transition font-medium shadow-[0_8px_30px_rgba(14,165,233,0.06)] hover:brightness-105"
          >
            ⏹ Stop Recording
          </button>
        )}
      </div>

      {isRecording && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-50 text-red-700 rounded-md text-sm">
          <span className="animate-pulse text-red-500">●</span>
          <span className="font-medium">Recording</span>
        </div>
      )}
    </div>
  );
}

function InterviewRoomContent({
  name,
  topic,
  interviewId,
  isInterviewStarted,
  onStartInterview,
  onEndInterview,
  connecting,
}: {
  name: string;
  topic: string;
  interviewId?: string | null;
  isInterviewStarted: boolean;
  onStartInterview: () => void;
  onEndInterview: () => void;
  connecting?: boolean;
}) {
  const { greeting, summary, behaviorFlags, setGreeting, confidence, professionalism, roastMessages } = useAgentMessages();
  const entries = useInterviewTranscript();
  const room = useRoomContext();
  const remotes = useRemoteParticipants();
  const { localParticipant } = useLocalParticipant();
  const tracks = useTracks([Track.Source.Microphone]);
  const microphoneTrack = tracks.find((t) => t.source === Track.Source.Microphone);
  const [showTranscript, setShowTranscript] = React.useState(false);
  const [showSummary, setShowSummary] = React.useState(false);
  // UI polish: small pulse triggers for animated number feedback
  const [confPulse, setConfPulse] = React.useState(false);
  const [profPulse, setProfPulse] = React.useState(false);

  React.useEffect(() => {
    if (confidence === null) return;
    setConfPulse(true);
    const t = setTimeout(() => setConfPulse(false), 300);
    return () => clearTimeout(t);
  }, [confidence]);

  React.useEffect(() => {
    if (professionalism === null) return;
    setProfPulse(true);
    const t = setTimeout(() => setProfPulse(false), 300);
    return () => clearTimeout(t);
  }, [professionalism]);

  const connectionState = room?.state as unknown as string | undefined;
  const isConnected = connectionState === 'connected' || connectionState === 'Connected';

  // When summary is received from agent, show it
  React.useEffect(() => {
    if (summary && isInterviewStarted) {
      setShowSummary(true);
    }
  }, [summary, isInterviewStarted]);

  return (
    <>
      {/* Only render audio from remote participants (not local) */}
      <RoomAudioRenderer />
      
      {/* Send config when interview starts */}
      {isInterviewStarted && localParticipant && (
        <InterviewConfigPublisher
          name={name}
          topic={topic}
          interviewId={interviewId || undefined}
          enabled={isInterviewStarted}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">
          {isInterviewStarted ? "🎤 Interview in Progress" : "🎯 Interview Setup"}
        </h2>
        <div className="flex items-center gap-3">
          <div
            className={`px-3 py-1 rounded-full text-sm font-medium ${
              isConnected
                ? "bg-green-100 text-green-700"
                : "bg-yellow-100 text-yellow-700"
            }`}
          >
            {isConnected ? "● Connected" : "○ Connecting..."}
          </div>
          <div className="text-sm text-gray-600 font-medium">
            {remotes.length > 0 ? "AI Agent Active" : "Waiting for agent..."}
          </div>
        </div>
      </div>

      {/* Agent greeting */}
      {greeting && (
        <div className="mb-4 p-4 bg-blue-50 border-l-4 border-blue-500 rounded">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-medium text-blue-900">Agent says:</div>
              <div className="text-blue-800">{greeting}</div>
            </div>
            <button
              onClick={() => setGreeting(null)}
              className="text-blue-600 hover:text-blue-800 font-bold"
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

      {/* Main content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
  <div className="lg:col-span-2">
          {/* Roast Arena — Pro Practice Mode Card */}
          <div className="aspect-video bg-gradient-to-br from-gray-900/80 to-[#0f0520] rounded-lg flex items-center justify-center p-6">
            <div className="w-full max-w-2xl mx-auto text-white grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
              {/* Left: progress indicator */}
              <div className="md:col-span-3">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm text-gray-300">Question {Math.min(5, (behaviorFlags.length || 0) + 1)} of 5</div>
                  <div className="text-sm text-gray-400">Roast Intensity</div>
                </div>
                <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                  {(() => {
                    const total = 5;
                    const current = Math.min(total, Math.max(1, (behaviorFlags.length || 0) + 1));
                    const pct = Math.round((current / total) * 100);
                    const color = pct > 75 ? 'bg-red-500' : pct > 50 ? 'bg-orange-400' : 'bg-blue-400';
                    return <div className={`${color} h-2`} style={{ width: `${pct}%` }} />;
                  })()}
                </div>
              </div>

              {/* Avatar & metrics */}
              <div className="flex flex-col items-center md:col-span-1">
                <div className="w-36 h-36 rounded-full bg-gradient-to-br from-[#6ee7ff]/30 via-[#9b5cff]/20 to-[#7c3aed]/30 flex items-center justify-center text-5xl mb-4 shadow-lg ring-1 ring-white/10">
                  🤖
                </div>
                <div className="w-full text-center">
                  <div className="text-sm text-gray-300">Confidence Score</div>
                  <motion.div
                    animate={confPulse ? { scale: 1.06 } : { scale: 1 }}
                    transition={{ duration: 0.18 }}
                    className="text-xl font-semibold text-white"
                  >
                    {confidence !== null ? `${Math.round(confidence)}/10` : (summary?.metrics?.clarity ? `${Math.round((summary.metrics.clarity || 0))}/10` : '8/10')}
                  </motion.div>

                  {/* animated bar */}
                  <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden mt-2">
                    <motion.div
                      className="h-2 bg-emerald-400 rounded"
                      animate={{ width: `${((confidence ?? (summary?.metrics?.clarity ?? 8)) as number) * 10}%` }}
                      transition={{ type: 'tween', duration: 0.6 }}
                    />
                  </div>
                </div>

                <div className="w-full text-center mt-2">
                  <div className="text-sm text-gray-300">Professionalism</div>
                  <motion.div
                    animate={profPulse ? { scale: 1.06 } : { scale: 1 }}
                    transition={{ duration: 0.18 }}
                    className="text-xl font-semibold text-white"
                  >
                    {professionalism !== null ? `${Math.round(professionalism)}/10` : (summary?.metrics?.confidence ? `${Math.round((summary.metrics.confidence || 0))}/10` : '7/10')}
                  </motion.div>

                  {/* animated bar */}
                  <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden mt-2">
                    <motion.div
                      className="h-2 bg-sky-400 rounded"
                      animate={{ width: `${((professionalism ?? (summary?.metrics?.confidence ?? 7)) as number) * 10}%` }}
                      transition={{ type: 'tween', duration: 0.6 }}
                    />
                  </div>
                </div>
              </div>

              {/* Center: Roast feedback area */}
              <div className="md:col-span-2 bg-white/5 rounded-lg p-4 flex flex-col justify-between">
                <div>
                  <div className="text-sm text-gray-300 mb-2">Roast Feedback</div>
                  <div className="min-h-[64px] text-sm text-white/90">
                    {roastMessages && roastMessages.length ? roastMessages[0] : (summary?.ai_feedback ? summary.ai_feedback : (behaviorFlags && behaviorFlags.length ? behaviorFlags[0] : 'No feedback yet — ace the next one!'))}
                  </div>
                </div>
                <div className="mt-3 text-xs text-gray-400">Live suggestions update after each answer</div>
              </div>
            </div>
          </div>

          {/* Audio Visualizer */}
          {isInterviewStarted && microphoneTrack && (
            <div className="mt-4">
              <BarVisualizer 
                state="speaking"
                barCount={7}
                trackRef={microphoneTrack}
                className="h-20"
              />
            </div>
          )}
        </div>

        <div className="space-y-4">
          {/* Right-side placeholder for Transcript / Tips toggle (future feature) */}
          <div className="bg-white/3 rounded-lg p-4 min-h-[160px]">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-medium text-gray-200">Transcript / Tips</div>
              <div className="text-xs text-gray-400">coming soon</div>
            </div>
            <div className="text-sm text-gray-300">Toggle between transcript and bite-sized tips for improvement. This panel will host the transcript, short tips, and targeted practice prompts.</div>
            <div className="mt-4">
              <button
                onClick={() => setShowTranscript(!showTranscript)}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md shadow-sm hover:brightness-105"
              >
                {showTranscript ? "Hide" : "Show"} Transcript
              </button>
            </div>
            {showTranscript && <div className="mt-3"><TranscriptPanel entries={entries} /></div>}
          </div>
        </div>
      </div>

      {showSummary && summary && (
        <SummaryModal
          open={true}
          summary={summary}
          onClose={() => {
            setShowSummary(false);
            // Reload page to start fresh
            window.location.reload();
          }}
        />
      )}
    </>
  );
}

// ============================================================================
// MAIN PAGE COMPONENT
// ============================================================================

export default function InterviewPage() {
  const { session, initializing } = useAuth();
  const router = useRouter();

  // Auth check
  React.useEffect(() => {
    if (!initializing && !session) {
      try {
        router.replace('/auth');
      } catch {
        window.location.href = '/auth';
      }
    }
  }, [initializing, session, router]);

  // Interview state
  const [selectedRole, setSelectedRole] = React.useState("frontend");
  // roast-only mode: no personality selection
  const [token, setToken] = React.useState<string | null>(null);
  const [interviewId, setInterviewId] = React.useState<string | null>(null);
  const [connecting, setConnecting] = React.useState(false);
  const [isInterviewStarted, setIsInterviewStarted] = React.useState(false);

  // Get user name
  const userName = React.useMemo(() => {
    return session?.user?.user_metadata?.full_name || 
           session?.user?.email || 
           "Candidate";
  }, [session]);

  // Connect to room immediately on mount
  const connectToRoom = React.useCallback(async () => {
    if (!session?.access_token) {
      router.push("/auth");
      return;
    }

    setConnecting(true);

    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });

      const { fetchLivekitToken } = await import("../../lib/fetchLivekitToken");
      const resp = await fetchLivekitToken(userName, "interview-room");

      if (!resp?.token) {
        throw new Error("Failed to get token");
      }

      setToken(resp.token);
      const newInterviewId = resp.interviewId || `interview-${Date.now()}`;
      setInterviewId(newInterviewId);

      if (resp.interviewId) {
        saveInterview({
          id: resp.interviewId,
          name: `${selectedRole}`,
          date: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error("Connection failed:", err);
      alert(`Failed to connect: ${err instanceof Error ? err.message : "Unknown error"}`);
      setToken(null);
    } finally {
      setConnecting(false);
    }
  }, [session?.access_token, userName, selectedRole, router]);

  // Previously we auto-connected on mount which could cause the AI agent to join
  // unexpectedly when users interacted with the Start button. Instead, connect
  // only when the user explicitly starts the interview.

  const handleStartInterview = async () => {
    // If we're already connected, just flip the started flag.
    if (token) {
      setIsInterviewStarted(true);
      return;
    }

    // Otherwise, connect first and then start the interview when token is ready.
    try {
      await connectToRoom();
      // connectToRoom sets token/interviewId on success
      if (token) {
        setIsInterviewStarted(true);
      } else {
        // In some cases, connectToRoom updates state asynchronously; ensure we set started
        // after a short tick if token became available.
        setTimeout(() => {
          if (!isInterviewStarted && token) setIsInterviewStarted(true);
        }, 250);
      }
    } catch (err) {
      console.error('Failed to start interview:', err);
      alert('Failed to start interview. See console for details.');
    }
  };

  const handleEndInterview = () => {
    // Show summary or just reset
    setIsInterviewStarted(false);
  };

  if (initializing) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!token && connecting) {
    return (
      <div className="flex flex-col gap-6">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl shadow-lg p-8"
        >
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-gray-200 border-t-blue-500 mb-4"></div>
            <div className="text-lg text-gray-600">Connecting to interview room...</div>
          </div>
        </motion.div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="flex flex-col gap-6">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl shadow-lg p-8"
        >
          <div className="text-center">
            <div className="text-lg text-red-600 mb-4">Failed to connect</div>
            <button
              onClick={connectToRoom}
              className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition"
            >
              Retry
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl shadow-lg p-6"
      >
        <LiveKitRoom
          token={token}
          serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL}
          connect={true}
          audio={true}
          video={false}
          options={{
            dynacast: true,
            adaptiveStream: true,
            audioCaptureDefaults: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          }}
          onDisconnected={() => {
            setToken(null);
            setIsInterviewStarted(false);
          }}
        >
          <InterviewRoomContent
            name={userName}
            topic={selectedRole}
            interviewId={interviewId}
            isInterviewStarted={isInterviewStarted}
            onStartInterview={handleStartInterview}
            onEndInterview={handleEndInterview}
            connecting={connecting}
          />

          {/* Role and Personality Dropdowns - Only show before interview starts */}
          {!isInterviewStarted && (
            <div className="mt-6 pt-6 border-t">
                  <div className="grid grid-cols-1 md:grid-cols-1 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">Interview Role</label>
                      <select
                        value={selectedRole}
                        onChange={(e) => setSelectedRole(e.target.value)}
                        className="w-full px-4 py-2 border-2 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
                      >
                        {INTERVIEW_ROLES.map((role) => (
                          <option key={role.id} value={role.id}>
                            {role.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
            </div>
          )}

          {/* Start/Control Buttons - Reduced spacing */}
          <div className={isInterviewStarted ? "mt-4" : "mt-4"}>
            <InterviewControls
              isInterviewStarted={isInterviewStarted}
              onStartInterview={handleStartInterview}
              onEndInterview={handleEndInterview}
              interviewId={interviewId}
              disabled={connecting}
            />
          </div>
        </LiveKitRoom>
      </motion.div>
    </div>
  );
}