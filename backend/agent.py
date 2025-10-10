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
import json
from datetime import datetime
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
        # transcript and metadata for post-interview analysis
        self.transcript = []
        self.metadata = {
            "start_time": None,
            "end_time": None,
            "candidate_name": None,
        }


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
    
    # Start the session
    await session.start(
        room=ctx.room,
        agent=InterviewerAssistant(),
    )
    
    # Attach a minimal data message handler so the frontend can send instructions/personality
    try:
        async def _on_data(msg):
            try:
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

    # mark start time
    try:
        session.agent.metadata['start_time'] = datetime.utcnow().isoformat()
    except Exception:
        logger.debug('Agent: could not set start_time on metadata', exc_info=True)

    # Defensive event listeners to capture transcripts if the session exposes events
    try:
        # helper to append to transcript safely
        def _append_transcript(speaker, text, confidence=None):
            try:
                entry = {
                    'speaker': speaker,
                    'text': text,
                    'ts': datetime.utcnow().isoformat(),
                }
                if confidence is not None:
                    entry['confidence'] = float(confidence)
                session.agent.transcript.append(entry)
            except Exception:
                logger.exception('Agent: failed to append transcript entry')

        # Try common event names; many SDKs provide speech-committed hooks
        if hasattr(session, 'on'):
            # guard: some implementations use string event names
            try:
                async def _on_user_speech(event):
                    try:
                        # event shapes vary between providers
                        text = getattr(event, 'text', None)
                        confidence = None
                        if not text and hasattr(event, 'alternatives'):
                            alt = event.alternatives[0]
                            text = getattr(alt, 'text', None) or getattr(alt, 'transcript', None)
                            confidence = getattr(alt, 'confidence', None)
                        if text:
                            _append_transcript('candidate', text, confidence)
                    except Exception:
                        logger.exception('Agent: error in _on_user_speech')

                async def _on_agent_speech(event):
                    try:
                        text = getattr(event, 'text', None) or getattr(event, 'transcript', None)
                        if text:
                            _append_transcript('interviewer', text)
                    except Exception:
                        logger.exception('Agent: error in _on_agent_speech')

                session.on('user_speech_committed', _on_user_speech)
                session.on('agent_speech_committed', _on_agent_speech)
            except Exception:
                logger.debug('Agent: session.on handlers not supported', exc_info=True)
        else:
            logger.debug('Agent: session.on not found; transcript events not attached')
    except Exception:
        logger.exception('Agent: failed to attach transcript event handlers')
    
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
            # mark end time
            try:
                session.agent.metadata['end_time'] = datetime.utcnow().isoformat()
            except Exception:
                pass

            # perform a lightweight post-interview analysis and save results
            try:
                transcript = []
                try:
                    transcript = list(session.agent.transcript)
                except Exception:
                    transcript = []

                # simple heuristics
                total_words = 0
                total_entries = 0
                filler_count = 0
                hesitations = 0
                for e in transcript:
                    t = e.get('text', '') if isinstance(e, dict) else str(e)
                    words = [w for w in t.split() if w]
                    total_words += len(words)
                    total_entries += 1
                    # crude filler detection
                    filler_count += sum(1 for f in ['um', 'uh', 'like', 'you know'] if f in t.lower())
                    hesitations += t.lower().count('...')

                avg_words = total_words / total_entries if total_entries else 0
                clarity = round(min(100, 50 + avg_words), 1)
                confidence = round(max(0, 100 - (filler_count * 5 + hesitations * 3)), 1)

                analysis = {
                    'summary': 'Auto-generated summary',
                    'metrics': {
                        'clarity': clarity,
                        'confidence': confidence,
                        'filler_words': filler_count,
                        'hesitations': hesitations,
                        'total_entries': total_entries,
                        'total_words': total_words,
                    },
                    'transcript_snippet': transcript[-5:] if transcript else [],
                    'metadata': getattr(session.agent, 'metadata', {}),
                }

                # Use the LLM to generate feedback if available
                try:
                    prompt = (
                        "You are an assistant that reviews interview transcripts.\n"
                        "Provide a short feedback paragraph about the candidate's communication, pacing, confidence, and 2-3 actionable tips.\n\n"
                        "Transcript snippet:\n" + '\n'.join([f"{e.get('speaker')}: {e.get('text')}" for e in analysis['transcript_snippet']])
                    )
                    reply = None
                    try:
                        reply = await session.llm.complete(prompt) if hasattr(session, 'llm') and hasattr(session.llm, 'complete') else None
                    except Exception:
                        # try older generate API
                        try:
                            reply = await session.generate_reply(instructions=prompt)
                        except Exception:
                            reply = None

                    feedback_text = None
                    try:
                        if isinstance(reply, str):
                            feedback_text = reply
                        elif reply is not None:
                            feedback_text = getattr(reply, 'text', None) or getattr(reply, 'message', None) or str(reply)
                    except Exception:
                        feedback_text = None

                    analysis['ai_feedback'] = feedback_text or 'AI feedback not available.'
                except Exception:
                    analysis['ai_feedback'] = 'AI feedback generation failed.'

                # save to disk
                try:
                    out_dir = os.path.join(os.getcwd(), 'backend', 'interviews')
                    os.makedirs(out_dir, exist_ok=True)
                    fname = f"interview_{datetime.utcnow().strftime('%Y%m%dT%H%M%SZ')}.json"
                    full_path = os.path.join(out_dir, fname)
                    with open(full_path, 'w', encoding='utf-8') as fh:
                        json.dump({'analysis': analysis, 'transcript': transcript}, fh, indent=2, ensure_ascii=False)
                    logger.info('Agent: interview analysis saved to %s', full_path)
                    # attempt to POST the analysis to the frontend upload endpoint
                    try:
                        frontend_base = os.getenv('FRONTEND_BASE_URL', 'http://localhost:3000')
                        upload_url = frontend_base.rstrip('/') + '/api/interviews/upload'
                        agent_secret = os.getenv('AGENT_UPLOAD_SECRET')
                        if not agent_secret:
                            logger.warning('Agent: AGENT_UPLOAD_SECRET not set, skipping secure upload')
                        else:
                            import requests, hmac, hashlib
                            body = {'interviewId': fname.replace('.json',''), 'analysis': analysis, 'transcript': transcript}
                            raw = json.dumps(body)
                            sig = hmac.new(agent_secret.encode('utf-8'), raw.encode('utf-8'), hashlib.sha256).hexdigest()
                            headers = {'x-agent-signature': sig, 'Content-Type': 'application/json'}
                            resp = requests.post(upload_url, data=raw, headers=headers, timeout=10)
                            if resp.status_code >= 200 and resp.status_code < 300:
                                logger.info('Agent: uploaded analysis to %s', upload_url)
                            else:
                                logger.warning('Agent: upload endpoint returned %s: %s', resp.status_code, resp.text[:200])
                    except Exception:
                        logger.debug('Agent: could not upload analysis to frontend', exc_info=True)
                except Exception:
                    logger.exception('Agent: failed to save interview analysis')

                # publish a short summary back to the room as a data message
                try:
                    summary_payload = json.dumps({'type': 'agent.post_interview_summary', 'metrics': analysis['metrics'], 'ai_feedback': (analysis.get('ai_feedback') or '')[:500]})
                    async def _maybe_call(fn, *a, **kw):
                        try:
                            res = fn(*a, **kw)
                            if hasattr(res, '__await__'):
                                await res
                        except Exception:
                            pass

                    published = False
                    if hasattr(ctx.room, 'send_data'):
                        await _maybe_call(ctx.room.send_data, summary_payload)
                        published = True
                    elif hasattr(ctx.room, 'local_participant') and hasattr(ctx.room.local_participant, 'publishData'):
                        await _maybe_call(ctx.room.local_participant.publishData, summary_payload)
                        published = True
                    elif hasattr(ctx.room, 'local_participant') and hasattr(ctx.room.local_participant, 'publishData'):
                        await _maybe_call(ctx.room.local_participant.publishData, summary_payload)
                        published = True
                    if published:
                        logger.info('Agent: published post-interview summary to room')
                except Exception:
                    logger.exception('Agent: failed to publish post-interview summary')
            except Exception:
                logger.exception('Agent: post-interview analysis failed')

            if hasattr(session, 'aclose'):
                try:
                    await session.aclose()
                except Exception:
                    pass
        except Exception:
            pass


if __name__ == "__main__":
    logger.info("🎯 LiveKit AI Interviewer Agent")
    agents.cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))

