import uuid
import time
from typing import Dict, Any, List, Optional
import logging
from datetime import datetime
from backend.app.utils.supabase_client import supabase

logger = logging.getLogger(__name__)

def get_case_baseline(case_id: str) -> dict:
    """Pull the case's first 2-3 check-ins from Supabase to establish a personal baseline."""
    try:
        response = supabase.table("distress_scores") \
            .select("total_score") \
            .eq("case_id", case_id) \
            .order("timestamp") \
            .limit(3) \
            .execute()

        if not response.data:
            return {"avg_score": 0.0}

        scores = [row["total_score"] for row in response.data if row["total_score"] is not None]
        avg = sum(scores) / len(scores) if scores else 0.0
        return {"avg_score": avg}
    except Exception as e:
        logger.error(f"Error fetching baseline for case {case_id}: {e}")
        return {"avg_score": 0.0}

class ConversationSession:
    """
    Represents a single multi-turn conversation session backed by Supabase.
    """
    def __init__(self, session_id: str, max_history: int = 10):
        self.session_id = session_id
        self.turn_number = 0
        self.max_history = max_history
        self.history: List[Dict[str, Any]] = []
        self.created_at = time.time()
        self.updated_at = time.time()

    def add_turn(self, transcript: str, response_text: str, conversation_state: str,
                 distress_score: Any, safety_attention: bool, internal_analysis: Optional[Dict[str, Any]] = None,
                 recommendation_text: Optional[str] = None, cited_provisions: Optional[Any] = None):
        """
        Appends a conversational turn to the session history in Supabase and local cache.
        """
        self.turn_number += 1
        self.updated_at = time.time()
        
        timestamp_str = datetime.utcnow().isoformat()
        
        # 1. Determine channel
        channel = "text"
        voice_emotions = None
        conversational_features = None
        
        if internal_analysis:
            voice_emotions = internal_analysis.get("voice_emotions")
            conversational_features = internal_analysis.get("conversational_features")
            if voice_emotions or (conversational_features and conversational_features.get("filler_count", 0) > 0):
                channel = "voice"

        # 2. Extract sentiment score from text analysis
        sentiment_val = 0.0
        if internal_analysis and "text_analysis_output" in internal_analysis:
            sentiment_val = abs(internal_analysis["text_analysis_output"].get("sentiment_score", 0.0))

        # Extract primary text emotion
        primary_emotion = "neutral"
        if internal_analysis and "text_emotions" in internal_analysis:
            text_ems = internal_analysis["text_emotions"] or {}
            sorted_ems = sorted(text_ems.items(), key=lambda x: x[1], reverse=True)
            if sorted_ems:
                primary_emotion = sorted_ems[0][0]

        # Mappings for distress_indicators JSONB
        distress_indicators = {
            "text_emotions": internal_analysis.get("text_emotions") if internal_analysis else None,
            "text_analysis_output": internal_analysis.get("text_analysis_output") if internal_analysis else None,
            "ai_response": response_text,
            "follow_up_question": internal_analysis.get("follow_up_question", "") if internal_analysis else "",
            "safety_attention": safety_attention,
            "conversation_state": conversation_state
        }

        # Mappings for voice_features JSONB
        voice_features = {
            "voice_emotions": voice_emotions,
            "conversational_features": conversational_features
        }

        # 3. Write to check_ins table in Supabase
        checkin_id = str(uuid.uuid4())
        try:
            supabase.table("check_ins").insert({
                "id": checkin_id,
                "case_id": self.session_id,
                "timestamp": timestamp_str,
                "channel": channel,
                "raw_text": transcript,
                "language": "English",
                "sentiment_score": float(sentiment_val),
                "emotion": primary_emotion,
                "distress_indicators": distress_indicators,
                "voice_features": voice_features
            }).execute()
        except Exception as e:
            logger.error(f"Failed to insert turn into check_ins table: {e}", exc_info=True)

        # 4. Calculate baseline deviation and trend
        score_val = 0.0
        if distress_score is not None and not isinstance(distress_score, str):
            score_val = float(distress_score)
        
        total_score_db = round(score_val * 100, 2)
        
        baseline = get_case_baseline(self.session_id)
        deviation = total_score_db - baseline["avg_score"]
        
        if deviation > 10:
            trend = "rising"
        elif deviation < -10:
            trend = "falling"
        else:
            trend = "stable"
            
        explanation_text = f"Score {total_score_db} vs baseline {round(baseline['avg_score'], 2)} ({trend})"

        sub_scores = {
            "raw_analysis": internal_analysis,
            "baseline_deviation": round(deviation, 2)
        }

        # 5. Write to distress_scores table in Supabase
        score_id = str(uuid.uuid4())
        try:
            supabase.table("distress_scores").insert({
                "id": score_id,
                "case_id": self.session_id,
                "timestamp": timestamp_str,
                "total_score": total_score_db,
                "sub_scores": sub_scores,
                "trend": trend,
                "explanation_text": explanation_text
            }).execute()
        except Exception as e:
            logger.error(f"Failed to insert into distress_scores table: {e}", exc_info=True)

        # 6. If safety flag is active or score is critically high, trigger alert in Supabase
        if safety_attention or total_score_db >= 85.0:
            alert_id = str(uuid.uuid4())
            try:
                supabase.table("alerts").insert({
                    "id": alert_id,
                    "case_id": self.session_id,
                    "distress_score_id": score_id,
                    "created_at": timestamp_str,
                    "recommendation_text": recommendation_text,
                    "status": "active",
                    "cited_provisions": cited_provisions
                }).execute()
            except Exception as e:
                logger.error(f"Failed to insert emergency alert record: {e}", exc_info=True)

        # 7. Update local cache (essential for test frameworks and immediate context retrieval)
        turn_data = {
            "turn_number": self.turn_number,
            "transcript": transcript,
            "response_text": response_text,
            "conversation_state": conversation_state,
            "distress_score": score_val,
            "safety_attention": safety_attention,
            "internal_analysis": internal_analysis,
            "timestamp": self.updated_at
        }
        self.history.append(turn_data)
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

