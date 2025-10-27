import os
import asyncio
import json
import logging
from datetime import datetime
from dataclasses import dataclass, field
from typing import Optional, List, Dict
from enum import Enum
from dotenv import load_dotenv

from livekit import agents
from livekit.agents import (
    Agent,
    AgentSession,
    JobContext,
    WorkerOptions,
    cli,
    RunContext,
    function_tool,
)
from livekit.agents.llm import ChatContext, ChatMessage
from livekit.plugins import silero, openai
import aiohttp

# Import retry utilities
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
    before_sleep_log,
)
from livekit.agents._exceptions import APIConnectionError, APIError

load_dotenv()

# Global timeout for max interview duration (2 hours)
MAX_INTERVIEW_DURATION = 7200.0

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("interview-agent")


# ==============================
#       RETRY DECORATORS
# ==============================
def retry_with_logging(max_attempts=3, wait_min=1, wait_max=10):
    """
    Decorator for retrying functions with exponential backoff.
    Logs retry attempts for monitoring.
    """
    return retry(
        stop=stop_after_attempt(max_attempts),
        wait=wait_exponential(multiplier=1, min=wait_min, max=wait_max),
        retry=retry_if_exception_type((APIConnectionError, APIError, asyncio.TimeoutError)),
        before_sleep=before_sleep_log(logger, logging.WARNING),
        reraise=True,
    )


# ==============================
#       ENUMS & CONSTANTS
# ==============================
class InterviewMode(Enum):
    """Interview difficulty/style modes"""
    FRIENDLY = "friendly"
    STANDARD = "standard"
    CHALLENGING = "challenging"


class InterviewType(Enum):
    """Types of interviews supported"""
    TECHNICAL = "technical"
    BEHAVIORAL = "behavioral"
    LEADERSHIP = "leadership"
    SALES = "sales"
    CUSTOMER_SERVICE = "customer_service"
    GENERAL = "general"


# ==============================
#       DATA MODELS
# ==============================
@dataclass
class InterviewConfig:
    """Configuration for interview customization"""
    interview_type: InterviewType = InterviewType.GENERAL
    mode: InterviewMode = InterviewMode.STANDARD
    num_questions: int = 5
    allow_adaptive_questions: bool = True
    company_name: str = "Our Company"
    job_title: str = "Software Developer"  # Fixed: Changed from "this position"
    candidate_resume_summary: Optional[str] = None


@dataclass
class InterviewContext:
    """Stores the state of the interview"""
    candidate_name: str = "Candidate"
    config: InterviewConfig = field(default_factory=InterviewConfig)
    core_questions: List[str] = field(default_factory=list)
    adaptive_questions: List[str] = field(default_factory=list)
    question_index: int = 0
    is_asking_followup: bool = False
    notes: list = field(default_factory=list)
    filler_count: int = 0
    responses: list = field(default_factory=list)
    start_time: datetime = field(default_factory=datetime.now)
    conversation_history: List[Dict] = field(default_factory=list)
    tts_retry_count: int = 0
    llm_retry_count: int = 0
    _interview_ended: bool = False  # Guard against duplicate end calls


# ==============================
#   QUESTION BANK SYSTEM
# ==============================
QUESTION_BANK = {
    InterviewType.TECHNICAL: [
        "Walk me through your technical background and most relevant experience.",
        "Describe a complex technical problem you solved. What was your approach?",
        "How do you ensure code quality and maintainability in your projects?",
        "Tell me about a time you had to learn a new technology quickly.",
        "How do you approach debugging difficult issues?",
        "What's your experience with system design and scalability?",
    ],
    InterviewType.BEHAVIORAL: [
        "Tell me about yourself and what brings you here today.",
        "Describe a situation where you had to work with a difficult team member.",
        "Give me an example of a time you failed. How did you handle it?",
        "Tell me about your greatest professional achievement.",
        "How do you prioritize tasks when everything seems urgent?",
        "Describe a time you had to adapt to significant change.",
    ],
    InterviewType.LEADERSHIP: [
        "Describe your leadership philosophy and style.",
        "Tell me about a difficult decision you made as a leader.",
        "How do you handle underperforming team members?",
        "Give me an example of how you've built and motivated a team.",
        "How do you balance being hands-on with delegating?",
        "Describe a time you had to manage conflict within your team.",
    ],
    InterviewType.SALES: [
        "Walk me through your sales experience and biggest wins.",
        "Describe your approach to understanding customer needs.",
        "Tell me about a deal you lost. What did you learn?",
        "How do you handle rejection and maintain motivation?",
        "What's your process for building relationships with clients?",
        "Give me an example of how you've exceeded your sales targets.",
    ],
    InterviewType.CUSTOMER_SERVICE: [
        "Tell me about your customer service experience.",
        "Describe a time you dealt with an extremely difficult customer.",
        "How do you handle stress during high-volume periods?",
        "Give me an example of going above and beyond for a customer.",
        "What does excellent customer service mean to you?",
        "How do you handle a situation where you can't give the customer what they want?",
    ],
    InterviewType.GENERAL: [
        "Tell me about yourself and your background.",
        "What motivated you to apply for this position?",
        "Describe a challenge you faced at work and how you handled it.",
        "How do you handle feedback or criticism?",
        "Where do you see yourself in the next 3-5 years?",
    ],
}


