"""
LiveKit AI Interviewer Agent - FIXED VERSION
Compatible with livekit-agents >= 1.0.0

Uses:
- OpenRouter for LLM (mistralai/mistral-7b-instruct:free)
- LiveKit Cloud's Deepgram for STT
- LiveKit Cloud's Cartesia for TTS
"""

import os
import asyncio
import logging
from dotenv import load_dotenv
from livekit import agents
from livekit.agents import Agent, AgentSession, WorkerOptions
from livekit.plugins import openai

load_dotenv()

# Simple logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)

logger = logging.getLogger(__name__)


class InterviewerAssistant(Agent):
    """Professional technical interviewer"""

    def __init__(self) -> None:
        super().__init__(
            instructions=(
                "You are a professional technical interviewer conducting a job interview. "
                "Be warm, friendly, and professional. Ask clear questions about the candidate's "
                "background, skills, and experience. Listen carefully and ask relevant follow-up "
                "questions. Keep your responses concise and conversational - avoid long explanations."
            )
        )


async def entrypoint(ctx: agents.JobContext):
    """Main agent entrypoint"""
    
    # Validate required environment variables
    required_vars = {
        "OPENROUTER_API_KEY": os.getenv("OPENROUTER_API_KEY"),
        "LIVEKIT_URL": os.getenv("LIVEKIT_URL"),
        "LIVEKIT_API_KEY": os.getenv("LIVEKIT_API_KEY"),
        "LIVEKIT_API_SECRET": os.getenv("LIVEKIT_API_SECRET"),
    }
    
    missing = [k for k, v in required_vars.items() if not v]
    if missing:
        raise RuntimeError(f"Missing required environment variables: {', '.join(missing)}")
    
    logger.info("🚀 Starting AI Interviewer Agent...")
    
    # Configure OpenRouter LLM
    llm_instance = openai.LLM(
        model="mistralai/mistral-7b-instruct:free",  # Your chosen model
        api_key=os.getenv("OPENROUTER_API_KEY"),
        base_url="https://openrouter.ai/api/v1",
    )
    
    # Create agent session with LiveKit Cloud STT/TTS
    session = AgentSession(
        # Use correct model identifiers for LiveKit Cloud
        stt="deepgram/nova-2:en",  # ✅ Correct Deepgram model
        llm=llm_instance,
        tts="cartesia/sonic-2:79a125e8-cd45-4c13-8a67-188112f4dd22",  # ✅ Correct Cartesia model
    )
    session_active = True
    
    # Start the session
    await session.start(
        room=ctx.room,
        agent=InterviewerAssistant(),
    )
    
    # Attach a minimal data message handler so the frontend can send instructions/personality
    try:
        async def _on_data(msg):
            try:
                if not session_active:
                    return
                raw = None
                if hasattr(msg, 'data'):
                    raw = msg.data
                elif hasattr(msg, 'payload'):
                    raw = msg.payload

                if isinstance(raw, (bytes, bytearray)):
                    raw = raw.decode('utf-8', errors='ignore')
                if not raw:
                    return

                import json
                try:
                    obj = json.loads(raw)
                except Exception:
                    return

                if obj.get('type') == 'agent.instruction':
                    # Prefer a direct 'instruction' field, fall back to 'text'
                    new_instr = obj.get('instruction') or obj.get('text') or ''
                    if not new_instr:
                        # build a friendly instruction if descriptive fields provided
                        name = obj.get('name', 'Candidate')
                        topic = obj.get('topic', '')
                        personality = obj.get('personality', '')
                        new_instr = f"You are an interviewer. Personality: {personality}. Topic: {topic}. Conduct a professional interview for {name}."

                    try:
                        if hasattr(session.agent, 'set_instructions'):
                            session.agent.set_instructions(new_instr)
                        else:
                            session.agent.instructions = new_instr
                        logger.info('Agent: updated instructions from data message')
                    except Exception:
                        logger.exception('Agent: failed to apply instructions from data message')
            except Exception:
                logger.exception('Agent: unexpected error in data handler')

        # attach depending on room API surface
        try:
            if hasattr(ctx.room, 'on'):
                ctx.room.on('data_received', _on_data)
            elif hasattr(ctx.room, 'on_data'):
                ctx.room.on_data(_on_data)
        except Exception:
            # non-fatal if attach fails
            logger.debug('Agent: could not attach data handler', exc_info=True)
    except Exception:
        # be tolerant; the agent will continue without live instruction updates
        logger.debug('Agent: data handler setup skipped', exc_info=True)
    
    # safe room name access
    room_name = getattr(ctx.room, "name", None) or getattr(ctx.room, "room_name", None) if hasattr(ctx, 'room') else None
    logger.info(f"✅ Agent joined room: {room_name}")
    
    # Generate initial greeting
    try:
        logger.info("💬 Generating greeting...")
        await session.generate_reply(
            instructions=(
                "Greet the candidate warmly and professionally. "
                "Ask them to introduce themselves briefly."
            )
        )
        logger.info("✅ Greeting generated successfully")
    except Exception as e:
        logger.error(f"❌ Failed to generate greeting: {e}")
    
    # Keep agent running until cancelled
    try:
        # Wait for cancellation
        while True:
            await asyncio.sleep(1)
    except asyncio.CancelledError:
        logger.info("🛑 Agent shutting down...")
    finally:
        # Cleanup
        try:
            session_active = False
        except Exception:
            pass

        try:
            if hasattr(ctx.room, 'off'):
                try:
                    ctx.room.off('data_received', _on_data)
                except Exception:
                    pass
            elif hasattr(ctx.room, 'remove_listener'):
                try:
                    ctx.room.remove_listener('data_received', _on_data)
                except Exception:
                    pass
        except Exception:
            pass

        try:
            if hasattr(session, 'aclose'):
                await session.aclose()
        except Exception:
            pass


if __name__ == "__main__":
    logger.info("🎯 LiveKit AI Interviewer Agent")
    agents.cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))