class Conve rsationSessionManager:
    """
    Supabase persistent session query layer with local dictionary fallbacks for tests.
    """
    def __init__(self):
        self.sessions: Dict[str, ConversationSession] = {}

    def create_session(self, max_history: int = 10) -> str:
        """
        Registers a new case and consent profile in Supabase and local cache.
        """
        session_id = str(uuid.uuid4())
        timestamp_str = datetime.utcnow().isoformat()
        
        # Write to local cache (essential for test compatibility)
        self.sessions[session_id] = ConversationSession(session_id, max_history)

        # Write to Supabase database (live persistence)
        try:
            supabase.table("cases").insert({
                "id": session_id,
                "enrollment_date": timestamp_str,
                "stage": "active"
            }).execute()

            supabase.table("consents").insert({
                "case_id": session_id,
                "checkin_consent": True,
                "wearable_consent": False,
                "consented_at": timestamp_str
            }).execute()
            
            logger.info(f"Registered new Supabase case: {session_id}")
        except Exception as e:
            logger.error(f"Failed to register case in Supabase: {e}", exc_info=True)
            
        return session_id

    def get_session(self, session_id: str) -> Optional[ConversationSession]:
        """
        Reconstructs a ConversationSession object from local cache or Supabase logs.
        """
        # 1. Check local cache first (essential for test compatibility)
        if session_id in self.sessions:
            return self.sessions[session_id]

        # 2. Query Supabase database
        try:
            res = supabase.table("cases").select("*").eq("id", session_id).execute()
            if not res.data:
                logger.warning(f"Case session not found in Supabase: {session_id}")
                return None
                
            session = ConversationSession(session_id)
            
            checkins_res = supabase.table("check_ins") \
                .select("*") \
                .eq("case_id", session_id) \
                .order("timestamp") \
                .execute()
                
            scores_res = supabase.table("distress_scores") \
                .select("*") \
                .eq("case_id", session_id) \
                .order("timestamp") \
                .execute()
                
            history = []
            for idx, (checkin, d_score) in enumerate(zip(checkins_res.data, scores_res.data)):
                try:
                    ts = datetime.fromisoformat(checkin["timestamp"].replace("Z", "+00:00")).timestamp()
                except Exception:
                    ts = time.time()
                    
                distress_indicators = checkin.get("distress_indicators") or {}
                voice_features = checkin.get("voice_features") or {}
                total_score = d_score.get("total_score", 0.0) / 100.0
                
                turn_data = {
                    "turn_number": idx + 1,
                    "transcript": checkin.get("raw_text", ""),
                    "response_text": distress_indicators.get("ai_response", ""),
                    "conversation_state": distress_indicators.get("conversation_state", "NORMAL"),
                    "distress_score": total_score,
                    "safety_attention": distress_indicators.get("safety_attention", False),
                    "internal_analysis": {
                        "voice_emotions": voice_features.get("voice_emotions"),
                        "text_emotions": distress_indicators.get("text_emotions"),
                        "conversational_features": voice_features.get("conversational_features"),
                        "fusion_metrics": d_score.get("sub_scores", {}).get("raw_analysis", {}).get("fusion_metrics", {}),
                        "conversation_state": distress_indicators.get("conversation_state", "NORMAL"),
                        "safety_attention": distress_indicators.get("safety_attention", False)
                    },
                    "timestamp": ts
                }
                history.append(turn_data)
                
            session.history = history
            session.turn_number = len(history)
            
            case_date = res.data[0].get("enrollment_date")
            if case_date:
                try:
                    session.created_at = datetime.fromisoformat(case_date.replace("Z", "+00:00")).timestamp()
                except Exception:
                    pass
            
            # Put in local cache
            self.sessions[session_id] = session
            return session
        except Exception as e:
            logger.error(f"Failed to query session from Supabase: {e}", exc_info=True)
            return None

    def delete_session(self, session_id: str) -> bool:
        """
        Marks case stage as inactive in Supabase and clears from local cache.
        """
        # Clear from local cache
        if session_id in self.sessions:
            del self.sessions[session_id]

        try:
            res = supabase.table("cases") \
                .update({"stage": "inactive"}) \
                .eq("id", session_id) \
                .execute()
            if res.data:
                logger.info(f"Marked case stage inactive in Supabase: {session_id}")
                return True
            return False
        except Exception as e:
            logger.error(f"Failed to close case session in Supabase: {e}", exc_info=True)
            return False

# Global singleton instance for application use
conversation_session_manager = ConversationSessionManager()
