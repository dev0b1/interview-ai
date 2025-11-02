/**
 * Real-time Interview with AI Agent - Optimized UI
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
  const [fillerWords, setFillerWords] = React.useState<number>(0);

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
            if ((data as Record<string, unknown>)['message']) {
              setRoastMessages((r) => [String((data as Record<string, unknown>)['message']), ...r].slice(0, 5));
            }
            break;

          case "agent.post_interview_summary":
            const metricsRec = (data as Record<string, unknown>)['metrics'] as Record<string, unknown> | undefined;
            const conf = metricsRec ? Number(metricsRec['confidence'] as number ?? metricsRec['clarity'] as number ?? NaN) : NaN;
            const prof = metricsRec ? Number(metricsRec['professionalism'] as number ?? NaN) : NaN;
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
    
    try {
      if (msgLiveMetrics) {
        const mv = msgLiveMetrics as { payload?: Uint8Array };
        const text = new TextDecoder().decode(mv.payload as Uint8Array);
        const d = JSON.parse(text) as Record<string, unknown> | null;
        if (d) {
          const confRaw = Number(d['confidence_score'] ?? d['confidence'] ?? NaN);
          const profRaw = Number(d['professionalism_score'] ?? d['professionalism'] ?? NaN);
          const fillerRaw = Number(d['filler_words'] ?? d['filler_word_count'] ?? NaN);
          if (!Number.isNaN(confRaw)) setConfidence(Math.round(confRaw / 10));
          if (!Number.isNaN(profRaw)) setProfessionalism(Math.round(profRaw / 10));
          if (!Number.isNaN(fillerRaw)) setFillerWords(fillerRaw);
          if (d['ai_feedback']) setRoastMessages((r) => [String(d['ai_feedback']), ...r].slice(0, 5));
        }
      }
    } catch (err) {
      console.warn('Failed to parse live-metrics message', err);
    }
  }, [msgAgent, msgInterview, msgLiveMetrics]);

  return { greeting, summary, behaviorFlags, setGreeting, confidence, professionalism, roastMessages, fillerWords };
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
  onEndInterview,
  interviewId,
}: {
  isInterviewStarted: boolean;
  onEndInterview: () => void;
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

  if (!isInterviewStarted) return null;

  return (
    <div className="flex flex-wrap gap-3 justify-center">
      {!isRecording ? (
        <button
          onClick={startRecording}
          className="px-4 py-2 bg-accent text-foreground rounded-lg transition font-semibold shadow-lg hover:bg-accent-2 flex items-center gap-2"
        >
          <span className="w-2 h-2 bg-foreground rounded-full"></span>
          Record
        </button>
      ) : (
        <button
          onClick={stopRecording}
          className="px-4 py-2 bg-accent text-foreground rounded-lg transition font-semibold shadow-lg hover:bg-accent-2 flex items-center gap-2"
        >
          <span className="w-2 h-2 bg-danger rounded-sm animate-pulse"></span>
          Recording...
        </button>
      )}
      
      <button
        onClick={onEndInterview}
        className="px-4 py-2 bg-surface-2 text-foreground rounded-lg transition font-semibold shadow-lg hover:bg-surface"
      >
        End Interview
      </button>
    </div>
  );
}

function InterviewRoomContent({
  name,
  topic,
  interviewId,
  isInterviewStarted,
  onEndInterview,
}: {
  name: string;
  topic: string;
  interviewId?: string | null;
  isInterviewStarted: boolean;
  onEndInterview: () => void;
}) {
  const { greeting, summary, behaviorFlags, setGreeting, confidence, professionalism, roastMessages, fillerWords } = useAgentMessages();
  const entries = useInterviewTranscript();
  const room = useRoomContext();
  const remotes = useRemoteParticipants();
  const { localParticipant } = useLocalParticipant();
  
  // Get AI agent's audio track (remote participant)
  const remoteTracks = useTracks([Track.Source.Microphone], {
    onlySubscribed: true,
  });
  const agentAudioTrack = remoteTracks.find(
    (trackRef) => trackRef.participant.identity !== localParticipant?.identity
  );
  
  const [showSummary, setShowSummary] = React.useState(false);

  const connectionState = room?.state as unknown as string | undefined;
  const isConnected = connectionState === 'connected' || connectionState === 'Connected';

  React.useEffect(() => {
    if (summary && isInterviewStarted) {
      setShowSummary(true);
    }
  }, [summary, isInterviewStarted]);

  return (
    <>
      <RoomAudioRenderer />
      
      {isInterviewStarted && localParticipant && (
        <InterviewConfigPublisher
          name={name}
          topic={topic}
          interviewId={interviewId || undefined}
          enabled={isInterviewStarted}
        />
      )}

      {/* Header - Only show when interview is active and agent has joined */}
      {isInterviewStarted && isConnected && remotes.length > 0 && (
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Analysis Mode: Active</h2>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-success rounded-full"></div>
            <span className="muted text-sm">Connected</span>
          </div>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Center: AI Avatar + Audio Viz */}
        <div className="lg:col-span-2 flex flex-col items-center justify-center">
          {/* AI Avatar - Smaller and more compact */}
          <div className="relative mb-4">
            <div className="w-40 h-40 rounded-full bg-gradient-to-br from-accent via-accent-2 to-accent-2 flex items-center justify-center shadow-xl">
              <div className="w-32 h-32 rounded-full bg-surface-2 flex items-center justify-center">
                <div className="text-5xl">🤖</div>
              </div>
            </div>
            {isInterviewStarted && isConnected && remotes.length > 0 && (
              <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 px-3 py-1 bg-success text-foreground text-xs rounded-full font-medium">
                AI Agent Active
              </div>
            )}
          </div>

          {/* Audio Visualizer - Shows AI Agent Speaking */}
          {isInterviewStarted && agentAudioTrack && (
            <div className="w-full max-w-md">
              <BarVisualizer 
                state="speaking"
                barCount={7}
                trackRef={agentAudioTrack}
                className="h-16 [&>div]:bg-accent"
              />
              <p className="text-center muted text-xs mt-2">
                Detecting filler words, tone and clarity
              </p>
            </div>
          )}
          
          {/* Fallback when agent hasn't joined yet */}
          {isInterviewStarted && !agentAudioTrack && (
            <div className="w-full max-w-md">
              <div className="h-16 flex items-center justify-center">
                <p className="muted text-sm">Waiting for AI agent to join...</p>
              </div>
            </div>
          )}

          {/* Controls */}
          <div className="mt-4">
            <InterviewControls
              isInterviewStarted={isInterviewStarted}
              onEndInterview={onEndInterview}
              interviewId={interviewId}
            />
          </div>
        </div>

        {/* Right: Metrics Panel - Only show when interview is active */}
        {isInterviewStarted && (
          <div className="bg-surface/50 rounded-xl p-4 border border-surface-2">
            <div className="space-y-4">
              {/* Filler Words */}
              <div>
                <div className="muted text-xs mb-1">Filler Words</div>
                <div className="text-3xl font-bold text-foreground">{fillerWords}</div>
              </div>

              {/* Confidence */}
              <div>
                <div className="muted text-xs mb-1">Confidence</div>
                <div className="text-3xl font-bold text-foreground">
                  {confidence !== null ? `${confidence}/10` : '--'}
                </div>
              </div>

              {/* Professionalism */}
              <div>
                <div className="muted text-xs mb-1">Professionalism</div>
                <div className="text-3xl font-bold text-foreground">
                  {professionalism !== null ? `${professionalism}/10` : '--'}
                </div>
              </div>

              {/* Real-time Tips */}
              <div className="pt-3 border-t border-surface-2">
                <div className="muted text-xs mb-2">Real-time Tips</div>
                <div className="space-y-1">
                  {roastMessages.length > 0 ? (
                    roastMessages.slice(0, 2).map((msg, i) => (
                      <div key={i} className="muted text-xs">• {msg}</div>
                    ))
                  ) : (
                    <div className="muted text-xs italic">Analyzing your responses...</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {showSummary && summary && (
        <SummaryModal
          open={true}
          summary={summary}
          onClose={() => {
            setShowSummary(false);
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

  React.useEffect(() => {
    if (!initializing && !session) {
      try {
        router.replace('/auth');
      } catch {
        window.location.href = '/auth';
      }
    }
  }, [initializing, session, router]);

  const [selectedRole, setSelectedRole] = React.useState("frontend");
  const [token, setToken] = React.useState<string | null>(null);
  const [interviewId, setInterviewId] = React.useState<string | null>(null);
  const [connecting, setConnecting] = React.useState(false);
  const [isInterviewStarted, setIsInterviewStarted] = React.useState(false);
  const [showEndConfirm, setShowEndConfirm] = React.useState(false);

  const userName = React.useMemo(() => {
    return session?.user?.user_metadata?.full_name || 
           session?.user?.email || 
           "Candidate";
  }, [session]);

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

      return resp.token;
    } catch (err) {
      console.error("Connection failed:", err);
      alert(`Failed to connect: ${err instanceof Error ? err.message : "Unknown error"}`);
      setToken(null);
      return null;
    } finally {
      setConnecting(false);
    }
  }, [session?.access_token, userName, selectedRole, router]);

  const handleStartInterview = async () => {
    if (isInterviewStarted) return;

    try {
      if (token) {
        setIsInterviewStarted(true);
        return;
      }

      const t = await connectToRoom();
      if (t) setIsInterviewStarted(true);
      else throw new Error('Failed to obtain token');
    } catch (err) {
      console.error('Failed to start interview:', err);
      alert('Failed to start interview. See console for details.');
    }
  };

  const handleEndInterview = () => {
    setIsInterviewStarted(false);
    setToken(null);
    setInterviewId(null);
  };

  if (initializing) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-surface">
        <div className="text-lg text-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface p-4">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-7xl mx-auto"
      >
        <LiveKitRoom
          token={token ?? undefined}
          serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL}
          connect={isInterviewStarted}
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
            onEndInterview={() => setShowEndConfirm(true)}
          />
        </LiveKitRoom>

        {/* Role Selection - Only visible when interview hasn't started */}
        {!isInterviewStarted && (
          <div className="mt-4 bg-surface/50 rounded-xl p-4 border border-surface-2">
            <label className="block text-sm font-medium muted mb-2">
              Select Interview Role
            </label>
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="w-full px-3 py-2 bg-surface-2 border border-surface-2 rounded-lg text-foreground focus:ring-2 focus:ring-accent/40 focus:border-transparent mb-3"
            >
              {INTERVIEW_ROLES.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.label}
                </option>
              ))}
            </select>

            <button
              onClick={handleStartInterview}
              disabled={connecting}
              className="w-full px-5 py-3 bg-accent text-foreground rounded-lg font-semibold text-base hover:bg-accent-2 transform transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-xl"
            >
              {connecting ? 'Connecting…' : '🚀 Start Interview'}
            </button>
          </div>
        )}

        {showEndConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-surface/60" onClick={() => setShowEndConfirm(false)} />
            <div className="bg-surface-2 rounded-xl shadow-2xl p-6 z-10 w-full max-w-md border border-surface-2">
              <h3 className="text-lg font-semibold mb-2 text-foreground">End interview?</h3>
              <p className="text-sm muted mb-6">
                Are you sure you want to end the interview? This will disconnect you from the room.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowEndConfirm(false)}
                  className="px-4 py-2 bg-surface-2 text-foreground rounded-lg hover:bg-surface"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setShowEndConfirm(false);
                    handleEndInterview();
                  }}
                  className="px-4 py-2 bg-danger text-foreground rounded-lg hover:bg-danger/90"
                >
                  End Interview
                </button>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}