def get_questions_for_config(config: InterviewConfig) -> List[str]:
    """Get appropriate questions based on interview configuration."""
    all_questions = QUESTION_BANK.get(config.interview_type, QUESTION_BANK[InterviewType.GENERAL])
    return all_questions[:config.num_questions]


# ==============================
#     TEXT SANITIZATION
# ==============================
def sanitize_for_tts(text: str) -> str:
    """
    Clean text for TTS to prevent generation failures.
    Fixes common grammatical issues and removes problematic formatting.
    """
    if not text:
        return ""
    
    # Remove multiple spaces
    text = ' '.join(text.split())
    
    # Fix common grammatical issues
    text = text.replace("for the this", "for this")
    text = text.replace("for the the", "for the")
    text = text.replace("at the the", "at the")
    text = text.replace("of the the", "of the")
    text = text.replace("to the the", "to the")
    
    # Remove markdown/formatting that might confuse TTS
    text = text.replace("**", "")
    text = text.replace("__", "")
    text = text.replace("###", "")
    text = text.replace("##", "")
    text = text.replace("#", "")
    
    # Remove extra punctuation
    text = text.replace("...", ".")
    text = text.replace("..", ".")
    text = text.replace("!!", "!")
    text = text.replace("??", "?")
    
    # Ensure proper sentence ending
    if text and text[-1] not in '.!?':
        text += '.'
    
    return text.strip()


# ==============================
#     SAFE TTS & LLM WRAPPERS
# ==============================
@retry_with_logging(max_attempts=3, wait_min=2, wait_max=8)
async def safe_say(session: AgentSession, text: str, allow_interruptions: bool = True):
    """
    Safely say text with retry logic for TTS failures.
    
    Args:
        session: AgentSession instance
        text: Text to synthesize
        allow_interruptions: Whether to allow user interruptions
        
    Raises:
        APIConnectionError: If all retry attempts fail
    """
    try:
        # Sanitize text before TTS
        clean_text = sanitize_for_tts(text)
        
        if not clean_text:
            logger.warning("⚠️ Empty text after sanitization, skipping TTS")
            return
        
        logger.debug(f"🔊 TTS: {clean_text[:100]}...")
        await asyncio.wait_for(
            session.say(clean_text, allow_interruptions=allow_interruptions),
            timeout=30.0  # 30 second timeout for TTS
        )
        logger.debug("✅ TTS completed successfully")
    except asyncio.TimeoutError:
        logger.error(f"⏱️ TTS timeout for text: {text[:100]}...")
        raise APIConnectionError("TTS timeout")
    except (APIConnectionError, APIError) as e:
        logger.error(f"❌ TTS API error: {e}")
        raise
    except Exception as e:
        logger.error(f"❌ Unexpected TTS error: {e}")
        raise APIConnectionError(f"Unexpected TTS error: {e}")


