import os
import asyncio
import json
import logging
from datetime import datetime
from dataclasses import dataclass, field
from typing import List
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


@dataclass
class InterviewConfig:
    interview_type: InterviewType = InterviewType.GENERAL
    num_questions: int = 5
    company_name: str = "Our Company"
    job_title: str = "Software Developer"


@dataclass
class InterviewContext:
    candidate_name: str = "Candidate"
    config: InterviewConfig = field(default_factory=InterviewConfig)
    questions: List[str] = field(default_factory=list)
    responses: List[str] = field(default_factory=list)
    start_time: datetime = field(default_factory=datetime.now)
    conversation_history: List[dict] = field(default_factory=list)
    filler_words_count: int = 0


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
#   SIMPLE ANALYSIS FUNCTIONS
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
    
    # Confident language
    confident_phrases = ["i successfully", "i achieved", "i led", "i implemented", "i solved"]
    score += sum(5 for phrase in confident_phrases if phrase in text.lower())
    
    # Uncertain language
    uncertain_phrases = ["i guess", "maybe", "i think", "probably", "not sure"]
    score -= sum(8 for phrase in uncertain_phrases if phrase in text.lower())
    
    # Length bonus
    if word_count > 80:
        score += 10
    elif word_count < 30:
        score -= 15
    
    return max(0, min(100, score))


def calculate_professionalism_score(text: str, filler_count: int) -> int:
    """Calculate professionalism score (0-100)"""
    score = 80
    words = len(text.split())
    
    # Filler word penalty
    if words > 0:
        filler_ratio = (filler_count / words) * 100
        score -= int(filler_ratio * 20)
    
    score -= filler_count * 3
    
    # Short answer penalty
    if words < 30:
        score -= 15
    
    return max(0, min(100, score))


