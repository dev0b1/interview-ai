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

const PERSONALITIES = [
  { id: "friendly", label: "Friendly" },
  { id: "balanced", label: "Balanced" },
  { id: "challenging", label: "Challenging" },
  { id: "casual", label: "Casual" },
];

// ============================================================================
// HOOKS
// ============================================================================

function useAgentMessages() {
  const [greeting, setGreeting] = React.useState<string | null>(null);
  const [summary, setSummary] = React.useState<InterviewSummary | null>(null);
  const [behaviorFlags, setBehaviorFlags] = React.useState<string[]>([]);

  const { message: msgAgent } = useDataChannel("agent-messages");
  const { message: msgInterview } = useDataChannel("interview_results");

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
  personality,
  interviewId,
  enabled,
}: {
  name: string;
  topic: string;
  personality: string;
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
          personality: personality || "balanced",
          interviewId: interviewId || null,
          instruction: `Conduct a ${personality} interview about ${topic} with ${name}.`,
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
  }, [localParticipant, published, name, topic, personality, interviewId, enabled]);

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
        className="w-full px-8 py-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg font-bold text-lg hover:scale-105 transition disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 shadow-lg"
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
          className={`px-4 py-2 rounded-md transition font-medium ${
            isMuted 
              ? "bg-red-100 text-red-700 hover:bg-red-200" 
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          {isMuted ? "🔇 Unmute" : "🎤 Mute"}
        </button>
        
        <button
          onClick={onEndInterview}
          className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-md transition font-medium"
        >
          ⏹ End Interview
        </button>

        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-md transition font-medium"
        >
          Leave & End Interview
        </button>

        {!isRecording ? (
          <button
            onClick={startRecording}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md transition font-medium"
          >
            ⏺ Record
          </button>
        ) : (
          <button
            onClick={stopRecording}
            className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-md transition font-medium"
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
  personality,
  interviewId,
  isInterviewStarted,
  onStartInterview,
  onEndInterview,
}: {
  name: string;
  topic: string;
  personality: string;
  interviewId?: string | null;
  isInterviewStarted: boolean;
  onStartInterview: () => void;
  onEndInterview: () => void;
}) {
  const { greeting, summary, behaviorFlags, setGreeting } = useAgentMessages();
  const entries = useInterviewTranscript();
  const room = useRoomContext();
  const remotes = useRemoteParticipants();
  const { localParticipant } = useLocalParticipant();
  const tracks = useTracks([Track.Source.Microphone]);
  const microphoneTrack = tracks.find((t) => t.source === Track.Source.Microphone);
  const [showTranscript, setShowTranscript] = React.useState(false);
  const [showSummary, setShowSummary] = React.useState(false);

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
          personality={personality}
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
          {/* Video Card */}
          <div className="aspect-video bg-gradient-to-br from-gray-900 to-gray-800 rounded-lg flex items-center justify-center">
            <div className="text-center text-white">
              <div className="w-32 h-32 mx-auto rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-4xl mb-4">
                🤖
              </div>
              <div className="text-lg font-medium">{personality} AI Interviewer</div>
              <div className="text-sm text-gray-400 mt-2">
                {isInterviewStarted ? "Listening..." : "Ready when you are"}
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
          {isInterviewStarted && (
            <>
              <button
                onClick={() => setShowTranscript(!showTranscript)}
                className="w-full px-4 py-2 border-2 rounded-lg hover:bg-gray-50 font-medium transition"
              >
                {showTranscript ? "Hide" : "Show"} Transcript
              </button>

              {showTranscript && <TranscriptPanel entries={entries} />}
            </>
          )}
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
  const [selectedPersonality, setSelectedPersonality] = React.useState("balanced");
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
  React.useEffect(() => {
    if (session?.access_token && !token && !connecting) {
      void connectToRoom();
    }
  }, [session, token, connecting]);

  const connectToRoom = async () => {
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
          name: `${selectedRole} - ${selectedPersonality}`,
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
  };

  const handleStartInterview = () => {
    setIsInterviewStarted(true);
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
            personality={selectedPersonality}
            interviewId={interviewId}
            isInterviewStarted={isInterviewStarted}
            onStartInterview={handleStartInterview}
            onEndInterview={handleEndInterview}
          />

          {/* Role and Personality Dropdowns - Only show before interview starts */}
          {!isInterviewStarted && (
            <div className="mt-6 pt-6 border-t">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Interview Role</label>
                  <select
                    value={selectedRole}
                    onChange={(e) => setSelectedRole(e.target.value)}
                    className="w-full px-4 py-2 border-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                  >
                    {INTERVIEW_ROLES.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Interviewer Style</label>
                  <select
                    value={selectedPersonality}
                    onChange={(e) => setSelectedPersonality(e.target.value)}
                    className="w-full px-4 py-2 border-2 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white"
                  >
                    {PERSONALITIES.map((personality) => (
                      <option key={personality.id} value={personality.id}>
                        {personality.label}
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