async def safe_say_with_chunking(
    session: AgentSession, 
    text: str, 
    allow_interruptions: bool = True, 
    max_chunk_length: int = 200
):
    """
    Say text with automatic chunking for long utterances.
    Prevents TTS timeouts on very long text.
    
    Args:
        session: AgentSession instance
        text: Text to synthesize
        allow_interruptions: Whether to allow user interruptions
        max_chunk_length: Maximum characters per chunk
    """
    clean_text = sanitize_for_tts(text)
    
    if not clean_text:
        return
    
    # If text is short, just say it
    if len(clean_text) <= max_chunk_length:
        return await safe_say(session, clean_text, allow_interruptions)
    
    # Otherwise, split by sentences
    sentences = clean_text.replace('!', '.').replace('?', '.').split('.')
    current_chunk = ""
    
    for sentence in sentences:
        sentence = sentence.strip()
        if not sentence:
            continue
            
        # If adding this sentence exceeds limit, speak current chunk first
        if len(current_chunk) + len(sentence) > max_chunk_length:
            if current_chunk:
                await safe_say(session, current_chunk, allow_interruptions)
                await asyncio.sleep(0.3)  # Brief pause between chunks
            current_chunk = sentence + ". "
        else:
            current_chunk += sentence + ". "
    
    # Speak remaining chunk
    if current_chunk:
        await safe_say(session, current_chunk, allow_interruptions)


@retry_with_logging(max_attempts=3, wait_min=1, wait_max=5)
async def safe_llm_chat(llm_instance, chat_ctx: ChatContext, timeout: float = 30.0) -> str:
    """
    Safely call LLM with retry logic and timeout.
    
    Args:
        llm_instance: LLM instance
        chat_ctx: Chat context
        timeout: Timeout in seconds
        
    Returns:
        Complete LLM response text
        
    Raises:
        APIConnectionError: If all retry attempts fail
    """
    try:
        response_text = ""
        stream = llm_instance.chat(chat_ctx=chat_ctx)
        
        async def _collect_stream():
            nonlocal response_text
            async for chunk in stream:
                response_text += chunk.delta.content or ""
        
        await asyncio.wait_for(_collect_stream(), timeout=timeout)
        
        if not response_text.strip():
            raise APIError("Empty LLM response")
            
        return response_text.strip()
        
    except asyncio.TimeoutError:
        logger.error("⏱️ LLM timeout")
        raise APIConnectionError("LLM timeout")
    except (APIConnectionError, APIError) as e:
        logger.error(f"❌ LLM API error: {e}")
        raise
    except Exception as e:
        logger.error(f"❌ Unexpected LLM error: {e}")
        raise APIConnectionError(f"Unexpected LLM error: {e}")


# ==============================
#     FUNCTION TOOLS
# ==============================

@function_tool(
    name="flag_concern",
    description="Call when candidate shows weakness, vagueness, or concerning attitude. Records red flag."
)
async def flag_concern(ctx: RunContext, concern: str):
    """Flags a concern in the candidate's response"""
    interview_ctx: InterviewContext = ctx.userdata
    interview_ctx.notes.append({
        "type": "concern",
        "content": concern,
        "timestamp": datetime.now().isoformat(),
        "question_index": interview_ctx.question_index
    })
    logger.info(f"⚠️ Concern flagged: {concern}")
    
    return {"message": "Concern noted. Continue interview naturally."}


@function_tool(
    name="note_strength",
    description="Call when candidate provides exceptionally strong, articulate answer. Records positive note."
)
async def note_strength(ctx: RunContext, strength: str):
    """Notes a strength in the candidate's response"""
    interview_ctx: InterviewContext = ctx.userdata
    interview_ctx.notes.append({
        "type": "strength",
        "content": strength,
        "timestamp": datetime.now().isoformat(),
        "question_index": interview_ctx.question_index
    })
    logger.info(f"💪 Strength noted: {strength}")

    return {"message": "Strength noted. Continue interview naturally."}