# ==============================
#       AGENT CLASS
# ==============================
class RoastInterviewAgent(Agent):
    """Brutally honest AI interview coach - ROAST MODE ONLY"""
    
    def __init__(self, interview_ctx: InterviewContext):
        ctx = interview_ctx
        config = ctx.config
        
        questions_list = "\n".join(f"{i+1}. {q}" for i, q in enumerate(ctx.questions))
        
        system_prompt = (
            f"You are a brutally honest AI interview coach conducting a {config.interview_type.value} interview "
            f"for {config.job_title} at {config.company_name}.\n\n"
            f"### ROAST MODE ACTIVATED:\n"
            f"Call out EVERYTHING - filler words, vague answers, lack of specifics. "
            f"Count filler words aloud. Roast weak answers. Demand better.\n\n"
            f"Examples:\n"
            f"- 'I counted 7 ums and 5 likes. That's unacceptable.'\n"
            f"- 'Way too vague. What project? What was YOUR role? What were the results?'\n"
            f"- 'Better! Specific example with clear outcomes. Keep it up.'\n\n"
            f"### YOUR {len(ctx.questions)} QUESTIONS:\n{questions_list}\n\n"
            f"### FLOW:\n"
            f"1. First question already asked\n"
            f"2. After each answer: Critique issues → Acknowledge strengths → Ask next question\n"
            f"3. After question {len(ctx.questions)}: Say 'Interview complete. Here's my honest assessment.'\n"
            f"4. Give final feedback: Filler count, quality issues, hire recommendation (Yes/Maybe/No)\n\n"
            f"Be brutal but constructive. Always move forward."
        )
        
        super().__init__(instructions=system_prompt)
        self.interview_ctx = interview_ctx

    async def on_user_speech_committed(self, message: ChatMessage):
        """Analyze response and publish metrics"""
        text = message.content
        if not text.strip():
            return
        
        # Analyze
        filler_count, found_fillers = analyze_filler_words(text)
        self.interview_ctx.filler_words_count += filler_count
        
        confidence_score = calculate_confidence_score(text)
        professionalism_score = calculate_professionalism_score(text, filler_count)
        
        # Log
        logger.info(f"👤 USER [{len(self.interview_ctx.responses) + 1}/{len(self.interview_ctx.questions)}]: {text[:80]}...")
        if filler_count > 0:
            logger.info(f"📊 Fillers: {', '.join(found_fillers)} | Total: {self.interview_ctx.filler_words_count}")
        logger.info(f"📈 Confidence: {confidence_score}/100 | Professionalism: {professionalism_score}/100")
        
        # Store
        self.interview_ctx.responses.append(text)
        self.interview_ctx.conversation_history.append({
            "role": "user",
            "content": text,
            "timestamp": datetime.now().isoformat(),
            "metrics": {
                "confidence": confidence_score,
                "professionalism": professionalism_score,
                "filler_count": filler_count,
            }
        })
        
        # Publish to frontend
        await self._publish_metrics(confidence_score, professionalism_score, filler_count)

    async def on_agent_speech_committed(self, message: ChatMessage):
        """Track agent responses"""
        text = message.content
        
        self.interview_ctx.conversation_history.append({
            "role": "assistant",
            "content": text,
            "timestamp": datetime.now().isoformat()
        })
        
        logger.info(f"🤖 AGENT: {text[:100]}...")
        
        # Check if interview complete
        if len(self.interview_ctx.responses) >= len(self.interview_ctx.questions):
            if "interview complete" in text.lower() or "honest assessment" in text.lower():
                logger.info("✅ Interview complete - saving results")
                await asyncio.sleep(5)  # Let agent finish
                await self._save_and_end()

    async def on_enter(self):
        """Start interview"""
        ctx = self.interview_ctx
        
        greeting = (
            f"Hello {ctx.candidate_name}! Welcome to your {ctx.config.interview_type.value} interview "
            f"for {ctx.config.job_title} at {ctx.config.company_name}. "
            f"Fair warning: I'm in ROAST MODE. I'll call out every filler word, every vague answer. "
            f"This is tough love to help you crush real interviews. "
            f"Ready? {ctx.questions[0]}"
        )
        
        logger.info(f"🔥 Starting ROAST MODE - {len(ctx.questions)} questions")
        await self.session.say(greeting, allow_interruptions=True)

    async def _publish_metrics(self, confidence: int, professionalism: int, filler_count: int):
        """Send live metrics to frontend"""
        try:
            room = self.session.room if hasattr(self.session, 'room') else None
            if not room or not hasattr(room, 'local_participant'):
                return
            
            payload = json.dumps({
                "type": "live_metrics",
                "question_number": len(self.interview_ctx.responses),
                "total_questions": len(self.interview_ctx.questions),
                "confidence_score": confidence,
                "professionalism_score": professionalism,
                "filler_count_this_response": filler_count,
                "filler_count_total": self.interview_ctx.filler_words_count,
            }).encode()
            
            await room.local_participant.publish_data(
                payload, 
                kind=rtc.DataPacketKind.KIND_RELIABLE,
                topic="live-metrics"
            )
            
        except Exception as e:
            logger.warning(f"Failed to publish metrics: {e}")

    async def _save_and_end(self):
        """Save results and end session"""
        try:
            ctx = self.interview_ctx
            duration = (datetime.now() - ctx.start_time).total_seconds() / 60
            
            results = {
                "candidate": ctx.candidate_name,
                "interview_type": ctx.config.interview_type.value,
                "company": ctx.config.company_name,
                "job_title": ctx.config.job_title,
                "duration_minutes": round(duration, 2),
                "questions": ctx.questions,
                "responses": ctx.responses,
                "filler_words_total": ctx.filler_words_count,
                "conversation_history": ctx.conversation_history,
                "timestamp": datetime.now().isoformat(),
            }
            
            # Save locally
            os.makedirs("/tmp/interviews", exist_ok=True)
            filename = f"{ctx.candidate_name.replace(' ', '_')}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
            with open(f"/tmp/interviews/{filename}", "w") as f:
                json.dump(results, f, indent=2)
            
            logger.info(f"💾 Saved: /tmp/interviews/{filename}")
            
            # End session
            await asyncio.sleep(1)
            await self.session.end()
            
        except Exception as e:
            logger.error(f"Error saving: {e}")


# ==============================
#       ENTRYPOINT
# ==============================
async def entrypoint(ctx: JobContext):
    await ctx.connect(auto_subscribe=agents.AutoSubscribe.AUDIO_ONLY)
    logger.info(f"✅ Connected: {ctx.room.name}")
    
    participant = await ctx.wait_for_participant()
    logger.info(f"👤 Participant: {participant.identity}")

    # Parse config
    room_metadata = json.loads(ctx.room.metadata or '{}')
    
    config = InterviewConfig(
        interview_type=InterviewType(room_metadata.get('interview_type', 'general')),
        num_questions=int(room_metadata.get('num_questions', 5)),
        company_name=room_metadata.get('company_name', 'Our Company'),
        job_title=room_metadata.get('job_title', 'Software Developer'),
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