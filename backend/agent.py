import os
import asyncio
import json
import logging
from datetime import datetime
from dataclasses import dataclass, field
from typing import List, Optional
from enum import Enum
from dotenv import load_dotenv

from livekit import agents, rtc
from livekit.agents import (
    Agent,
    AgentSession,
    JobContext,
    WorkerOptions,
    cli,
)
from livekit.agents.llm import ChatMessage, ChatContext
from livekit.plugins import silero, openai, deepgram

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("interview-agent")


# ==============================
#       ENUMS & DATA MODELS
# ==============================
class InterviewType(Enum):
    TECHNICAL = "technical"
    BEHAVIORAL = "behavioral"
    LEADERSHIP = "leadership"
    GENERAL = "general"


class QuestionPhase(Enum):
    MAIN_QUESTION = "main"
    FOLLOWUP = "followup"


@dataclass
class InterviewConfig:
    interview_type: InterviewType = InterviewType.GENERAL
    num_questions: int = 5
    company_name: str = "Our Company"
    job_title: str = "Software Developer"
    max_attempts_per_question: int = 3
    max_followups_per_question: int = 2


@dataclass
class QuestionState:
    """Track state for each main question"""
    question: str
    attempts: int = 0
    passed: bool = False
    responses: List[str] = field(default_factory=list)
    feedback: List[str] = field(default_factory=list)
    followup_count: int = 0
    followup_responses: List[str] = field(default_factory=list)


@dataclass
class InterviewContext:
    candidate_name: str = "Candidate"
    config: InterviewConfig = field(default_factory=InterviewConfig)
    questions: List[str] = field(default_factory=list)
    question_states: List[QuestionState] = field(default_factory=list)
    current_question_index: int = 0
    current_phase: QuestionPhase = QuestionPhase.MAIN_QUESTION
    responses: List[str] = field(default_factory=list)
    start_time: datetime = field(default_factory=datetime.now)
    conversation_history: List[dict] = field(default_factory=list)
    filler_words_count: int = 0
    interview_ended: bool = False
    waiting_for_user: bool = True


# ==============================
#   QUESTION BANK
# ==============================
QUESTION_BANK = {
    InterviewType.TECHNICAL: [
        "Walk me through your technical background and most relevant experience.",
        "Describe a complex technical problem you solved. What was your approach?",
        "How do you ensure code quality and maintainability in your projects?",
        "Tell me about a time you had to learn a new technology quickly.",
        "How do you approach debugging difficult issues?",
    ],
    InterviewType.BEHAVIORAL: [
        "Tell me about yourself and what brings you here today.",
        "Describe a situation where you had to work with a difficult team member.",
        "Give me an example of a time you failed. How did you handle it?",
        "Tell me about your greatest professional achievement.",
        "How do you prioritize tasks when everything seems urgent?",
    ],
    InterviewType.LEADERSHIP: [
        "Describe your leadership philosophy and style.",
        "Tell me about a difficult decision you made as a leader.",
        "How do you handle underperforming team members?",
        "Give me an example of how you've built and motivated a team.",
        "Describe a time you had to manage conflict within your team.",
    ],
    InterviewType.GENERAL: [
        "Tell me about yourself and your background.",
        "What motivated you to apply for this position?",
        "Describe a challenge you faced at work and how you handled it.",
        "What are your greatest strengths and weaknesses?",
        "Where do you see yourself in the next 3-5 years?",
    ],
}


def get_questions(config: InterviewConfig) -> List[str]:
    all_questions = QUESTION_BANK.get(config.interview_type, QUESTION_BANK[InterviewType.GENERAL])
    return all_questions[:config.num_questions]


# ==============================
#   ANALYSIS FUNCTIONS
# ==============================
def analyze_filler_words(text: str) -> tuple[int, List[str]]:
    """Count filler words"""
    filler_words = ["um", "uh", "like", "you know", "sort of", "kind of", "basically", "actually", "literally"]
    text_lower = text.lower()
    found_fillers = []
    total_count = 0
    
    for filler in filler_words:
        count = text_lower.count(f" {filler} ") + text_lower.count(f" {filler},")
        if count > 0:
            total_count += count
            found_fillers.append(f"{filler}({count})")
    
    return total_count, found_fillers