@function_tool(
    name="generate_adaptive_followup",
    description="Generate a smart follow-up question when answer is vague, incomplete, or particularly interesting. Only use if adaptive mode is enabled."
)
async def generate_adaptive_followup(
    ctx: RunContext, 
    reason: str,
    focus_area: str
):
    """
    Generates an adaptive follow-up question using AI.
    """
    interview_ctx: InterviewContext = ctx.userdata
    
    if not interview_ctx.config.allow_adaptive_questions:
        return {"message": "Adaptive questions disabled. Skip follow-up.", "question": None}
    
    interview_ctx.is_asking_followup = True
    
    last_response = interview_ctx.responses[-1] if interview_ctx.responses else ""
    last_question = (
        interview_ctx.core_questions[interview_ctx.question_index] 
        if interview_ctx.question_index < len(interview_ctx.core_questions) 
        else "the previous question"
    )
    
    try:
        followup_prompt = (
            f"You are generating a follow-up interview question.\n"
            f"Original question: {last_question}\n"
            f"Candidate's answer: {last_response}\n"
            f"Reason for follow-up: {reason}\n"
            f"Focus area: {focus_area}\n"
            f"Interview type: {interview_ctx.config.interview_type.value}\n"
            f"Interview mode: {interview_ctx.config.mode.value}\n\n"
            f"Generate ONE concise, specific follow-up question that probes deeper into {focus_area}. "
            f"The question should be natural and conversational. Return ONLY the question, nothing else."
        )
        
        chat_ctx = ChatContext()
        chat_ctx.append(role="user", text=followup_prompt)
        
        llm_instance = openai.LLM(
            model="mistralai/mistral-7b-instruct:free",
            api_key=os.getenv("OPENROUTER_API_KEY"),
            base_url="https://openrouter.ai/api/v1",
        )
        
        # Use safe wrapper with retry logic
        followup_question = await safe_llm_chat(llm_instance, chat_ctx, timeout=20.0)
        interview_ctx.adaptive_questions.append(followup_question)
        interview_ctx.llm_retry_count = 0  # Reset on success
        
        logger.info(f"🎯 Generated adaptive follow-up: {followup_question}")
        
        return {
            "message": "Follow-up generated. Ask it now before advancing to next question.",
            "question": followup_question
        }
        
    except Exception as e:
        logger.error(f"❌ Error generating follow-up after retries: {e}")
        interview_ctx.is_asking_followup = False
        interview_ctx.llm_retry_count += 1
        
        # Gracefully fallback
        return {
            "message": "Failed to generate follow-up. Continue to next question.", 
            "question": None
        }


@function_tool(
    name="complete_followup",
    description="Call after receiving answer to an adaptive follow-up question. Resets follow-up state."
)
async def complete_followup(ctx: RunContext):
    """Marks the follow-up as complete"""
    interview_ctx: InterviewContext = ctx.userdata
    interview_ctx.is_asking_followup = False
    logger.info("✅ Follow-up completed")
    return {"message": "Follow-up complete. Continue with main questions."}


@function_tool(
    name="advance_question",
    description="Call IMMEDIATELY before asking the next core question. Increments question index."
)
async def advance_question(ctx: RunContext):
    """Increments the question index"""
    interview_ctx: InterviewContext = ctx.userdata
    interview_ctx.question_index += 1
    logger.info(f"➡️ Advanced to question {interview_ctx.question_index + 1}")
    
    if interview_ctx.question_index < len(interview_ctx.core_questions):
        next_q = interview_ctx.core_questions[interview_ctx.question_index]
        return {"message": f"State advanced. Next question: {next_q}"}
    else:
        return {"message": "All core questions completed. End interview."}


