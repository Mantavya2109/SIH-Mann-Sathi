import uuid
import time
from typing import Dict, Any, List, Optional
import logging

logger = logging.getLogger(__name__)

class ConversationSession:
    """
    Represents a single multi-turn conversation session.
    """
    def __init__(self, session_id: str, max_history: int = 10):
        self.session_id = session_id
        self.turn_number = 0
        self.max_history = max_history
        self.history: List[Dict[str, Any]] = []
        self.created_at = time.time()
        self.updated_at = time.time()

    def add_turn(self, transcript: str, response_text: str, conversation_state: str,
                 distress_score: Any, safety_attention: bool, internal_analysis: Optional[Dict[str, Any]] = None):
        """
        Appends a conversational turn to the session history.
        """
        self.turn_number += 1
        self.updated_at = time.time()
        
        turn_data = {
            "turn_number": self.turn_number,
            "transcript": transcript,
            "response_text": response_text,
            "conversation_state": conversation_state,
            "distress_score": distress_score,
            "safety_attention": safety_attention,
            "internal_analysis": internal_analysis,
            "timestamp": self.updated_at
        }
        
        self.history.append(turn_data)
        
        # Enforce history limit (sliding window of context)
        if len(self.history) > self.max_history:
            self.history.pop(0)

    def get_context(self) -> Dict[str, Any]:
        """
        Returns recent conversation history context.
        """
        return {
            "previous_turns": self.history,
            "total_turns": self.turn_number,
            "last_state": self.history[-1]["conversation_state"] if self.history else "NORMAL"
        }

class ConversationSessionManager:
    """
    In-memory session storage layer.
    Modular design allows simple future replacements with Redis or databases.
    """
    def __init__(self):
        self.sessions: Dict[str, ConversationSession] = {}

    def create_session(self, max_history: int = 10) -> str:
        """
        Initializes and registers a new conversation session.
        """
        session_id = str(uuid.uuid4())
        self.sessions[session_id] = ConversationSession(session_id, max_history)
        logger.info(f"Created new conversation session: {session_id}")
        return session_id

    def get_session(self, session_id: str) -> Optional[ConversationSession]:
        """
        Retrieves a session from memory.
        """
        return self.sessions.get(session_id)

    def delete_session(self, session_id: str) -> bool:
        """
        Terminates and purges a session.
        """
        if session_id in self.sessions:
            del self.sessions[session_id]
            logger.info(f"Terminated conversation session: {session_id}")
            return True
        return False

# Global singleton instance for application use
conversation_session_manager = ConversationSessionManager()