def calculate_confidence_score(text: str) -> int:
    """Calculate confidence score (0-100)"""
    score = 50
    words = text.split()
    word_count = len(words)
    
    confident_phrases = ["i successfully", "i achieved", "i led", "i implemented", "i solved", "i managed", "i delivered"]
    score += sum(5 for phrase in confident_phrases if phrase in text.lower())
    
    uncertain_phrases = ["i guess", "maybe", "i think", "probably", "not sure", "kind of", "sort of"]
    score -= sum(8 for phrase in uncertain_phrases if phrase in text.lower())
    
    if word_count > 80:
        score += 10
    elif word_count < 30:
        score -= 15
    
    return max(0, min(100, score))


def calculate_professionalism_score(text: str, filler_count: int) -> int:
    """Calculate professionalism score (0-100)"""
    score = 80
    words = len(text.split())
    
    if words > 0:
        filler_ratio = (filler_count / words) * 100
        score -= int(filler_ratio * 20)
    
    score -= filler_count * 3
    
    if words < 30:
        score -= 15
    
    return max(0, min(100, score))


def check_answer_quality(text: str, filler_count: int) -> tuple[bool, str, int]:
    """
    Returns: (passed, feedback, score)
    Score: 0-100, Passed: score >= 60
    """
    score = 50
    words = text.split()
    word_count = len(words)
    feedback_parts = []
    
    # Length check
    if word_count < 30:
        score -= 20
        feedback_parts.append(f"Too short ({word_count} words)")
    elif word_count > 80:
        score += 15
        feedback_parts.append("Good length")
    
    # Filler word penalty
    if filler_count > 5:
        score -= 15
        feedback_parts.append(f"Excessive fillers ({filler_count})")
    elif filler_count > 2:
        score -= 8
        feedback_parts.append(f"Some fillers ({filler_count})")
    
    # Specificity check
    specific_indicators = ["i implemented", "i led", "we achieved", "resulted in", "increased by", "reduced", "for example", "specifically"]
    if any(ind in text.lower() for ind in specific_indicators):
        score += 20
        feedback_parts.append("Specific examples ✓")
    else:
        score -= 15
        feedback_parts.append("Lacks specifics")
    
    # Vague language penalty
    vague_phrases = ["something like", "stuff like that", "things", "whatever", "and stuff"]
    vague_count = sum(1 for phrase in vague_phrases if phrase in text.lower())
    if vague_count > 0:
        score -= vague_count * 5
        feedback_parts.append(f"Vague language ({vague_count})")
    
    score = max(0, min(100, score))
    passed = score >= 60
    feedback = " | ".join(feedback_parts) + f" | Score: {score}/100"
    
    return passed, feedback, score


