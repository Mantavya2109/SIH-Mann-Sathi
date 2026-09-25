import uuid
import time
from typing import Dict, Any, List, Optional
import logging
from datetime import datetime, timezone, timedelta
from backend.app.utils.supabase_client import supabase
from backend.app.utils.timezone_utils import (
    IST_ZONE,
    UTC_ZONE,
    utc_now,
    utc_now_iso,
    to_ist,
    parse_to_utc,
    parse_utc_timestamp,
    format_utc_iso,
    format_ist,
    get_ist_date_key
)

from backend.app.services.distress_scorer import apply_distress_reduction_cap, get_tier_for_score, apply_temporal_smoothing

logger = logging.getLogger(__name__)

# Permanent active case for prototype conversations
ROHAN_CASE_2_ID = "a0a0a0a0-b0b0-c0c0-d0d0-e0e0e0e0e0e0"

def is_valid_uuid(val: Any) -> bool:
    if not val:
        return False
    try:
        uuid.UUID(str(val))
        return True
    except (ValueError, TypeError, AttributeError):
        return False

def get_case_baseline(case_id: str) -> dict:
    """Pull the case's first 2-3 check-ins from Supabase to establish a personal baseline."""
    if not is_valid_uuid(case_id):
        return {"avg_score": 0.0}
    try:
        response = supabase.table("distress_scores") \
            .select("total_score, timestamp") \
            .eq("case_id", case_id) \
            .execute()

        if not response.data:
            return {"avg_score": 0.0}

        sorted_rows = sorted(
            response.data,
            key=lambda r: (parse_to_utc(r.get("timestamp")).timestamp() if parse_to_utc(r.get("timestamp")) else 0.0)
        )
        first_three = sorted_rows[:3]
        scores = [row["total_score"] for row in first_three if row.get("total_score") is not None]
        avg = sum(scores) / len(scores) if scores else 0.0
        return {"avg_score": avg}
    except Exception as e:
        logger.error(f"Error fetching baseline for case {case_id}: {e}")
        return {"avg_score": 0.0}