@function_tool(
    name="end_interview",
    description="Call ONLY after all core questions answered. Triggers analysis and feedback."
)
async def end_interview(ctx: RunContext):
    """Ends interview and generates feedback"""
    interview_ctx: InterviewContext = ctx.userdata
    
    # Guard against duplicate calls
    if interview_ctx._interview_ended:
        logger.warning("⚠️ end_interview called multiple times, ignoring duplicate")
        return {"message": "Interview already ended"}
    
    interview_ctx._interview_ended = True
    
    summary = _summarize_interview(interview_ctx)
    ai_feedback = await _generate_feedback(summary, interview_ctx.config, ctx.session)
    _save_results(interview_ctx, summary, ai_feedback)

    # Publish final results to LiveKit data channel
    try:
        room = getattr(ctx, "room", None) or getattr(getattr(ctx, "session", None), "room", None)
        if room and getattr(room, "local_participant", None):
            payload = json.dumps({
                "type": "agent.interview_complete",
                "results": {
                    "summary": summary.get("user_summary"),
                    "internal_metrics": summary.get("internal_metrics"),
                    "ai_feedback": ai_feedback,
                },
            }).encode()

            try:
                await room.local_participant.publish_data(payload, topic="interview_results")
            except Exception:
                try:
                    await room.local_participant.publish_data(payload, topic="agent-messages")
                except Exception as e:
                    logger.warning(f"Failed to publish interview results on fallback topic: {e}")
        else:
            logger.info("No room/local_participant available to publish interview results")
    except Exception as e:
        logger.warning(f"Failed to publish interview results to data channel: {e}")

    # Attempt to upsert results to the Next.js server
    try:
        upsert_url = os.getenv('AGENT_UPSERT_URL')
        upsert_secret = os.getenv('AGENT_UPSERT_SECRET')
        if upsert_url and upsert_secret:
            async def _post_results():
                room_metadata = {}
                try:
                    room = getattr(ctx, "room", None) or getattr(getattr(ctx, "session", None), "room", None)
                    if room and hasattr(room, 'metadata'):
                        room_metadata = json.loads(room.metadata or '{}')
                except:
                    pass
                
                payload = {
                    'interviewId': getattr(interview_ctx, 'interview_id', None) or os.getenv('INTERVIEW_ID') or None,
                    'analysis': summary.get('user_summary'),
                    'ai_feedback': ai_feedback,
                    'internal_metrics': summary.get('internal_metrics'),
                    'transcript': getattr(interview_ctx, 'conversation_history', None) or None,
                    'video_signed_url': (room_metadata.get('video_signed_url') if isinstance(room_metadata, dict) else None),
                }
                try:
                    async with aiohttp.ClientSession() as session_http:
                        headers = {'Content-Type': 'application/json', 'x-agent-secret': upsert_secret}
                        async with session_http.post(upsert_url, json=payload, headers=headers, timeout=20) as resp:
                            if resp.status >= 400:
                                text = await resp.text()
                                logger.warning(f"Agent upsert failed: {resp.status} {text}")
                            else:
                                logger.info("Agent results upserted successfully")
                except Exception as e:
                    logger.warning(f"Exception posting upsert results: {e}")

            asyncio.create_task(_post_results())
        else:
            logger.debug('AGENT_UPSERT_URL or AGENT_UPSERT_SECRET not configured; skipping results upsert')
    except Exception as e:
        logger.warning(f"Failed to initiate results upsert: {e}")

    # Use safe_say with chunking for feedback delivery
    try:
        await safe_say(
            ctx.session,
            "Thank you for completing the interview! Let me analyze your responses...",
            allow_interruptions=False
        )
        await asyncio.sleep(1)
        
        await safe_say(
            ctx.session,
            "Here's your personalized feedback based on our conversation:",
            allow_interruptions=False
        )
        
        # Use chunking for potentially long feedback
        await safe_say_with_chunking(ctx.session, ai_feedback, allow_interruptions=False)
        
    except Exception as e:
        logger.error(f"❌ Error delivering feedback: {e}")
        # Fallback: try one more time with simpler message
        try:
            await safe_say(
                ctx.session,
                "Thank you for your time. Your interview results have been saved.",
                allow_interruptions=False
            )
        except:
            logger.critical("⚠️ Critical: Unable to deliver any closing message")
    
    await asyncio.sleep(2)
    await ctx.session.end()

    return {"message": "Interview completed successfully."}


# ==============================
#       HELPER FUNCTIONS
# ==============================
def _summarize_interview(ctx: InterviewContext) -> dict:
    """Create comprehensive interview summary"""
    duration = (datetime.now() - ctx.start_time).total_seconds() / 60
    
    # User-facing summary (clean, professional)
    user_summary = {
        "candidate": ctx.candidate_name,
        "interview_type": ctx.config.interview_type.value,
        "interview_mode": ctx.config.mode.value,
        "company": ctx.config.company_name,
        "job_title": ctx.config.job_title,
        "duration_min": round(duration, 2),
        "core_questions_asked": ctx.core_questions[:ctx.question_index + 1],
        "adaptive_questions_asked": ctx.adaptive_questions,
        "total_questions": ctx.question_index + 1 + len(ctx.adaptive_questions),
        "responses": ctx.responses,
        "filler_count": ctx.filler_count,
        "notes": ctx.notes,
        "strengths_count": sum(1 for n in ctx.notes if n.get("type") == "strength"),
        "concerns_count": sum(1 for n in ctx.notes if n.get("type") == "concern"),
    }
    
    # Internal metrics (for monitoring/debugging only)
    internal_metrics = {
        "tts_retries": ctx.tts_retry_count,
        "llm_retries": ctx.llm_retry_count,
        "session_start": ctx.start_time.isoformat(),
        "session_end": datetime.now().isoformat(),
    }
    
    return {
        "user_summary": user_summary,
        "internal_metrics": internal_metrics
    }