# ==============================
#       AGENT CLASS
# ==============================
class RoastInterviewAgent(Agent):
    """Brutally honest AI interview coach with retry and followup logic"""
    
    def __init__(self, interview_ctx: InterviewContext):
        ctx = interview_ctx
        config = ctx.config
        
        # Initialize question states
        ctx.question_states = [
            QuestionState(question=q) for q in ctx.questions
        ]
        
        questions_list = "\n".join(f"{i+1}. {q}" for i, q in enumerate(ctx.questions))
        
        system_prompt = (
            f"You are a brutally honest AI interview coach conducting a {config.interview_type.value} interview "
            f"for {config.job_title} at {config.company_name}.\n\n"
            f"### ROAST MODE RULES:\n"
            f"- {config.num_questions} main questions total\n"
            f"- Each question: {config.max_attempts_per_question} attempts max\n"
            f"- After good answer: Ask {config.max_followups_per_question} followup questions to dig deeper\n"
            f"- After followups OR failed attempts: Move to next main question\n"
            f"- Count filler words ALOUD every time\n"
            f"- Be brutal but constructive\n\n"
            f"### YOUR {len(ctx.questions)} MAIN QUESTIONS:\n{questions_list}\n\n"
            f"### RESPONSE PATTERNS:\n\n"
            f"**IF ANSWER IS BAD (attempts 1-2):**\n"
            f"'I counted [X] ums and [Y] likes. That's unacceptable. [Why it's weak]. Be specific. Try again.'\n\n"
            f"**IF ANSWER IS BAD (attempt 3 - FINAL):**\n"
            f"'Still weak after 3 tries. Moving on. Next question: [Next main question]'\n\n"
            f"**IF ANSWER IS GOOD:**\n"
            f"'Better! [Brief praise]. Let me dig deeper: [Followup question]'\n\n"
            f"**FOLLOWUP QUESTIONS (ask {config.max_followups_per_question} per main question):**\n"
            f"- 'What specific metrics or results came from that?'\n"
            f"- 'What challenges did you face and how did you overcome them?'\n"
            f"- 'What would you do differently if you had to do it again?'\n"
            f"- 'How did that experience change your approach?'\n\n"
            f"**AFTER {config.max_followups_per_question} FOLLOWUPS:**\n"
            f"'Okay, moving on. Next question: [Next main question]'\n\n"
            f"**AFTER ALL {config.num_questions} MAIN QUESTIONS:**\n"
            f"'Interview complete. Here's my honest assessment: [Brutal feedback on performance, filler count, hire recommendation Yes/Maybe/No]'\n\n"
            f"Always be direct. Always count fillers. Always demand specifics."
        )
        
        super().__init__(instructions=system_prompt)
        self.interview_ctx = interview_ctx

    async def on_user_speech_committed(self, message: ChatMessage):
        """Analyze response and handle retry/followup logic"""
        ctx = self.interview_ctx
        text = message.content
        
        if not text.strip() or ctx.interview_ended or not ctx.waiting_for_user:
            return
        
        ctx.waiting_for_user = False
        
        # Check if interview should have ended
        if ctx.current_question_index >= len(ctx.question_states):
            logger.info("⚠️ Received answer after all questions - ignoring")
            return
        
        q_state = ctx.question_states[ctx.current_question_index]
        
        # Analyze
        filler_count, found_fillers = analyze_filler_words(text)
        ctx.filler_words_count += filler_count
        confidence_score = calculate_confidence_score(text)
        professionalism_score = calculate_professionalism_score(text, filler_count)
        
        # Handle based on phase
        if ctx.current_phase == QuestionPhase.MAIN_QUESTION:
            await self._handle_main_answer(q_state, text, filler_count, found_fillers, confidence_score, professionalism_score)
        else:  # FOLLOWUP
            await self._handle_followup_answer(q_state, text, filler_count, found_fillers, confidence_score, professionalism_score)

    async def _handle_main_answer(self, q_state: QuestionState, text: str, filler_count: int, 
                                    found_fillers: List[str], confidence_score: int, professionalism_score: int):
        """Handle answer to main question"""
        ctx = self.interview_ctx
        
        q_state.attempts += 1
        q_state.responses.append(text)
        
        # Check quality
        passed, feedback, quality_score = check_answer_quality(text, filler_count)
        q_state.passed = passed
        q_state.feedback.append(feedback)
        
        # Log
        logger.info(f"👤 MAIN Q{ctx.current_question_index + 1} Attempt {q_state.attempts}/{ctx.config.max_attempts_per_question}: {text[:80]}...")
        logger.info(f"📊 Fillers: {', '.join(found_fillers) if found_fillers else '0'} | Quality: {quality_score}/100 | {'✅ PASS' if passed else '❌ FAIL'}")
        
        # Store
        ctx.responses.append(text)
        ctx.conversation_history.append({
            "role": "user",
            "content": text,
            "timestamp": datetime.now().isoformat(),
            "question_index": ctx.current_question_index,
            "phase": "main_question",
            "attempt": q_state.attempts,
            "metrics": {
                "confidence": confidence_score,
                "professionalism": professionalism_score,
                "filler_count": filler_count,
                "quality_score": quality_score,
                "passed": passed,
            }
        })
        
        # Publish metrics
        await self._publish_metrics(confidence_score, professionalism_score, filler_count, quality_score)
        
        # Decide next action
        if passed:
            # Good answer - move to followups
            logger.info(f"✅ Answer passed - moving to followups (max {ctx.config.max_followups_per_question})")
            ctx.current_phase = QuestionPhase.FOLLOWUP
            ctx.waiting_for_user = True
        elif q_state.attempts >= ctx.config.max_attempts_per_question:
            # Max attempts - move to next question
            logger.info(f"❌ Max attempts ({ctx.config.max_attempts_per_question}) reached - moving to next question")
            await self._move_to_next_question()
        else:
            # Allow retry
            remaining = ctx.config.max_attempts_per_question - q_state.attempts
            logger.info(f"🔄 Retry allowed - {remaining} attempt(s) remaining")
            ctx.waiting_for_user = True

    async def _handle_followup_answer(self, q_state: QuestionState, text: str, filler_count: int,
                                       found_fillers: List[str], confidence_score: int, professionalism_score: int):
        """Handle answer to followup question"""
        ctx = self.interview_ctx
        
        q_state.followup_count += 1
        q_state.followup_responses.append(text)
        
        # Log
        logger.info(f"👤 FOLLOWUP {q_state.followup_count}/{ctx.config.max_followups_per_question} for Q{ctx.current_question_index + 1}: {text[:80]}...")
        logger.info(f"📊 Fillers: {', '.join(found_fillers) if found_fillers else '0'}")
        
        # Store
        ctx.responses.append(text)
        ctx.conversation_history.append({
            "role": "user",
            "content": text,
            "timestamp": datetime.now().isoformat(),
            "question_index": ctx.current_question_index,
            "phase": "followup",
            "followup_number": q_state.followup_count,
            "metrics": {
                "confidence": confidence_score,
                "professionalism": professionalism_score,
                "filler_count": filler_count,
            }
        })
        
        # Publish metrics
        await self._publish_metrics(confidence_score, professionalism_score, filler_count, 0)
        
        # Check if done with followups
        if q_state.followup_count >= ctx.config.max_followups_per_question:
            logger.info(f"✅ Followups complete - moving to next question")
            await self._move_to_next_question()
        else:
            logger.info(f"🔄 Asking next followup ({q_state.followup_count + 1}/{ctx.config.max_followups_per_question})")
            ctx.waiting_for_user = True

    async def _move_to_next_question(self):
        """Move to next main question or end interview"""
        ctx = self.interview_ctx
        
        ctx.current_question_index += 1
        ctx.current_phase = QuestionPhase.MAIN_QUESTION
        
        if ctx.current_question_index >= len(ctx.questions):
            logger.info("🏁 All questions complete - ending interview")
            ctx.interview_ended = True
        else:
            logger.info(f"➡️ Moving to question {ctx.current_question_index + 1}/{len(ctx.questions)}")
            ctx.waiting_for_user = True

    async def on_agent_speech_committed(self, message: ChatMessage):
        """Track agent responses"""
        ctx = self.interview_ctx
        text = message.content
        
        ctx.conversation_history.append({
            "role": "assistant",
            "content": text,
            "timestamp": datetime.now().isoformat(),
            "question_index": ctx.current_question_index,
            "phase": ctx.current_phase.value,
        })
        
        logger.info(f"🤖 AGENT [{ctx.current_phase.value.upper()}]: {text[:100]}...")
        
        # Check if interview should end
        if ctx.interview_ended:
            logger.info("💾 Interview ended - saving results in 5 seconds")
            await asyncio.sleep(5)
            await self._save_and_end()

    async def on_enter(self):
        """Start interview with first question"""
        ctx = self.interview_ctx
        
        greeting = (
            f"Hello {ctx.candidate_name}! Welcome to your {ctx.config.interview_type.value} interview "
            f"for {ctx.config.job_title} at {ctx.config.company_name}. "
            f"I'm in ROAST MODE. Here's how this works: I have {ctx.config.num_questions} questions. "
            f"You get up to {ctx.config.max_attempts_per_question} tries per question. "
            f"If you answer well, I'll ask {ctx.config.max_followups_per_question} followup questions. "
            f"I'll count every filler word and call out vague answers. "
            f"Ready? Let's start. {ctx.questions[0]}"
        )
        
        logger.info(f"🔥 Starting ROAST MODE - {len(ctx.questions)} questions, {ctx.config.max_attempts_per_question} attempts each, {ctx.config.max_followups_per_question} followups")
        await self.session.say(greeting, allow_interruptions=True)

    async def _publish_metrics(self, confidence: int, professionalism: int, filler_count: int, quality_score: int):
        """Send live metrics to frontend"""
        try:
            room = self.session.room if hasattr(self.session, 'room') else None
            if not room or not hasattr(room, 'local_participant'):
                return
            
            ctx = self.interview_ctx
            current_q = ctx.question_states[ctx.current_question_index] if ctx.current_question_index < len(ctx.question_states) else None
            
            payload = json.dumps({
                "type": "live_metrics",
                "question_number": ctx.current_question_index + 1,
                "total_questions": len(ctx.questions),
                "phase": ctx.current_phase.value,
                "current_attempt": current_q.attempts if current_q and ctx.current_phase == QuestionPhase.MAIN_QUESTION else 0,
                "max_attempts": ctx.config.max_attempts_per_question,
                "followup_count": current_q.followup_count if current_q else 0,
                "max_followups": ctx.config.max_followups_per_question,
                "confidence_score": confidence,
                "professionalism_score": professionalism,
                "quality_score": quality_score,
                "filler_count_this_response": filler_count,
                "filler_count_total": ctx.filler_words_count,
                "interview_ended": ctx.interview_ended,
            }).encode()
            
            await room.local_participant.publish_data(
                payload, 
                kind=rtc.DataPacketKind.KIND_RELIABLE,
                topic="live-metrics"
            )
            
        except Exception as e:
            logger.warning(f"Failed to publish metrics: {e}")

    async def _save_and_end(self):
        """Save results with complete stats"""
        try:
            ctx = self.interview_ctx
            duration = (datetime.now() - ctx.start_time).total_seconds() / 60
            
            # Calculate stats
            total_attempts = sum(q.attempts for q in ctx.question_states)
            passed_questions = sum(1 for q in ctx.question_states if q.passed)
            total_followups = sum(q.followup_count for q in ctx.question_states)
            
            results = {
                "candidate": ctx.candidate_name,
                "interview_type": ctx.config.interview_type.value,
                "company": ctx.config.company_name,
                "job_title": ctx.config.job_title,
                "duration_minutes": round(duration, 2),
                "summary": {
                    "total_questions": len(ctx.questions),
                    "questions_passed": passed_questions,
                    "questions_failed": len(ctx.questions) - passed_questions,
                    "total_attempts": total_attempts,
                    "total_followups_asked": total_followups,
                    "filler_words_total": ctx.filler_words_count,
                    "pass_rate": f"{(passed_questions / len(ctx.questions) * 100):.1f}%",
                },
                "questions_detail": [
                    {
                        "question_number": i + 1,
                        "question": q.question,
                        "attempts": q.attempts,
                        "passed": q.passed,
                        "main_responses": q.responses,
                        "followup_count": q.followup_count,
                        "followup_responses": q.followup_responses,
                        "feedback": q.feedback,
                    }
                    for i, q in enumerate(ctx.question_states)
                ],
                "conversation_history": ctx.conversation_history,
                "timestamp": datetime.now().isoformat(),
            }
            
            # Save locally
            os.makedirs("/tmp/interviews", exist_ok=True)
            filename = f"{ctx.candidate_name.replace(' ', '_')}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
            filepath = f"/tmp/interviews/{filename}"
            
            with open(filepath, "w") as f:
                json.dump(results, f, indent=2)
            
            logger.info(f"💾 Saved: {filepath}")
            logger.info(f"📊 Final Stats: {passed_questions}/{len(ctx.questions)} passed | {total_attempts} attempts | {total_followups} followups | {ctx.filler_words_count} fillers")
            
            # End session
            await asyncio.sleep(1)
            await self.session.end()
            
        except Exception as e:
            logger.error(f"Error saving: {e}", exc_info=True)


