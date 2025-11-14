/**
 * Complete Real-time Interview Frontend - FINAL CORRECT VERSION
 * Fixes: Question counter, audio visualizer, answer timer
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
  useTracks,
  BarVisualizer,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import type { Room } from "livekit-client";
import { saveInterview } from "../../lib/history";
import SummaryModal from "../../components/SummaryModal";

// ============================================================================
// TYPES
// ============================================================================

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
// CONFIGURATION
// ============================================================================

const INTERVIEW_ROLES = [
  { id: "backend", label: "Backend Developer" },
  { id: "business_analyst", label: "Business Analyst" },
  { id: "cloud_architect", label: "Cloud Architect" },
  { id: "data_engineer", label: "Data Engineer" },
  { id: "data_scientist", label: "Data Scientist" },
  { id: "dba", label: "Database Administrator (DBA)" },
  { id: "devops", label: "DevOps Engineer" },
  { id: "embedded", label: "Embedded Systems Engineer" },
  { id: "frontend", label: "Frontend Developer" },
  { id: "fullstack", label: "Full Stack Developer" },
  { id: "general", label: "General Hroast" },
  { id: "infrastructure", label: "Infrastructure Engineer" },
  { id: "ml_engineer", label: "Machine Learning Engineer" },
  { id: "mobile", label: "Mobile Engineer (iOS / Android)" },
  { id: "performance", label: "Performance / Reliability Engineer" },
  { id: "product", label: "Product Manager" },
  { id: "qa", label: "QA / Test Engineer" },
  { id: "sales_engineer", label: "Sales Engineer" },
  { id: "security", label: "Security Engineer" },
  { id: "sre", label: "Site Reliability Engineer (SRE)" },
  { id: "support", label: "Support / Customer Engineer" },
  { id: "tpm", label: "Technical Program Manager" },
  { id: "tech_writer", label: "Technical Writer" },
  { id: "ux", label: "UX / Product Designer" },
];

const TOTAL_QUESTIONS = 5;

// ============================================================================
// HOOKS
// ============================================================================

function useInterviewTimer(isActive: boolean) {
  const [seconds, setSeconds] = React.useState(0);
  
  React.useEffect(() => {
    if (!isActive) return;
    
    const interval = setInterval(() => {
      setSeconds(s => s + 1);
    }, 1000);
    
    return () => clearInterval(interval);
  }, [isActive]);
  
  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };
  
  return { seconds, formattedTime: formatTime(seconds) };
}

function useAgentMessages() {
  const [summary, setSummary] = React.useState<InterviewSummary | null>(null);
  const [currentQuestion, setCurrentQuestion] = React.useState(1);
  const [fillerWords, setFillerWords] = React.useState(0);
  const [latestRoast, setLatestRoast] = React.useState<string | null>(null);
  const [roastMessages, setRoastMessages] = React.useState<string[]>([]);
  const [isAnswering, setIsAnswering] = React.useState(false);

  const room = useRoomContext();

  React.useEffect(() => {
    if (!room) return;

    const handleData = (
      payload: Uint8Array,
      participant: any,
      kind: any,
      topic?: string
    ) => {
      try {
        const text = new TextDecoder().decode(payload);
        const data = JSON.parse(text);

        console.log('📨 Received data:', { type: data.type, topic, question_number: data.question_number, is_answering: data.is_answering });

        // 🔥 HANDLE QUESTION STATE UPDATES (HIGHEST PRIORITY)
        if (topic === 'question-state' || data.type === 'question_state') {
          console.log('📍 Question state update:', data);
          
          if (data.question_number !== undefined) {
            console.log(`🎯 Updating question: ${currentQuestion} → ${data.question_number}`);
            setCurrentQuestion(data.question_number);
          }
          
          if (data.is_answering !== undefined) {
            console.log(`⏱️ Updating isAnswering: ${isAnswering} → ${data.is_answering}`);
            setIsAnswering(data.is_answering);
          }
        }

        // Handle live metrics (backup for question number)
        if (topic === 'live-metrics' || data.type === 'live_metrics') {
          console.log('📊 Metrics update:', data);
          
          if (data.question_number !== undefined) {
            setCurrentQuestion(data.question_number);
          }
          
          if (data.filler_count_total !== undefined) {
            setFillerWords(data.filler_count_total);
          }
          
          if (data.ai_feedback) {
            const msg = String(data.ai_feedback);
            setLatestRoast(msg);
            setRoastMessages((r) => [msg, ...r].slice(0, 5));
          }
          
          if (data.timeout_occurred !== undefined && data.timeout_occurred) {
            console.log('⏰ Timeout occurred - stopping timer');
            setIsAnswering(false);
          }
        }

        // Handle interview complete
        if (data.type === 'interview_complete' || data.type === 'agent.interview_complete') {
          const results = data.results || data;
          const scoreObj = results.score;
          const overall = scoreObj && typeof scoreObj === 'object' 
            ? Number(scoreObj.overall_score || 0) 
            : Number(results.overall_score || 0);
          
          setSummary({
            score: overall,
            tone: String(results.personality || 'Professional'),
            pacing: "Good",
            notes: String(results.ai_feedback || results.aiFeedback || ''),
            metrics: results.metrics || {},
            ai_feedback: String(results.ai_feedback || results.aiFeedback || ''),
          });
        }

        // Handle behavior flags (roasts)
        if (data.type === 'agent.behavior_flag') {
          if (data.message) {
            const msg = String(data.message);
            setLatestRoast(msg);
            setRoastMessages((r) => [msg, ...r].slice(0, 5));
          }
        }
      } catch (err) {
        console.warn('Failed to parse data:', err);
      }
    };

    room.on('dataReceived', handleData);
    return () => {
      room.off('dataReceived', handleData);
    };
  }, [room, currentQuestion, isAnswering]);

  return { 
    summary, 
    currentQuestion, 
    fillerWords, 
    latestRoast, 
    roastMessages,
    isAnswering,
  };
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
          num_questions: TOTAL_QUESTIONS,
          interviewId: interviewId || null,
          instruction: `Conduct a roast Hroast about ${topic} with ${name}. Ask ${TOTAL_QUESTIONS} questions total.`,
        };

        const encoder = new TextEncoder();
        const data = encoder.encode(JSON.stringify(config));
        
        localParticipant.publishData(data, { reliable: true });

        setPublished(true);
        console.log("✅ Published Hroast config to agent");
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
  const [isRecording, setIsRecording] = React.useState(false);
  const [egressId, setEgressId] = React.useState<string | null>(null);
  const room = useRoomContext();

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
      if (!res.ok) throw new Error(json?.error || 'failed to start egress recording');
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

function QuestionProgress({ current, total }: { current: number; total: number }) {
  return (
    <div className="bg-surface/50 rounded-lg px-4 py-2 border-2 border-accent/20">
      <div className="flex items-center gap-3">
        <div className="text-xs font-semibold text-foreground/70">Question</div>
        <div className="flex items-center gap-2">
          <div className="text-2xl font-bold text-accent">#{current}</div>
          <div className="text-sm text-foreground/60">of {total}</div>
        </div>
        <div className="flex gap-1">
          {Array.from({ length: total }).map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-colors ${
                i < current - 1
                  ? 'bg-success' 
                  : i === current - 1
                  ? 'bg-accent animate-pulse' 
                  : 'bg-surface-2'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function AnswerTimer({ 
  isActive, 
  maxSeconds = 90 
}: { 
  isActive: boolean; 
  maxSeconds?: number;
}) {
  const [secondsLeft, setSecondsLeft] = React.useState(maxSeconds);
  
  React.useEffect(() => {
    if (!isActive) {
      setSecondsLeft(maxSeconds);
      return;
    }
    
    setSecondsLeft(maxSeconds);
    
    const interval = setInterval(() => {
      setSecondsLeft(s => {
        if (s <= 1) {
          clearInterval(interval);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    
    return () => clearInterval(interval);
  }, [isActive, maxSeconds]);
  
  if (!isActive) return null;
  
  const percentage = (secondsLeft / maxSeconds) * 100;
  const isLow = secondsLeft <= 20;
  const isCritical = secondsLeft <= 10;
  
  return (
    <div className={`bg-surface/50 rounded-lg px-4 py-2 border-2 ${
      isCritical ? 'border-danger animate-pulse' : isLow ? 'border-warning' : 'border-accent/20'
    }`}>
      <div className="flex items-center gap-3">
        <div className="text-xs font-semibold text-foreground/70">Answer Time</div>
        <div className="flex items-center gap-2">
          <div className={`text-2xl font-mono font-bold ${
            isCritical ? 'text-danger' : isLow ? 'text-warning' : 'text-accent'
          }`}>
            {secondsLeft}s
          </div>
        </div>
        <div className="flex-1 bg-surface-2 rounded-full h-2 overflow-hidden min-w-[80px]">
          <motion.div 
            className={`h-full ${
              isCritical ? 'bg-danger' : isLow ? 'bg-warning' : 'bg-accent'
            }`}
            initial={{ width: '100%' }}
            animate={{ width: `${percentage}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
      </div>
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
  const { 
    summary, 
    currentQuestion, 
    fillerWords, 
    latestRoast, 
    roastMessages,
    isAnswering 
  } = useAgentMessages();
  
  const room = useRoomContext();
  const remotes = useRemoteParticipants();
  const { localParticipant } = useLocalParticipant();
  const { formattedTime } = useInterviewTimer(isInterviewStarted);
  
  const [userCount] = React.useState(() => Math.floor(Math.random() * 3001) + 2000);
  
  // Get all remote audio tracks, then filter to find agent's track
  const remoteTracks = useTracks(
    [{ source: Track.Source.Microphone, withPlaceholder: false }],
    { onlySubscribed: true }
  );
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

  // Debug logging
  React.useEffect(() => {
    console.log('🎯 Current Question:', currentQuestion);
    console.log('⏱️ Is Answering:', isAnswering);
    console.log('🎤 Agent Track:', agentAudioTrack ? 'Present' : 'Missing');
    console.log('👥 Remotes:', remotes.length);
  }, [currentQuestion, isAnswering, agentAudioTrack, remotes.length]);

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

      {/* Header - Timer and Question Progress */}
      {isInterviewStarted && isConnected && remotes.length > 0 && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between gap-4 flex-wrap mb-4"
        >
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-surface/50 rounded-lg px-3 py-2 border-2 border-accent/20">
              <div className="w-2 h-2 bg-success rounded-full animate-pulse"></div>
              <span className="text-sm font-semibold text-foreground">🔥 Roast Mode Active</span>
            </div>
            
            <div className="flex items-center gap-2 bg-surface/50 rounded-lg px-3 py-2 border-2 border-accent/20">
              <span className="text-lg">⏱️</span>
              <span className="text-sm font-mono font-bold text-foreground">{formattedTime}</span>
            </div>
            <AnswerTimer isActive={isAnswering} maxSeconds={90} />
          </div>
          
          <QuestionProgress current={currentQuestion} total={TOTAL_QUESTIONS} />
        </motion.div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Center: AI Avatar + Audio Viz */}
        <div className="lg:col-span-2 bg-surface/50 rounded-xl p-4 border-2 border-accent/30 flex flex-col items-center justify-center min-h-[220px]">
          {/* AI Avatar */}
          <div className="relative mb-4">
            <div className="w-28 h-28 rounded-full bg-gradient-to-br from-accent via-accent-2 to-accent-2 flex items-center justify-center shadow-xl">
              <div className="w-20 h-20 rounded-full bg-surface-2 flex items-center justify-center">
                <div className="text-3xl">🤖</div>
              </div>
            </div>
            {isInterviewStarted && isConnected && remotes.length > 0 && (
              <motion.div 
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 px-3 py-1 bg-success text-foreground text-xs rounded-full font-medium"
              >
                AI Agent Active
              </motion.div>
            )}
          </div>

          {/* Audio Visualizer */}
          {isInterviewStarted && agentAudioTrack && (
            <div className="w-full max-w-md">
              <div className="h-16 flex items-center justify-center">
                <BarVisualizer 
                  state="speaking"
                  barCount={7}
                  trackRef={agentAudioTrack}
                  className="[&>div]:bg-accent"
                />
              </div>
              <p className="text-center text-foreground/60 text-xs mt-2">
                Analyzing your filler words, tone and clarity
              </p>
            </div>
          )}
          
          {/* Waiting for agent */}
          {isInterviewStarted && !agentAudioTrack && (
            <div className="w-full max-w-md">
              <div className="h-16 flex flex-col items-center justify-center gap-2">
                <div className="flex gap-1">
                  {[0, 150, 300].map((delay, i) => (
                    <div 
                      key={i}
                      className="w-2 h-2 bg-accent rounded-full animate-bounce" 
                      style={{ animationDelay: `${delay}ms` }}
                    />
                  ))}
                </div>
                <p className="text-foreground text-sm font-medium">Connecting to AI agent...</p>
              </div>
            </div>
          )}

          {/* Latest Roast */}
          {isInterviewStarted && latestRoast && (
            <motion.div
              key={latestRoast}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="mt-4 w-full max-w-md bg-accent/10 border-2 border-accent/40 rounded-lg p-3"
            >
              <div className="flex items-start gap-2">
                <span className="text-xl">💬</span>
                <div className="flex-1">
                  <div className="text-xs font-semibold text-accent mb-1">LATEST ROAST</div>
                  <p className="text-foreground text-xs font-medium">&quot;{latestRoast}&quot;</p>
                </div>
              </div>
            </motion.div>
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

        {/* Right: Metrics Panel */}
        {isInterviewStarted ? (
          <div className="bg-surface/50 rounded-xl p-4 border-2 border-accent/20">
            <div className="space-y-4">
              {/* Current Question */}
              <div className="pb-3 border-b-2 border-accent/20">
                <div className="text-xs font-semibold text-foreground/70 mb-1">Current Question</div>
                <div className="flex items-baseline gap-2">
                  <div className="text-3xl font-bold text-accent">#{currentQuestion}</div>
                  <div className="text-sm text-foreground/60">of {TOTAL_QUESTIONS}</div>
                </div>
              </div>

              {/* Filler Words */}
              <div>
                <div className="text-foreground font-semibold text-xs mb-1">Filler Words</div>
                <div className="text-4xl font-bold text-foreground">{fillerWords}</div>
                <div className="text-xs text-foreground/60 mt-1">
                  {fillerWords === 0 && '🎯 Perfect!'}
                  {fillerWords > 0 && fillerWords <= 3 && '👍 Good'}
                  {fillerWords > 3 && fillerWords <= 6 && '⚠️ Watch out'}
                  {fillerWords > 6 && '🔥 Getting roasted'}
                </div>
              </div>

              {/* Time Elapsed */}
              <div>
                <div className="text-foreground font-semibold text-xs mb-1">Time Elapsed</div>
                <div className="text-2xl font-mono font-bold text-foreground">{formattedTime}</div>
              </div>

              {/* Recent Roasts */}
              <div className="pt-3 border-t-2 border-accent/20">
                <div className="text-foreground font-semibold text-xs mb-2">Recent Feedback</div>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {roastMessages.length > 0 ? (
                    roastMessages.slice(0, 3).map((msg, i) => (
                      <div key={i} className="text-foreground/80 text-xs leading-tight">• {msg}</div>
                    ))
                  ) : (
                    <div className="text-foreground/60 text-xs italic">Analyzing responses...</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-gradient-to-br from-accent/20 via-accent-2/20 to-accent/20 border-2 border-accent/30 rounded-xl p-4 flex flex-col items-center justify-center">
            <div className="text-center space-y-2">
              <div className="flex items-center justify-center gap-2">
                <span className="text-2xl">🔥</span>
                <div>
                  <p className="text-foreground font-bold text-xl">
                    {userCount.toLocaleString()}+
                  </p>
                  <p className="text-foreground/80 text-xs font-medium">
                    Getting Roasted Today
                  </p>
                </div>
                <span className="text-2xl">🔥</span>
              </div>
              <div className="h-px bg-accent/30 w-full"></div>
              <p className="text-foreground/70 text-xs leading-relaxed">
                ⚠️ This AI doesn&apos;t hold back.<br/>
                Expect brutal honesty about<br/>
                your &apos;ums&apos;, &apos;likes&apos;, and pauses.
              </p>
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
  const [limits, setLimits] = React.useState<null | {
    anonymous?: boolean;
    isSubscribed?: boolean;
    remaining?: number;
    limit?: number;
    usedThisMonth?: number;
    usedTotal?: number;
  }>(null);
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

  React.useEffect(() => {
    let mounted = true;
    const fetchLimits = async () => {
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
        const res = await fetch('/api/interviews/limits', { headers });
        const j = await res.json();
        if (!mounted) return;
        setLimits(j);
      } catch (err) {
        console.warn('Failed to fetch interview limits', err);
      }
    };

    fetchLimits();
    return () => { mounted = false; };
  }, [session?.access_token, initializing]);

  const connectToRoom = React.useCallback(async () => {
    if (!session?.access_token) {
      router.push("/auth");
      return;
    }

    setConnecting(true);

    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });

      const { fetchLivekitToken } = await import("../../lib/fetchLivekitToken");
      const resp = await fetchLivekitToken(userName, "hroast-room");

      if (!resp?.token) {
        throw new Error("Failed to get token");
      }

      setToken(resp.token);
      const newInterviewId = resp.interviewId || `hroast-${Date.now()}`;
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
      console.error('Failed to start Hroast:', err);
      alert('Failed to start Hroast. See console for details.');
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

        {!isInterviewStarted && (
          <div className="mt-4 bg-surface/50 rounded-xl p-6 border-2 border-accent/20">
            <label className="block text-sm font-medium text-foreground mb-3">
              Select Hroast Role
            </label>
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="w-full px-4 py-3 bg-surface-2 border-2 border-surface-2 rounded-lg text-foreground focus:ring-2 focus:ring-accent/40 focus:border-accent/50 mb-4"
            >
              {INTERVIEW_ROLES.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.label}
                </option>
              ))}
            </select>

            {limits && (
              <div className="mb-3 text-sm">
                {limits.anonymous ? (
                  <div className="text-foreground/70">Sign in to track Hroast limits.</div>
                ) : limits.isSubscribed ? (
                  <div className="flex items-center justify-between">
                    <div className="text-foreground/90">Subscribed — {limits.usedThisMonth ?? 0}/{limits.limit} this month</div>
                    <div className={`px-2 py-1 rounded text-xs font-medium ${((limits.remaining ?? 0) <= 0) ? 'bg-danger text-foreground' : 'bg-success/10 text-success'}`}>
                      {limits.remaining ?? 0} remaining
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="text-foreground/90">Free — {limits.usedTotal ?? 0}/{limits.limit} used</div>
                    <div className={`px-2 py-1 rounded text-xs font-medium ${((limits.remaining ?? 0) <= 0) ? 'bg-danger text-foreground' : 'bg-accent/10 text-accent'}`}>
                      {limits.remaining ?? 0} remaining
                    </div>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={handleStartInterview}
              disabled={connecting}
              className="w-full px-6 py-4 bg-accent text-foreground rounded-lg font-semibold text-lg hover:bg-accent-2 transform transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-xl"
            >
              {connecting ? 'Connecting…' : '🚀 Start Hroast'}
            </button>
          </div>
        )}

        {showEndConfirm && (
          <div className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center">
            <div className="absolute inset-0 bg-surface/60 pointer-events-auto" onClick={() => setShowEndConfirm(false)} />
            <div className="bg-surface-2 rounded-xl shadow-2xl p-6 z-10 w-full max-w-md border border-surface-2 pointer-events-auto">
              <h3 className="text-lg font-semibold mb-2 text-foreground">End interview?</h3>
              <p className="text-sm text-foreground/70 mb-6">
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