async def _generate_feedback(summary: dict, config: InterviewConfig, session: AgentSession) -> str:
    """Generate personalized feedback using AI with retry logic"""
    try:
        # Only use user-facing data for feedback generation
        user_data = summary["user_summary"]
        
        feedback_prompt = (
            f"You are an expert interview coach analyzing a {user_data['interview_type']} interview "
            f"for a {user_data['job_title']} position at {user_data['company']}.\n\n"
            f"Provide detailed, actionable feedback in this structure:\n\n"
            f"**STRENGTHS** (2-3 specific points)\n"
            f"**AREAS FOR IMPROVEMENT** (2-3 specific points with examples)\n"
            f"**COMMUNICATION ANALYSIS** (filler words, clarity, confidence)\n"
            f"**OVERALL IMPRESSION** (hire recommendation: Strong Yes / Yes / Maybe / No)\n"
            f"**NEXT STEPS** (1-2 actionable tips for improvement)\n\n"
            f"Interview Data:\n{json.dumps(user_data, indent=2)}"
        )

        chat_ctx = ChatContext()
        chat_ctx.append(role="user", text=feedback_prompt)

        llm_instance = openai.LLM(
            model="mistralai/mistral-7b-instruct:free",
            api_key=os.getenv("OPENROUTER_API_KEY"),
            base_url="https://openrouter.ai/api/v1",
        )
        
        # Use safe wrapper with retry
        feedback_text = await safe_llm_chat(llm_instance, chat_ctx, timeout=45.0)
        return feedback_text or "Feedback unavailable."
        
    except Exception as e:
        logger.error(f"❌ Error generating feedback after retries: {e}")
        # Fallback feedback
        return (
            "Thank you for completing the interview. "
            "Your responses have been recorded. "
            "Due to a technical issue, detailed feedback could not be generated, "
            "but your interview data has been saved for review."
        )


def _save_results(ctx: InterviewContext, summary: dict, feedback: str):
    """Save results to file (or database in production)"""
    try:
        base_dir = "/tmp/interviews"
        os.makedirs(base_dir, exist_ok=True)
        
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        candidate_clean = ctx.candidate_name.replace(" ", "_")
        
        # Save user-facing results (for sharing with candidate)
        user_filename = f"{candidate_clean}_{ctx.config.interview_type.value}_{timestamp}.json"
        user_filepath = os.path.join(base_dir, user_filename)
        
        with open(user_filepath, "w", encoding="utf-8") as f:
            json.dump({
                "summary": summary["user_summary"],
                "feedback": feedback,
                "config": {
                    "type": ctx.config.interview_type.value,
                    "mode": ctx.config.mode.value,
                    "adaptive_enabled": ctx.config.allow_adaptive_questions,
                }
            }, f, indent=2)
        
        logger.info(f"💾 User results saved: {user_filepath}")
        
        # Save internal metrics separately (for ops/monitoring)
        internal_filename = f"{candidate_clean}_{ctx.config.interview_type.value}_{timestamp}_internal.json"
        internal_filepath = os.path.join(base_dir, internal_filename)
        
        with open(internal_filepath, "w", encoding="utf-8") as f:
            json.dump({
                "user_summary": summary["user_summary"],
                "internal_metrics": summary["internal_metrics"],
                "feedback": feedback,
                "config": {
                    "type": ctx.config.interview_type.value,
                    "mode": ctx.config.mode.value,
                    "adaptive_enabled": ctx.config.allow_adaptive_questions,
                }
            }, f, indent=2)
        
        logger.info(f"📊 Internal metrics saved: {internal_filepath}")
        
    except Exception as e:
        logger.error(f"❌ Failed to save results: {e}")