class ConversationSession:
    """
    Represents a single multi-turn conversation session backed by Supabase.
    """
    def __init__(self, session_id: str, case_id: str = None, max_history: int = 50):
        self.session_id = session_id
        self.case_id = case_id or ROHAN_CASE_2_ID
        self.turn_number = 0
        self.max_history = max_history
        self.history: List[Dict[str, Any]] = []
        self.created_at = time.time()
        self.updated_at = time.time()

    def get_latest_distress_score(self) -> Optional[float]:
        """
        Retrieves the most recent distress score for this case/session (0-100 scale).
        First checks in-memory session history, then queries Supabase.
        """
        if self.history:
            last_ds = self.history[-1].get("distress_score")
            if last_ds is not None and not isinstance(last_ds, str):
                num_val = float(last_ds)
                return num_val * 100.0 if num_val <= 1.0 else num_val
                
        if not is_valid_uuid(self.case_id):
            return None

        try:
            prev_res = supabase.table("distress_scores") \
                .select("total_score, timestamp") \
                .eq("case_id", self.case_id) \
                .execute()
            if prev_res.data:
                valid_scores = sorted(
                    prev_res.data,
                    key=lambda r: (parse_to_utc(r.get("timestamp")).timestamp() if parse_to_utc(r.get("timestamp")) else 0.0),
                    reverse=True
                )
                if valid_scores and valid_scores[0].get("total_score") is not None:
                    return float(valid_scores[0]["total_score"])
        except Exception as e:
            logger.warning(f"Failed to fetch previous distress score for case {self.case_id}: {e}")
            
        return None

    def add_turn(self, transcript: str, response_text: str, conversation_state: str,
                 distress_score: Any, safety_attention: bool, internal_analysis: Optional[Dict[str, Any]] = None,
                 recommendation_text: Optional[str] = None, cited_provisions: Optional[Any] = None):
        """
        Appends a conversational turn to the session history in Supabase and local cache.
        Persists authoritative score without deviation.
        """
        self.turn_number += 1
        self.updated_at = time.time()
        
        timestamp_str = utc_now_iso()
        
        # 1. Determine channel
        channel = "text"
        voice_emotions = None
        conversational_features = None
        
        if internal_analysis:
            voice_emotions = internal_analysis.get("voice_emotions")
            conversational_features = internal_analysis.get("conversational_features")
            # If voice_emotions are present, or voice channel features, it is a voice turn
            if voice_emotions is not None:
                channel = "voice"
            elif internal_analysis.get("speech_state") == "SPEECH_DETECTED":
                channel = "voice"

        # 2. Extract sentiment score from text analysis
        sentiment_val = 0.0
        if internal_analysis and "text_analysis_output" in internal_analysis:
            text_analysis_out = internal_analysis["text_analysis_output"]
            if isinstance(text_analysis_out, dict):
                sentiment_val = float(text_analysis_out.get("sentiment_score", 0.0))

        # Extract primary text emotion
        primary_emotion = "neutral"
        if internal_analysis and "text_emotions" in internal_analysis:
            text_ems = internal_analysis["text_emotions"] or {}
            if isinstance(text_ems, dict):
                sorted_ems = sorted(text_ems.items(), key=lambda x: x[1], reverse=True)
                if sorted_ems:
                    primary_emotion = sorted_ems[0][0]

        # 3. Calculate authoritative distress score with temporal smoothing
        raw_score_val = 0.0
        if distress_score is not None and not isinstance(distress_score, str):
            raw_score_val = float(distress_score)
        
        raw_100 = round(raw_score_val * 100.0, 2) if raw_score_val <= 1.0 else round(raw_score_val, 2)
        previous_score = self.get_latest_distress_score()
        total_score_db = apply_temporal_smoothing(previous_score, raw_100, safety_attention=safety_attention)
        score_val = round(total_score_db / 100.0, 4)
        fusion_tier = get_tier_for_score(total_score_db)

        # Update internal_analysis so all downstream storage and indicators reflect the authoritative score
        if internal_analysis and isinstance(internal_analysis, dict):
            if "fusion_metrics" in internal_analysis and isinstance(internal_analysis["fusion_metrics"], dict):
                internal_analysis["fusion_metrics"]["final_distress_score"] = score_val
                internal_analysis["fusion_metrics"]["tier"] = fusion_tier
                internal_analysis["fusion_metrics"]["raw_model_distress_score"] = round(raw_100 / 100.0, 4)
            internal_analysis["raw_model_distress_score"] = raw_100
            internal_analysis["smoothed_distress_score"] = total_score_db

        # Mappings for distress_indicators JSONB
        distress_indicators = {
            "session_id": self.session_id,
            "text_emotions": internal_analysis.get("text_emotions") if internal_analysis else None,
            "text_analysis_output": internal_analysis.get("text_analysis_output") if internal_analysis else None,
            "ai_response": response_text,
            "follow_up_question": internal_analysis.get("follow_up_question", "") if internal_analysis else "",
            "safety_attention": safety_attention,
            "conversation_state": conversation_state,
            "fusion_metrics": internal_analysis.get("fusion_metrics") if internal_analysis else None
        }

        # Mappings for voice_features JSONB
        voice_features = None
        if channel == "voice":
            voice_features = {
                "voice_emotions": voice_emotions,
                "conversational_features": conversational_features
            }

        # 4. Write to check_ins table in Supabase if ROHAN-CASE-2
        checkin_id = str(uuid.uuid4())
        if self.case_id == ROHAN_CASE_2_ID:
            try:
                supabase.table("check_ins").insert({
                    "id": checkin_id,
                    "case_id": self.case_id,
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
                logger.warning(f"Failed to insert turn into check_ins table: {e}")

        # 5. Calculate baseline deviation and trend
        baseline = get_case_baseline(self.case_id)
        if baseline["avg_score"] > 0:
            deviation = total_score_db - baseline["avg_score"]
            if deviation > 5:
                trend = "rising"
            elif deviation < -5:
                trend = "falling"
            else:
                trend = "stable"
            explanation_text = f"Score {total_score_db}% vs baseline {round(baseline['avg_score'], 1)}% ({trend})"
        else:
            deviation = 0.0
            trend = "stable"
            explanation_text = f"Check-in distress score is {total_score_db}% ({fusion_tier} tier)"

        sub_scores = {
            "session_id": self.session_id,
            "raw_analysis": internal_analysis,
            "baseline_deviation": round(deviation, 2)
        }

        # 6. Write to distress_scores table in Supabase if ROHAN-CASE-2
        score_id = str(uuid.uuid4())
        if self.case_id == ROHAN_CASE_2_ID:
            try:
                supabase.table("distress_scores").insert({
                    "id": score_id,
                    "case_id": self.case_id,
                    "timestamp": timestamp_str,
                    "total_score": total_score_db,
                    "sub_scores": sub_scores,
                    "trend": trend,
                    "explanation_text": explanation_text
                }).execute()
            except Exception as e:
                logger.warning(f"Failed to insert into distress_scores table: {e}")

        # 7. Evaluate multimodal fusion result + crisis safety override for alert creation
        should_trigger_alert = (
            safety_attention or
            fusion_tier in ("SEVERE", "CRITICAL", "HIGH") or
            total_score_db >= 60.0
        )

        if should_trigger_alert and self.case_id == ROHAN_CASE_2_ID:
            alert_id = str(uuid.uuid4())
            if not recommendation_text:
                recommendation_text = "Prioritize immediate counsellor outreach and legal relief assessment."
            if not cited_provisions:
                cited_provisions = ["Section 15A - Support and Relief"]

            try:
                supabase.table("alerts").insert({
                    "id": alert_id,
                    "case_id": self.case_id,
                    "distress_score_id": score_id,
                    "created_at": timestamp_str,
                    "recommendation_text": recommendation_text,
                    "status": "active",
                    "cited_provisions": cited_provisions
                }).execute()
            except Exception as e:
                logger.warning(f"Failed to insert emergency alert record: {e}")

        # 8. Update local cache (essential for test frameworks and immediate context retrieval)
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

class ConversationSessionManager:
    """
    Supabase persistent session query layer with local dictionary fallbacks for tests.
    """
    def __init__(self):
        self.sessions: Dict[str, ConversationSession] = {}

    def get_active_case_id_for_user(self, user_id: Optional[str] = None) -> str:
        """
        Resolves to the permanent active case ROHAN-CASE-2 for live conversation testing.
        """
        return ROHAN_CASE_2_ID

    def create_session(self, user_id: Optional[str] = None, max_history: int = 50) -> str:
        """
        Creates a new conversation session mapped to permanent case ROHAN-CASE-2.
        """
        session_id = str(uuid.uuid4())
        case_id = ROHAN_CASE_2_ID
        timestamp_str = utc_now_iso()
        
        # Write to local cache
        self.sessions[session_id] = ConversationSession(session_id, case_id, max_history)

        # Ensure ROHAN-CASE-2 exists and is active in Supabase
        try:
            res_case = supabase.table("cases").select("*").eq("id", case_id).execute()
            if not res_case.data:
                supabase.table("cases").insert({
                    "id": case_id,
                    "enrollment_date": timestamp_str,
                    "stage": "active",
                    "nhaa_ref": "ROHAN-CASE-2"
                }).execute()

                supabase.table("consents").insert({
                    "case_id": case_id,
                    "checkin_consent": True,
                    "wearable_consent": False,
                    "consented_at": timestamp_str
                }).execute()
                logger.info(f"Initialized permanent Supabase case: {case_id} (ROHAN-CASE-2)")
            else:
                if res_case.data[0].get("stage") != "active":
                    supabase.table("cases").update({"stage": "active"}).eq("id", case_id).execute()
        except Exception as e:
            logger.error(f"Failed to verify permanent case in Supabase: {e}", exc_info=True)
            
        return session_id

    def get_session(self, session_id: str) -> Optional[ConversationSession]:
        """
        Retrieves active session state from cache or queries Supabase for persistent history.
        """
        if session_id in self.sessions:
            return self.sessions[session_id]

        try:
            # Query Supabase for historical session data
            # Check if session_id is a known case_id (only if valid UUID)
            is_case_id_lookup = False
            if is_valid_uuid(session_id):
                res = supabase.table("cases").select("*").eq("id", session_id).execute()
                is_case_id_lookup = bool(res.data)
            
            case_id = session_id if is_case_id_lookup else self.get_active_case_id_for_user(session_id)
            session = ConversationSession(session_id=session_id, case_id=case_id)
            
            # Fetch check-ins and scores for this case if valid UUID
            checkins_data = []
            scores_data = []
            if is_valid_uuid(case_id):
                checkins_res = supabase.table("check_ins") \
                    .select("*") \
                    .eq("case_id", case_id) \
                    .order("timestamp") \
                    .execute()
                    
                scores_res = supabase.table("distress_scores") \
                    .select("*") \
                    .eq("case_id", case_id) \
                    .order("timestamp") \
                    .execute()
                    
                checkins_data = checkins_res.data or []
                scores_data = scores_res.data or []
            
            # If it's a specific session lookup, filter in python
            if not is_case_id_lookup:
                checkins_data = [c for c in checkins_data if (c.get("distress_indicators") or {}).get("session_id") == session_id]
                session_timestamps = {c["timestamp"] for c in checkins_data}
                scores_data = [s for s in scores_data if s["timestamp"] in session_timestamps]
                
            history = []
            # Zip checkins and scores where possible, otherwise process checkins directly
            for idx, checkin in enumerate(checkins_data):
                dt_parsed = parse_utc_timestamp(checkin.get("timestamp"))
                ts = dt_parsed.timestamp() if dt_parsed else time.time()
                    
                distress_indicators = checkin.get("distress_indicators") or {}
                voice_features = checkin.get("voice_features") or {}
                
                # Find matching distress score by timestamp (or fallback to same index)
                matching_score = None
                for s in scores_data:
                    if s["timestamp"] == checkin["timestamp"]:
                        matching_score = s
                        break
                if not matching_score and idx < len(scores_data):
                    matching_score = scores_data[idx]
                    
                total_score = 0.0
                sub_scores_data = {}
                trend_val = "stable"
                if matching_score:
                    total_score = matching_score.get("total_score", 0.0) / 100.0
                    sub_scores_data = matching_score.get("sub_scores") or {}
                    trend_val = matching_score.get("trend", "stable")
                
                turn_data = {
                    "turn_number": idx + 1,
                    "transcript": checkin.get("raw_text", ""),
                    "response_text": distress_indicators.get("ai_response", ""),
                    "conversation_state": distress_indicators.get("conversation_state", "NORMAL"),
                    "distress_score": total_score,
                    "safety_attention": distress_indicators.get("safety_attention", False),
                    "explanation_text": matching_score.get("explanation_text", "") if matching_score else "",
                    "internal_analysis": {
                        "voice_emotions": voice_features.get("voice_emotions") if voice_features else None,
                        "text_emotions": distress_indicators.get("text_emotions"),
                        "conversational_features": voice_features.get("conversational_features") if voice_features else None,
                        "fusion_metrics": sub_scores_data.get("raw_analysis", {}).get("fusion_metrics", {}),
                        "conversation_state": distress_indicators.get("conversation_state", "NORMAL"),
                        "safety_attention": distress_indicators.get("safety_attention", False),
                        "text_analysis_output": distress_indicators.get("text_analysis_output")
                    },
                    "timestamp": ts
                }
                history.append(turn_data)
                
            session.history = history
            session.turn_number = len(history)
            
            case_date = res.data[0].get("enrollment_date") if res.data else None
            if case_date:
                dt_case = parse_utc_timestamp(case_date)
                if dt_case:
                    session.created_at = dt_case.timestamp()
            
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
        session = self.sessions.get(session_id)
        case_id = session.case_id if session else session_id
        
        if session_id in self.sessions:
            del self.sessions[session_id]

        logger.info(f"Ended conversation session: {session_id} for case {case_id} (stage remains active)")
        return True

    def delete_session_permanently(self, session_id: str) -> bool:
        """
        Permanently deletes a case and all its dependent records (alerts, scores, check_ins, consents)
        from Supabase and local cache.
        """
        session = self.sessions.get(session_id)
        case_id = session.case_id if session else session_id

        # 1. Delete Alerts
        try:
            supabase.table("alerts").delete().eq("case_id", case_id).execute()
        except Exception as e:
            logger.warning(f"Failed to delete alerts for case {case_id}: {e}")

        # 2. Delete Distress Scores
        try:
            supabase.table("distress_scores").delete().eq("case_id", case_id).execute()
        except Exception as e:
            logger.warning(f"Failed to delete distress_scores for case {case_id}: {e}")

        # 3. Delete Check-ins
        try:
            supabase.table("check_ins").delete().eq("case_id", case_id).execute()
        except Exception as e:
            logger.warning(f"Failed to delete check_ins for case {case_id}: {e}")

        # 4. Delete Consents
        try:
            supabase.table("consents").delete().eq("case_id", case_id).execute()
        except Exception as e:
            logger.warning(f"Failed to delete consents for case {case_id}: {e}")

        # 5. Delete Case
        try:
            supabase.table("cases").delete().eq("id", case_id).execute()
        except Exception as e:
            logger.warning(f"Failed to delete case {case_id}: {e}")

        # Remove from local cache
        if session_id in self.sessions:
            del self.sessions[session_id]
            
        return True

# Global singleton instance for application use
conversation_session_manager = ConversationSessionManager()
