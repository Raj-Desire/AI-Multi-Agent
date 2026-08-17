"""
Conversation Service
Handles turn-taking state progression, conversation flow, and latency stopwatch helpers.
"""

import time
from typing import Optional
from app.voice.session import CallSession, ConversationState


class ConversationService:
    """Manages high-level conversation states and turn lifecycle."""

    @staticmethod
    def start_user_speech_timer(session: CallSession):
        session.user_speech_start_ts = time.perf_counter()

    @staticmethod
    def stop_user_speech_timer(session: CallSession) -> float:
        if session.user_speech_start_ts:
            latency_ms = (time.perf_counter() - session.user_speech_start_ts) * 1000.0
            session.user_speech_start_ts = None
            return round(latency_ms, 2)
        return 0.0

    @staticmethod
    def start_thinking_timer(session: CallSession):
        session.agent_thinking_start_ts = time.perf_counter()

    @staticmethod
    def stop_thinking_timer(session: CallSession) -> float:
        if session.agent_thinking_start_ts:
            latency_ms = (time.perf_counter() - session.agent_thinking_start_ts) * 1000.0
            session.agent_thinking_start_ts = None
            return round(latency_ms, 2)
        return 0.0

    @staticmethod
    def start_speaking_timer(session: CallSession):
        session.agent_speaking_start_ts = time.perf_counter()

    @staticmethod
    def stop_speaking_timer(session: CallSession) -> float:
        if session.agent_speaking_start_ts:
            latency_ms = (time.perf_counter() - session.agent_speaking_start_ts) * 1000.0
            session.agent_speaking_start_ts = None
            return round(latency_ms, 2)
        return 0.0
