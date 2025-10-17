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

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("interview-agent")


# ==============================
#       ENUMS & CONSTANTS
# ==============================
class InterviewMode(Enum):
    """Interview difficulty/style modes"""
    FRIENDLY = "friendly"  # Encouraging, supportive
    STANDARD = "standard"  # Professional, balanced
    CHALLENGING = "challenging"  # Tough follow-ups, stress testing


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
    job_title: str = "this position"
    candidate_resume_summary: Optional[str] = None  # AI can reference this


@dataclass
class InterviewContext:
    """Stores the state of the interview"""
    candidate_name: str = "Candidate"
    config: InterviewConfig = field(default_factory=InterviewConfig)
    core_questions: List[str] = field(default_factory=list)
    adaptive_questions: List[str] = field(default_factory=list)  # AI-generated
    question_index: int = 0
    is_asking_followup: bool = False
    notes: list = field(default_factory=list)
    filler_count: int = 0
    responses: list = field(default_factory=list)
    start_time: datetime = field(default_factory=datetime.now)
    conversation_history: List[Dict] = field(default_factory=list)


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
    """
    Get appropriate questions based on interview configuration.
    
    Args:
        config: Interview configuration object
        
    Returns:
        List of curated questions
    """
    all_questions = QUESTION_BANK.get(config.interview_type, QUESTION_BANK[InterviewType.GENERAL])
    
    # Return requested number of questions (or all if fewer available)
    return all_questions[:config.num_questions]


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
    
    Args:
        reason: Why a follow-up is needed (e.g., "answer was too vague")
        focus_area: What to probe deeper on (e.g., "technical implementation details")
    """
    interview_ctx: InterviewContext = ctx.userdata
    
    if not interview_ctx.config.allow_adaptive_questions:
        return {"message": "Adaptive questions disabled. Skip follow-up.", "question": None}
    
    interview_ctx.is_asking_followup = True
    
    # Get last response
    last_response = interview_ctx.responses[-1] if interview_ctx.responses else ""
    last_question = (
        interview_ctx.core_questions[interview_ctx.question_index] 
        if interview_ctx.question_index < len(interview_ctx.core_questions) 
        else "the previous question"
    )
    
    # Generate follow-up using LLM
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
        
        stream = llm_instance.chat(chat_ctx=chat_ctx)
        followup_question = ""
        async for chunk in stream:
            followup_question += chunk.delta.content or ""
        
        followup_question = followup_question.strip()
        interview_ctx.adaptive_questions.append(followup_question)
        
        logger.info(f"🎯 Generated adaptive follow-up: {followup_question}")
        
        return {
            "message": "Follow-up generated. Ask it now before advancing to next question.",
            "question": followup_question
        }
        
    except Exception as e:
        logger.error(f"Error generating follow-up: {e}")
        interview_ctx.is_asking_followup = False
        return {"message": "Failed to generate follow-up. Continue to next question.", "question": None}


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
    
    summary = _summarize_interview(interview_ctx)
    ai_feedback = await _generate_feedback(summary, interview_ctx.config)
    _save_results(interview_ctx, summary, ai_feedback)

    await ctx.session.say(
        "Thank you for completing the interview! Let me analyze your responses..."
    )
    await asyncio.sleep(1)
    await ctx.session.say(
        "Here's your personalized feedback based on our conversation:"
    )
    await ctx.session.say(ai_feedback)
    
    await asyncio.sleep(2)
    await ctx.session.end()

    return {"message": "Interview completed successfully."}


# ==============================
#       HELPER FUNCTIONS
# ==============================
def _summarize_interview(ctx: InterviewContext) -> dict:
    """Create comprehensive interview summary"""
    duration = (datetime.now() - ctx.start_time).total_seconds() / 60
    return {
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


async def _generate_feedback(summary: dict, config: InterviewConfig) -> str:
    """Generate personalized feedback using AI"""
    try:
        feedback_prompt = (
            f"You are an expert interview coach analyzing a {summary['interview_type']} interview "
            f"for a {summary['job_title']} position at {summary['company']}.\n\n"
            f"Provide detailed, actionable feedback in this structure:\n\n"
            f"**STRENGTHS** (2-3 specific points)\n"
            f"**AREAS FOR IMPROVEMENT** (2-3 specific points with examples)\n"
            f"**COMMUNICATION ANALYSIS** (filler words, clarity, confidence)\n"
            f"**OVERALL IMPRESSION** (hire recommendation: Strong Yes / Yes / Maybe / No)\n"
            f"**NEXT STEPS** (1-2 actionable tips for improvement)\n\n"
            f"Interview Data:\n{json.dumps(summary, indent=2)}"
        )

        chat_ctx = ChatContext()
        chat_ctx.append(role="user", text=feedback_prompt)

        llm_instance = openai.LLM(
            model="mistralai/mistral-7b-instruct:free",
            api_key=os.getenv("OPENROUTER_API_KEY"),
            base_url="https://openrouter.ai/api/v1",
        )
        
        stream = llm_instance.chat(chat_ctx=chat_ctx)
        feedback_text = ""
        async for chunk in stream:
            feedback_text += chunk.delta.content or ""
            
        return feedback_text or "Feedback unavailable."
    except Exception as e:
        logger.error(f"Error generating feedback: {e}")
        return "Something went wrong while generating feedback."


def _save_results(ctx: InterviewContext, summary: dict, feedback: str):
    """Save results to file (or database in production)"""
    try:
        # For production, replace with database storage
        base_dir = "/tmp/interviews"
        os.makedirs(base_dir, exist_ok=True)
        
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"{ctx.candidate_name}_{ctx.config.interview_type.value}_{timestamp}.json"
        file_path = os.path.join(base_dir, filename)

        with open(file_path, "w", encoding="utf-8") as f:
            json.dump({
                "summary": summary,
                "feedback": feedback,
                "config": {
                    "type": ctx.config.interview_type.value,
                    "mode": ctx.config.mode.value,
                    "adaptive_enabled": ctx.config.allow_adaptive_questions,
                }
            }, f, indent=2)

        logger.info(f"💾 Results saved: {file_path}")
    except Exception as e:
        logger.error(f"Failed to save results: {e}")


# ==============================
#       AGENT CLASS
# ==============================
class InterviewerAgent(Agent):
    """Main agent managing interview flow"""
    
    def __init__(self, interview_ctx: InterviewContext):
        # Build the system prompt immediately since it's required
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
        
        # Define tools list
        tools_list = [
            flag_concern,
            note_strength,
            advance_question,
            end_interview,
            generate_adaptive_followup,
            complete_followup
        ]
        
        # Pass instructions AND tools to parent Agent class
        super().__init__(instructions=system_prompt, tools=tools_list)
        self.interview_ctx = interview_ctx

    async def on_user_speech_committed(self, message: ChatMessage):
        """Track responses and analyze speech patterns"""
        text = message.content
        if not text.strip():
            return
        
        self.interview_ctx.responses.append(text)
        self.interview_ctx.conversation_history.append({
            "role": "user",
            "content": text,
            "timestamp": datetime.now().isoformat()
        })
        
        logger.info(f"📝 User: {text[:100]}...")

        # Filler word analysis
        fillers = ["um", "uh", "like", "you know", "sort of", "kind of"]
        count = sum(text.lower().count(f) for f in fillers)
        self.interview_ctx.filler_count += count
        if count:
            logger.info(f"📊 Fillers detected: {count} (Total: {self.interview_ctx.filler_count})")

    async def on_enter(self):
        """Initialize interview when agent enters"""
        ctx = self.interview_ctx
        
        # Tools and instructions are already set in __init__
        # Just perform the initial greeting and first question
        
        # 1. Greet the candidate
        greeting = (
            f"Hello {ctx.candidate_name}! Welcome to your {ctx.config.interview_type.value} interview "
            f"for the {ctx.config.job_title} role at {ctx.config.company_name}. "
            f"I'm excited to learn more about you today. Let's begin!"
        )
        await self.session.say(greeting, allow_interruptions=True)
        
        # 2. Set to first question (index 0)
        ctx.question_index = 0
        first_question = ctx.core_questions[0] if ctx.core_questions else "Tell me about yourself."
        
        # 3. Ask the first question
        await self.session.say(first_question, allow_interruptions=True)
        
        logger.info(f"✅ Interview started: Asked question 1/{len(ctx.core_questions)}")


# ==============================
#       ENTRYPOINT
# ==============================
async def entrypoint(ctx: JobContext):
    """Main worker entry point"""
    
    await ctx.connect(auto_subscribe=agents.AutoSubscribe.AUDIO_ONLY)
    logger.info(f"✅ Connected to room: {ctx.room.name}")

    participant = await ctx.wait_for_participant()
    logger.info(f"👤 Participant: {participant.identity}")

    # Parse interview configuration from room metadata or environment
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
        job_title=room_metadata.get('job_title', os.getenv('JOB_TITLE', 'this position')),
        candidate_resume_summary=room_metadata.get('resume_summary'),
    )
    
    interview_ctx = InterviewContext(
        candidate_name=participant.identity or 'Candidate',
        config=config,
        core_questions=get_questions_for_config(config)
    )

    # Setup voice pipeline
    llm_instance = openai.LLM(
        model="mistralai/mistral-7b-instruct:free",
        api_key=os.getenv("OPENROUTER_API_KEY"),
        base_url="https://openrouter.ai/api/v1",
    )

    session = AgentSession(
        #vad=silero.VAD.load(),
        stt="deepgram/nova-2:en",
        llm=llm_instance,
        tts="cartesia/sonic-2:79a125e8-cd45-4c13-8a67-188112f4dd22",
        userdata=interview_ctx,
    )

    agent = InterviewerAgent(interview_ctx=interview_ctx)

    await session.start(agent=agent, room=ctx.room)
    logger.info("🎙️ Interview session started")

    # Publish agent presence
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
    except Exception as e:
        logger.warning(f"Presence publish failed: {e}")

    # Keep alive
    try:
        await asyncio.Event().wait()
    except asyncio.CancelledError:
        logger.info("Session ended")


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))