# ==============================
#       AGENT CLASS
# ==============================
class InterviewerAgent(Agent):
    """Main agent managing interview flow"""
    
    def __init__(self, interview_ctx: InterviewContext):
        ctx = interview_ctx
        config = ctx.config
        
        questions_list = "\n".join(
            f"{i+1}. {q}" for i, q in enumerate(ctx.core_questions)
        )
        
        mode_instructions = {
            InterviewMode.FRIENDLY: "Be warm, encouraging, and supportive. Celebrate good answers enthusiastically.",
            InterviewMode.STANDARD: "Be professional and balanced. Maintain neutral, polite tone.",
            InterviewMode.CHALLENGING: "Be direct and probe deeply. Ask tough follow-ups when answers are weak."
        }
        
        system_prompt = (
            f"You are a {config.mode.value} professional interviewer conducting a {config.interview_type.value} interview "
            f"for a {config.job_title} position at {config.company_name}.\n\n"
            f"{mode_instructions[config.mode]}\n\n"
            f"### CORE QUESTIONS ({len(ctx.core_questions)} required):\n{questions_list}\n\n"
            f"### CONVERSATION PROTOCOL:\n"
            f"Note: The greeting and first question have already been asked automatically.\n"
            f"1. After the candidate responds to any question, call `note_strength` OR `flag_concern` to record observations\n"
            f"2. If the answer is vague/weak/exceptional AND adaptive mode is enabled, call `generate_adaptive_followup` to probe deeper\n"
            f"3. If you asked a follow-up, call `complete_followup` after receiving the answer\n"
            f"4. After all notes/follow-ups are done, call `advance_question` then ask the next core question from the list\n"
            f"5. After the candidate answers question #{len(ctx.core_questions)} (the final question), call `end_interview` immediately. Do NOT speak after calling end_interview.\n\n"
            f"### ADAPTIVE QUESTIONS: {'ENABLED ✅' if config.allow_adaptive_questions else 'DISABLED ❌'}\n"
            f"When enabled, generate 1 follow-up per core question if needed.\n\n"
            f"Stay natural, conversational, and focused on candidate assessment."
        )
        
        tools_list = [
            flag_concern,
            note_strength,
            advance_question,
            end_interview,
            generate_adaptive_followup,
            complete_followup
        ]
        
        super().__init__(instructions=system_prompt, tools=tools_list)
        self.interview_ctx = interview_ctx
        self._response_lock = asyncio.Lock()  # Thread safety for concurrent updates

    async def on_user_speech_committed(self, message: ChatMessage):
        """Track responses and analyze speech patterns"""
        text = message.content
        if not text.strip():
            return
        
        # Thread-safe updates
        async with self._response_lock:
            self.interview_ctx.responses.append(text)
            self.interview_ctx.conversation_history.append({
                "role": "user",
                "content": text,
                "timestamp": datetime.now().isoformat()
            })
        
        logger.info(f"📝 User: {text[:100]}...")

        fillers = ["um", "uh", "like", "you know", "sort of", "kind of"]
        count = sum(text.lower().count(f) for f in fillers)
        self.interview_ctx.filler_count += count
        if count:
            logger.info(f"📊 Fillers detected: {count} (Total: {self.interview_ctx.filler_count})")

    async def on_enter(self):
        """Initialize interview when agent enters with retry protection"""
        ctx = self.interview_ctx
        
        try:
            # 1. Create greeting with proper grammar handling
            job_title = ctx.config.job_title
            
            # Handle edge cases for job_title
            if not job_title or job_title.lower() in ["this position", "the position", "position"]:
                greeting = (
                    f"Hello {ctx.candidate_name}! Welcome to your {ctx.config.interview_type.value} interview "
                    f"at {ctx.config.company_name}. I'm excited to learn more about you today. Let's begin!"
                )
            else:
                greeting = (
                    f"Hello {ctx.candidate_name}! Welcome to your {ctx.config.interview_type.value} interview "
                    f"for the {job_title} role at {ctx.config.company_name}. "
                    f"I'm excited to learn more about you today. Let's begin!"
                )
            
            # 2. Greet the candidate with retry logic
            await safe_say(self.session, greeting, allow_interruptions=True)
            ctx.tts_retry_count = 0  # Reset on success
            
            # 3. Set to first question
            ctx.question_index = 0
            first_question = ctx.core_questions[0] if ctx.core_questions else "Tell me about yourself."
            
            # 4. Ask the first question with retry logic
            await safe_say(self.session, first_question, allow_interruptions=True)
            
            logger.info(f"✅ Interview started: Asked question 1/{len(ctx.core_questions)}")
            
        except Exception as e:
            logger.critical(f"⚠️ Critical error during interview start: {e}")
            ctx.tts_retry_count += 1
            
            # Emergency fallback
            try:
                await safe_say(
                    self.session,
                    "I'm experiencing technical difficulties. Please hold on while I reconnect.",
                    allow_interruptions=False
                )
            except:
                logger.critical("⚠️ Unable to communicate with participant")
                # In production, trigger alert/monitoring here