# ==============================
#       ENTRYPOINT
# ==============================
async def entrypoint(ctx: JobContext):
    await ctx.connect(auto_subscribe=agents.AutoSubscribe.AUDIO_ONLY)
    logger.info(f"✅ Connected: {ctx.room.name}")
    
    participant = await ctx.wait_for_participant()
    logger.info(f"👤 Participant: {participant.identity}")

    # Parse config from room metadata
    room_metadata = json.loads(ctx.room.metadata or '{}')
    
    config = InterviewConfig(
        interview_type=InterviewType(room_metadata.get('interview_type', 'general')),
        num_questions=int(room_metadata.get('num_questions', 5)),
        company_name=room_metadata.get('company_name', 'Our Company'),
        job_title=room_metadata.get('job_title', 'Software Developer'),
        max_attempts_per_question=int(room_metadata.get('max_attempts', 3)),
        max_followups_per_question=int(room_metadata.get('max_followups', 2)),
    )
    
    interview_ctx = InterviewContext(
        candidate_name=participant.identity or 'Candidate',
        config=config,
        questions=get_questions(config)
    )

    # Setup voice pipeline
    llm = openai.LLM(
        model="mistralai/mistral-7b-instruct:free",
        api_key=os.getenv("OPENROUTER_API_KEY"),
        base_url="https://openrouter.ai/api/v1",
    )
    
    stt = deepgram.STT(
        model="nova-2",
        language="en",
        interim_results=True,
        endpointing_ms=1500,
        smart_format=True,
        punctuate=True,
    )
    
    session = AgentSession(
        vad=silero.VAD.load(min_silence_duration=0.6),
        stt=stt,
        llm=llm,
        tts="elevenlabs/eleven_turbo_v2:pNInz6obpgDQGcFmaJgB",
        userdata=interview_ctx,
        min_endpointing_delay=0.5,
        max_endpointing_delay=2.0,
    )

    agent = RoastInterviewAgent(interview_ctx=interview_ctx)
    await session.start(agent=agent, room=ctx.room)
    logger.info("🎙️ Agent started")

    await asyncio.Event().wait()


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))