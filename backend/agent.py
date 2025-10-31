import os
import asyncio
import logging
from dotenv import load_dotenv

from livekit import agents
from livekit.agents import (
    Agent,
    AgentSession,
    JobContext,
    WorkerOptions,
    cli,
)
from livekit.agents.llm import ChatMessage
from livekit.plugins import silero, openai, deepgram

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("simple-test")


class SimpleAgent(Agent):
    """Minimal agent - just asks 3 questions"""
    
    def __init__(self):
        system_prompt = (
            "You are interviewing a candidate. Ask these 3 questions one by one:\n"
            "1. Tell me about yourself\n"
            "2. What are your strengths?\n"
            "3. Where do you see yourself in 5 years?\n\n"
            "After each answer, briefly acknowledge it, then ask the next question. "
            "After question 3, say 'Thank you for your time!'"
        )
        super().__init__(instructions=system_prompt)

    async def on_user_speech_committed(self, message: ChatMessage):
        logger.info(f"👤 USER: {message.content[:80]}...")

    async def on_agent_speech_committed(self, message: ChatMessage):
        logger.info(f"🤖 AGENT: {message.content[:80]}...")

    async def on_enter(self):
        greeting = "Hello! Let's begin. Tell me about yourself."
        logger.info(f"🎤 Saying: {greeting}")
        await self.session.say(greeting)
        logger.info("✅ Done speaking")


async def entrypoint(ctx: JobContext):
    await ctx.connect(auto_subscribe=agents.AutoSubscribe.AUDIO_ONLY)
    logger.info(f"✅ Connected to: {ctx.room.name}")
    
    participant = await ctx.wait_for_participant()
    logger.info(f"👤 Participant: {participant.identity}")

    # EXACT SAME SETUP AS YOUR MAIN CODE
    llm_instance = openai.LLM(
        model="mistralai/mistral-7b-instruct:free",
        api_key=os.getenv("OPENROUTER_API_KEY"),
        base_url="https://openrouter.ai/api/v1",
    )
    
    stt_provider = deepgram.STT(
        model="nova-2",
        language="en",
        interim_results=True,
        endpointing_ms=1500,
        smart_format=True,
        punctuate=True,
    )
    
    session = AgentSession(
        vad=silero.VAD.load(min_silence_duration=0.6),
        stt=stt_provider,
        llm=llm_instance,
        tts="elevenlabs/eleven_turbo_v2:pNInz6obpgDQGcFmaJgB",  # SAME AS YOURS
        min_endpointing_delay=0.5,
        max_endpointing_delay=2.0,
    )

    agent = SimpleAgent()
    await session.start(agent=agent, room=ctx.room)
    logger.info("🎙️ Agent started")

    await asyncio.Event().wait()


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))