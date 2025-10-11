"use client";

import React from "react";
import InterviewRoom from "../../components/InterviewRoom";
import InterviewSetup from "../../components/InterviewSetup";
import { motion } from "framer-motion";
import { useAuth } from "../../lib/useAuth";
import { useRouter } from 'next/navigation';

export default function InterviewPage() {
  // enforce auth at page level so unauthenticated visitors are redirected early
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
  const [stage, setStage] = React.useState<"setup" | "live">("setup");
  const [name, setName] = React.useState("");
  const [topic, setTopic] = React.useState("");
  const [personality, setPersonality] = React.useState("");
  const [autoJoinOnce, setAutoJoinOnce] = React.useState(false);

  function handleStart(opts: { name: string; topic: string; personality: string }) {
    setName(opts.name || "");
    setTopic(opts.topic || "");
    setPersonality(opts.personality || "Professional & Calm");
    setStage("live");
    // enable a single auto-join for this session
    setAutoJoinOnce(true);
  }

  return (
    <div className="flex flex-col gap-6">
      {stage === "setup" ? (
        <motion.div key="setup" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl shadow-lg p-6">
          <h2 className="text-xl font-semibold mb-3">Join Interview</h2>
          <InterviewSetup onStart={handleStart} initialName={name} />
        </motion.div>
      ) : (
        <motion.div key="live" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <InterviewRoom name={name} topic={topic} personality={personality} autoJoin={autoJoinOnce} onLeave={() => setAutoJoinOnce(false)} />
        </motion.div>
      )}
    </div>
  );
}