# ==============================
#       ENTRYPOINT
# ==============================
async def entrypoint(ctx: JobContext):
    """Main worker entry point with connection retry"""
    
    max_connect_attempts = 3
    for attempt in range(1, max_connect_attempts + 1):
        try:
            await asyncio.wait_for(
                ctx.connect(auto_subscribe=agents.AutoSubscribe.AUDIO_ONLY),
                timeout=10.0
            )
            logger.info(f"✅ Connected to room: {ctx.room.name}")
            break
        except (asyncio.TimeoutError, ConnectionError, OSError) as e:
            logger.warning(f"⏱️ Connection attempt {attempt}/{max_connect_attempts} failed: {e}")
            if attempt == max_connect_attempts:
                logger.critical("❌ Failed to connect after all attempts")
                raise
            await asyncio.sleep(2 ** attempt)  # Exponential backoff
        except Exception as e:
            # Don't retry unrecoverable errors (auth, invalid room, etc.)
            logger.critical(f"❌ Unrecoverable connection error: {e}")
            raise

    participant = await ctx.wait_for_participant()
    logger.info(f"👤 Participant: {participant.identity}")

    # Parse interview configuration
    room_metadata = json.loads(ctx.room.metadata or '{}')
    
    config = InterviewConfig(
        interview_type=InterviewType(
            room_metadata.get('interview_type', os.getenv('INTERVIEW_TYPE', 'general'))
        ),
        mode=InterviewMode(
            room_metadata.get('interview_mode', os.getenv('INTERVIEW_MODE', 'standard'))
        ),
        num_questions=int(room_metadata.get('num_questions', os.getenv('NUM_QUESTIONS', 5))),
        allow_adaptive_questions=room_metadata.get('allow_adaptive', True),
        company_name=room_metadata.get('company_name', os.getenv('COMPANY_NAME', 'Our Company')),
        job_title=room_metadata.get('job_title', os.getenv('JOB_TITLE', 'Software Developer')),
        candidate_resume_summary=room_metadata.get('resume_summary'),
    )
    
    interview_ctx = InterviewContext(
        candidate_name=participant.identity or 'Candidate',
        config=config,
        core_questions=get_questions_for_config(config)
    )

    # populate interview_id from room metadata if present
    try:
        iid = room_metadata.get('interviewId') or room_metadata.get('interview_id') or None
        if iid:
            interview_ctx.interview_id = str(iid)
    except Exception:
        pass

    # Setup voice pipeline with timeout configurations
    llm_instance = openai.LLM(
        model="mistralai/mistral-7b-instruct:free",
        api_key=os.getenv("OPENROUTER_API_KEY"),
        base_url="https://openrouter.ai/api/v1",
    )

    session = AgentSession(
        # VAD configuration for better interruption handling
        vad=silero.VAD.load(min_silence_duration=0.6),
        stt="deepgram/nova-2:en",
        llm=llm_instance,
        tts="cartesia/sonic-2:79a125e8-cd45-4c13-8a67-188112f4dd22",
        userdata=interview_ctx,
        min_endpointing_delay=0.5,
        max_endpointing_delay=2.0,
    )

    agent = InterviewerAgent(interview_ctx=interview_ctx)

    await session.start(agent=agent, room=ctx.room)
    logger.info("🎙️ Interview session started")

    # Publish agent presence with retry
    for attempt in range(3):
        try:
            payload = json.dumps({
                "type": "agent.presence",
                "message": "agent_online",
                "config": {
                    "type": config.interview_type.value,
                    "mode": config.mode.value,
                    "questions": len(interview_ctx.core_questions)
                }
            }).encode()
            await ctx.room.local_participant.publish_data(payload, topic="agent-messages")
            break
        except Exception as e:
            logger.warning(f"Presence publish attempt {attempt + 1} failed: {e}")
            if attempt == 2:
                logger.error("Failed to publish presence after 3 attempts")
            await asyncio.sleep(1)

    # Keep alive with timeout protection
    try:
        await asyncio.wait_for(
            asyncio.Event().wait(),
            timeout=MAX_INTERVIEW_DURATION
        )
    except asyncio.TimeoutError:
        logger.warning(f"⏱️ Interview exceeded max duration ({MAX_INTERVIEW_DURATION}s), ending session")
        try:
            await session.end()
        except Exception as e:
            logger.error(f"Error ending session: {e}")
    except asyncio.CancelledError:
        logger.info("Session ended")
    except Exception as e:
        logger.error(f"Unexpected error during session: {e}")
        raise


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))