import os
import re
import tempfile
import shutil
import logging
import wave
import av
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from backend.app.schemas.analysis import DistressAnalysisResponse, ConversationResponse, SessionStartResponse, SessionEndResponse, CaseInput, PrioritizationResponse, PrioritizeRequest
from backend.app.services.speech_emotion import speech_emotion_service
from backend.app.services.speech_to_text import speech_to_text_service
from backend.app.services.text_emotion import text_emotion_service
from backend.app.services.conversation_features import conversation_features_service
from backend.app.services.distress_scorer import distress_scorer_service
from backend.app.services.conversation_manager import conversation_manager
from backend.app.services.response_generator import response_generator
from backend.app.services.conversation_session import conversation_session_manager
from backend.app.services.text_analysis import analyze_text_signal
from backend.app.services.recommendation import generate_recommendation
from pydantic import BaseModel
from typing import Optional, Union, List, Dict, Any
from backend.app.utils.supabase_client import supabase

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("FastAPIMain")

app = FastAPI(title="SIH Mental Health Monitoring API")

# Add CORS Middleware to allow requests from the local development frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def convert_to_wav(input_path: str, output_path: str):
    """
    Converts any audio file supported by PyAV (WebM, Ogg, MP4, WAV, etc.)
    into a standard PCM 16-bit, 16000Hz, mono WAV file.
    """
    with av.open(input_path) as container:
        if not container.streams.audio:
            raise ValueError("No audio stream found in the input file.")
        
        stream = container.streams.audio[0]
        
        # Setup resampler for 16000Hz mono 16-bit signed PCM
        resampler = av.AudioResampler(
            format='s16',
            layout='mono',
            rate=16000
        )
        
        with wave.open(output_path, 'wb') as wav_out:
            wav_out.setnchannels(1)
            wav_out.setsampwidth(2) # 16-bit (2 bytes)
            wav_out.setframerate(16000)
            
            for packet in container.decode(stream):
                resampled_frames = resampler.resample(packet)
                for frame in resampled_frames:
                    data = frame.to_ndarray().tobytes()
                    wav_out.writeframes(data)

@app.get("/")
def home():
    return {"message": "SIH Backend is running"}

@app.get("/api/debug/env")
def debug_env():
    from backend.app.utils.supabase_client import supabase as client
    import os
    from pathlib import Path
    
    env_path = Path(__file__).resolve().parents[2] / ".env"
    exists = env_path.exists()
    
    # Test query directly
    cases_data = []
    cases_err = None
    try:
        res = client.table("cases").select("*").execute()
        cases_data = res.data or []
    except Exception as e:
        cases_err = str(e)
        
    return {
        "env_path": str(env_path),
        "env_exists": exists,
        "SUPABASE_URL": os.getenv("SUPABASE_URL"),
        "SUPABASE_KEY_PREFIX": os.getenv("SUPABASE_KEY")[:15] if os.getenv("SUPABASE_KEY") else None,
        "cases_count": len(cases_data),
        "cases_error": cases_err,
        "cases_sample": cases_data[:2]
    }

@app.post("/api/analyze", response_model=DistressAnalysisResponse, status_code=status.HTTP_200_OK)
async def analyze_audio(file: UploadFile = File(...)):
    """
    Multimodal Mental Health Distress Analysis Endpoint.
    Accepts a single WAV audio file, processes it through voice emotion classification,
    Whisper STT, DistilRoBERTa text emotion classification, conversational disfluency metrics,
    and a multimodal fusion layer to assign a distress index and risk level.
    """
    # 1. Validate file metadata
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file must have a filename."
        )
    allowed_extensions = {".wav", ".webm", ".ogg", ".opus", ".mp4", ".m4a"}
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in allowed_extensions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file format. Supported extensions: {', '.join(allowed_extensions)}"
        )
        
    temp_upload_path = None
    temp_file_path = None
    
    try:
        # Create temporary file for upload
        temp_upload = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
        temp_upload_path = temp_upload.name
        
        # Create temporary file for processed WAV
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
        temp_file_path = temp_file.name
        temp_file.close()
        
        # 2. Save stream to temporary path
        shutil.copyfileobj(file.file, temp_upload)
        temp_upload.close()
        
        # Validate that the file is not empty (size check)
        if os.path.getsize(temp_upload_path) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The uploaded audio file is empty (0 bytes)."
            )
            
        # Convert audio to standard WAV format
        try:
            convert_to_wav(temp_upload_path, temp_file_path)
        except Exception as e:
            logger.error(f"Failed to convert uploaded audio to WAV: {e}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to process audio file format: {str(e)}"
            )
            
        # 3. Predict Voice Emotions
        voice_emotions = speech_emotion_service.predict_emotion(temp_file_path)
        
        # 4. Transcribe Audio
        stt_result = speech_to_text_service.transcribe(temp_file_path)
        transcript = stt_result["transcript"]
        segments = stt_result["segments"]
        duration = stt_result["duration"]
        
        # 5. Extract Conversational Features
        text_feats = conversation_features_service.extract_text_features(transcript)
        acoustic_feats = conversation_features_service.extract_acoustic_features(temp_file_path)
        vad_metrics = conversation_features_service.extract_vad_metrics(segments, duration)
        speech_state = vad_metrics["speech_state"]
        
        # 6. Validate Transcript for Text Emotion Recognition
        clean_text_check = re.sub(r"[^\w\s]", "", transcript).strip()
        is_text_valid = len(clean_text_check) > 0
        
        if is_text_valid:
            text_emotions = text_emotion_service.predict_emotion(transcript)
            text_state = "TEXT_EMOTIONS_AVAILABLE"
        else:
            text_emotions = "UNAVAILABLE"
            text_state = "UNAVAILABLE (Silence/Punctuation Only)"
            
        # 7. Calculate Distress Fusion Score
        fusion = distress_scorer_service.calculate_score(
            voice_emotions=voice_emotions,
            text_emotions=text_emotions,
            text_features=text_feats,
            acoustic_features=acoustic_feats,
            vad_metrics=vad_metrics,
            speech_state=speech_state
        )
        
        # 8. Consolidate conversational features (joining flat dicts)
        conv_features = {
            **text_feats,
            **acoustic_feats,
            **vad_metrics
        }
        
        return {
            "transcript": transcript,
            "speech_state": speech_state,
            "text_state": text_state,
            "voice_emotions": voice_emotions,
            "text_emotions": text_emotions,
            "conversational_features": conv_features,
            "fusion_metrics": fusion
        }
        
    except HTTPException as he:
        # Re-raise user validation errors
        raise he
    except Exception as e:
        logger.error(f"Failed to process distress analysis: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An error occurred during multimodal analysis: {str(e)}"
        )
    finally:
        # 9. Always delete temporary files
        for p in (temp_upload_path, temp_file_path):
            if p and os.path.exists(p):
                try:
                    os.remove(p)
                except Exception as e:
                    logger.warning(f"Could not remove temporary file {p}: {e}")

class LoginRequest(BaseModel):
    email: str
    password: str

class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    role: str

class LoginResponse(BaseModel):
    authenticated: bool
    user: UserResponse

@app.post("/api/auth/login", response_model=LoginResponse, status_code=status.HTTP_200_OK)
async def login(req: LoginRequest):
    try:
        # Check if user exists in the auth user list first to allow password bypass for development/demo
        auth_users = []
        try:
            users_list = supabase.auth.admin.list_users()
            auth_users = users_list if isinstance(users_list, list) else getattr(users_list, "users", [])
        except Exception as e:
            logger.warning(f"Failed to fetch auth users list for password bypass: {e}")
            
        target_user = None
        for u in auth_users:
            if u.email.lower() == req.email.lower():
                target_user = u
                break
                
        if target_user:
            metadata = getattr(target_user, "user_metadata", {}) or {}
            return {
                "authenticated": True,
                "user": {
                    "id": target_user.id,
                    "name": metadata.get("name", "Demo User"),
                    "email": target_user.email,
                    "role": metadata.get("role", "victim")
                }
            }
            
        # Fallback to standard Supabase authentication
        from supabase import create_client
        from backend.app.utils.supabase_client import url, key
        temp_client = create_client(url, key)
        auth_res = temp_client.auth.sign_in_with_password({
            "email": req.email,
            "password": req.password
        })
        if auth_res and auth_res.user:
            user = auth_res.user
            metadata = user.user_metadata or {}
            return {
                "authenticated": True,
                "user": {
                    "id": user.id,
                    "name": metadata.get("name", "Demo User"),
                    "email": user.email,
                    "role": metadata.get("role", "victim")
                }
            }
        else:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication failed"
            )
    except Exception as e:
        logger.error(f"Login failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Authentication failed: {str(e)}"
        )

@app.post("/api/conversation/start", response_model=SessionStartResponse, status_code=status.HTTP_201_CREATED)
def start_conversation(user_id: Optional[str] = Form(None)):
    """
    Creates a new conversation session, returning its session ID.
    """
    session_id = conversation_session_manager.create_session(user_id=user_id)
    return {
        "session_id": session_id,
        "message": "Conversation started"
    }

@app.post("/api/conversation/respond", response_model=ConversationResponse, status_code=status.HTTP_200_OK)
async def get_conversation_response(file: UploadFile = File(None), message: str = Form(None), session_id: str = Form(None)):
    """
    Multimodal Mental Health Response Generation Endpoint.
    Accepts either an UploadFile audio file or a text message, and an optional session_id,
    runs the appropriate analysis pipeline, and returns the response plus session/turn data.
    """
    # If session_id is provided, check if it exists
    session = None
    text_signal = None
    if session_id:
        session = conversation_session_manager.get_session(session_id)
        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Conversation session not found: {session_id}"
            )
            
    if file is None and message is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either audio file or text message must be provided."
        )

    temp_upload_path = None
    temp_file_path = None
    
    try:
        if file is not None:
            # VOICE TURN: Run normal audio processing pipeline
            # Validate file metadata
            if not file.filename:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Uploaded file must have a filename."
                )
            allowed_extensions = {".wav", ".webm", ".ogg", ".opus", ".mp4", ".m4a"}
            ext = os.path.splitext(file.filename)[1].lower()
            if ext not in allowed_extensions:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Unsupported file format. Supported extensions: {', '.join(allowed_extensions)}"
                )
                
            # Create temporary file for upload
            temp_upload = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
            temp_upload_path = temp_upload.name
            
            # Create temporary file for processed WAV
            temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
            temp_file_path = temp_file.name
            temp_file.close()
            
            # Save stream to temporary path
            shutil.copyfileobj(file.file, temp_upload)
            temp_upload.close()
            
            # Validate that the file is not empty (size check)
            if os.path.getsize(temp_upload_path) == 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="The uploaded audio file is empty (0 bytes)."
                )
                
            # Convert audio to standard WAV format
            try:
                convert_to_wav(temp_upload_path, temp_file_path)
            except Exception as e:
                logger.error(f"Failed to convert uploaded audio to WAV: {e}")
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Failed to process audio file format: {str(e)}"
                )
                
            # 3. Predict Voice Emotions
            voice_emotions = speech_emotion_service.predict_emotion(temp_file_path)
            
            # 4. Transcribe Audio
            stt_result = speech_to_text_service.transcribe(temp_file_path)
            transcript = stt_result["transcript"]
            segments = stt_result["segments"]
            duration = stt_result["duration"]
            
            # 5. Extract Conversational Features
            text_feats = conversation_features_service.extract_text_features(transcript)
            acoustic_feats = conversation_features_service.extract_acoustic_features(temp_file_path)
            vad_metrics = conversation_features_service.extract_vad_metrics(segments, duration)
            speech_state = vad_metrics["speech_state"]
        else:
            # TEXT TURN: Run text-only pipeline using the text_analysis service (or direct text prediction)
            transcript = message
            
            # Predict Text Emotions via local DistilRoBERTa
            text_emotions = text_emotion_service.predict_emotion(transcript)
            text_state = "TEXT_EMOTIONS_AVAILABLE"
            
            # Call the existing text_analysis.py to analyze the text signal (using Groq)
            try:
                text_signal = analyze_text_signal(transcript)
                logger.info(f"text_analysis.py signal: {text_signal}")
            except Exception as e:
                logger.error(f"Failed to run text_analysis: {e}")
                text_signal = {}

            # Voice/Acoustic details are None for text turn
            voice_emotions = None
            text_feats = conversation_features_service.extract_text_features(transcript)
            acoustic_feats = None
            vad_metrics = None
            speech_state = "NO_SPEECH_DETECTED"
            
        # 6. Validate Transcript for Text Emotion Recognition (only for voice turn, text turn already computed)
        if file is not None:
            clean_text_check = re.sub(r"[^\w\s]", "", transcript).strip()
            is_text_valid = len(clean_text_check) > 0
            
            if is_text_valid:
                text_emotions = text_emotion_service.predict_emotion(transcript)
                text_state = "TEXT_EMOTIONS_AVAILABLE"
            else:
                text_emotions = "UNAVAILABLE"
                text_state = "UNAVAILABLE (Silence/Punctuation Only)"
            
        # 7. Calculate Distress Fusion Score
        fusion = distress_scorer_service.calculate_score(
            voice_emotions=voice_emotions,
            text_emotions=text_emotions,
            text_features=text_feats,
            acoustic_features=acoustic_feats,
            vad_metrics=vad_metrics,
            speech_state=speech_state,
            voice_available=(file is not None)
        )
        
        # Assemble pipeline analysis result dictionary for manager consumption
        analysis_result = {
            "transcript": transcript,
            "speech_state": speech_state,
            "text_state": text_state,
            "fusion_metrics": fusion
        }
        if file is None:
            analysis_result["text_analysis_output"] = text_signal
        
        # 8. Run Conversation Manager State Decision Logic with optional session history
        history_context = session.history if session else None
        manager_decision = conversation_manager.determine_state_and_response(analysis_result, history_context)
        
        # 9. Run Response Generator logic
        final_response = response_generator.generate_response(
            manager_decision,
            analysis_result,
            history_context
        )
        
        # 10. Store turn in session if session exists
        turn_number = None
        if session:
            internal_analysis = {
                "speech_state": speech_state,
                "text_state": text_state,
                "voice_emotions": voice_emotions,
                "text_emotions": text_emotions,
                "conversational_features": {
                    **text_feats,
                    **(acoustic_feats or {}),
                    **(vad_metrics or {})
                },
                "fusion_metrics": fusion,
                "conversation_state": final_response["conversation_state"],
                "safety_attention": final_response["safety_attention"],
                "text_analysis_output": text_signal if file is None else None
            }
            
            # Call RAG recommender if distress is high or safety flag is triggered
            rec_text = None
            cited_provs = None
            d_val = fusion.get("final_distress_score", 0.0)
            d_val_num = float(d_val) if not isinstance(d_val, str) else 0.0
            
            if final_response["safety_attention"] or d_val_num >= 0.85:
                try:
                    rec_res = generate_recommendation(transcript)
                    rec_text = rec_res.get("recommendation_text")
                    cited_provs = rec_res.get("cited_provisions")
                except Exception as rec_ex:
                    logger.warning(f"RAG recommendation failed: {rec_ex}")
                    rec_text = "Prioritize immediate outreach per protection of civil rights relief provisions."
                    cited_provs = ["Section 15A - Support and Relief"]

            session.add_turn(
                transcript=transcript,
                response_text=final_response["response_text"],
                conversation_state=final_response["conversation_state"],
                distress_score=fusion.get("final_distress_score", 0.0),
                safety_attention=final_response["safety_attention"],
                internal_analysis=internal_analysis,
                recommendation_text=rec_text,
                cited_provisions=cited_provs
            )
            turn_number = session.turn_number
            
        # Return merged conversation response
        return {
            "session_id": session_id,
            "turn_number": turn_number,
            "transcript": transcript,
            "response_text": final_response["response_text"],
            "follow_up_question": final_response["follow_up_question"]
        }
        
    except HTTPException as he:
        # Re-raise user validation errors
        raise he
    except Exception as e:
        logger.error(f"Failed to generate conversation response: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An error occurred during response generation: {str(e)}"
        )
    finally:
        # 11. Always delete temporary files
        for p in (temp_upload_path, temp_file_path):
            if p and os.path.exists(p):
                try:
                    os.remove(p)
                except Exception as e:
                    logger.warning(f"Could not remove temporary file {p}: {e}")

@app.post("/api/conversation/end", response_model=SessionEndResponse, status_code=status.HTTP_200_OK)
def end_conversation(session_id: str = Form(...)):
    """
    Terminates and removes a conversation session from in-memory session manager.
    """
    success = conversation_session_manager.delete_session(session_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Conversation session not found: {session_id}"
        )
    return {
        "session_id": session_id,
        "message": "Conversation ended"
    }

@app.get("/api/conversation/{session_id}", status_code=status.HTTP_200_OK)
def get_conversation_session_details(session_id: str):
    """
    Exposes detailed session metrics and history for the counsellor dashboard.
    """
    session = conversation_session_manager.get_session(session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Conversation session not found: {session_id}"
        )
    return {
        "session_id": session.session_id,
        "turn_number": session.turn_number,
        "created_at": session.created_at,
        "updated_at": session.updated_at,
        "history": session.history
    }

@app.post("/api/cases/prioritize", response_model=PrioritizationResponse, status_code=status.HTTP_200_OK)
async def prioritize_active_cases(request: PrioritizeRequest = None):
    """
    Triage and rank check-in cases by distress level, trends, overrides, and recency.
    If 'request.cases' is provided, prioritize those items.
    Otherwise, compile inputs from active sessions in memory.
    """
    import time
    from backend.app.services.case_prioritization import case_prioritization_service

    cases = request.cases if request else None

    # 1. Use client-provided cases if supplied
    if cases is not None and len(cases) > 0:
        cases_data = []
        for c in cases:
            if hasattr(c, "model_dump"):
                cases_data.append(c.model_dump())
            else:
                cases_data.append(c.dict())
        prioritized = case_prioritization_service.prioritize_cases(cases_data)
        return {"prioritized_cases": prioritized}

    # 2. Compile dynamically from active sessions
    active_sessions = []
    
    # 2a. Add any locally cached sessions (e.g. from unit testing)
    for session_id, session in conversation_session_manager.sessions.items():
        active_sessions.append(session)
        
    # 2b. Query active cases from Supabase (skip in test environment to avoid database contamination)
    import sys
    is_testing = "pytest" in sys.modules or "unittest" in sys.modules
    
    if not is_testing:
        try:
            from backend.app.utils.supabase_client import supabase
            cases_res = supabase.table("cases").select("id").eq("stage", "active").execute()
            for row in (cases_res.data or []):
                sid = row.get("id")
                # Avoid duplicating sessions already in cache
                if any(s.session_id == sid for s in active_sessions):
                    continue
                session = conversation_session_manager.get_session(sid)
                if session:
                    active_sessions.append(session)
        except Exception as e:
            logger.error(f"Failed to query active cases from Supabase: {e}", exc_info=True)
        
    compiled_cases = []

    for session in active_sessions:
        if not session.history:
            continue

        latest_turn = session.history[-1]
        
        # Get distress score safely
        distress = latest_turn.get("distress_score", 0.0)
        if distress is None or isinstance(distress, str):  # Handle "UNAVAILABLE" and null values
            distress = 0.0
        
        # Retrieve risk level and safety flag
        internal = latest_turn.get("internal_analysis", {})
        fusion = internal.get("fusion_metrics", {})
        risk_level = fusion.get("tier", "LOW")
        safety = bool(latest_turn.get("safety_attention", False))

        # Calculate simple trend based on last 2 turns
        trend = "stable"
        if len(session.history) >= 2:
            prev_turn = session.history[-2]
            prev_distress = prev_turn.get("distress_score", 0.0)
            if isinstance(prev_distress, str):
                prev_distress = 0.0
            
            diff = distress - prev_distress
            if diff > 0.05:
                trend = "rising"
            elif diff < -0.05:
                trend = "falling"

        # Calculate time since check-in in days
        elapsed = time.time() - session.updated_at
        days = max(0.0, elapsed / 86400.0)

        compiled_cases.append({
            "case_id": session.session_id,
            "distress_score": float(distress),
            "trend": trend,
            "days_since_last_checkin": float(days),
            "risk_level": risk_level,
            "safety_attention": safety
        })

    prioritized = case_prioritization_service.prioritize_cases(compiled_cases)
    return {"prioritized_cases": prioritized}

from pydantic import BaseModel
from datetime import datetime

class AcknowledgeRequest(BaseModel):
    acknowledged_by: str

@app.patch("/api/alerts/{alert_id}/acknowledge", status_code=status.HTTP_200_OK)
def acknowledge_alert(alert_id: str, request: AcknowledgeRequest):
    """
    Acknowledge a critical case alert by ID in Supabase.
    """
    try:
        from backend.app.utils.supabase_client import supabase
        timestamp_str = datetime.utcnow().isoformat()
        res = supabase.table("alerts") \
            .update({
                "status": "acknowledged",
                "acknowledged_by": request.acknowledged_by,
                "acknowledged_at": timestamp_str
            }) \
            .eq("id", alert_id) \
            .execute()
        
        if not res.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Alert not found: {alert_id}"
            )
        return {
            "alert_id": alert_id,
            "message": "Alert successfully acknowledged",
            "acknowledged_by": request.acknowledged_by,
            "acknowledged_at": timestamp_str
        }
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Failed to acknowledge alert: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@app.get("/api/counsellor/cases")
def get_counsellor_cases(debug: bool = False):
    try:
        # Fetch cases
        cases_res = supabase.table("cases").select("*").execute()
        cases_data = cases_res.data or []
        
        # Fetch auth users to map roles
        auth_users = []
        try:
            users_list = supabase.auth.admin.list_users()
            auth_users = users_list if isinstance(users_list, list) else getattr(users_list, "users", [])
        except Exception as e:
            logger.warning(f"Failed to fetch auth users: {e}")
            
        user_map = {}
        for u in auth_users:
            meta = getattr(u, "user_metadata", {}) or {}
            user_map[str(u.id)] = {
                "name": meta.get("name", "Unknown User"),
                "email": u.email,
                "role": meta.get("role", "victim")
            }
            
        rohan_info = None
        ananya_info = None
        for uid, uinfo in user_map.items():
            if uinfo.get("name") == "Rohan" or "rohan" in uinfo.get("email", "").lower():
                rohan_info = uinfo
            if "ananya" in uinfo.get("name", "").lower() or "ananya" in uinfo.get("email", "").lower():
                ananya_info = uinfo

        if not rohan_info:
            rohan_info = {"name": "Rohan", "email": "rohan@nirbhayamitra.com", "role": "victim"}
        if not ananya_info:
            ananya_info = {"name": "Ananya Patel", "email": "ananya@nirbhayamitra.com", "role": "victim"}

        debug_logs = []
        results = []
        for case in cases_data:
            case_id = case["id"]
            nhaa_ref = case.get("nhaa_ref", "") or ""
            
            user_info = None
            if nhaa_ref and "ROHAN" in nhaa_ref.upper():
                user_info = rohan_info.copy()
            elif nhaa_ref and "ANANYA" in nhaa_ref.upper():
                user_info = ananya_info.copy()
            else:
                user_info = user_map.get(str(case_id))
                
            if not user_info:
                user_info = {
                    "name": "Anonymous Case" if not nhaa_ref else f"Case {nhaa_ref}",
                    "email": "N/A",
                    "role": "victim"
                }
            
            # Skip if user is counsellor
            if user_info.get("role") == "counsellor":
                debug_logs.append(f"Skipped counsellor case {case_id}")
                continue
                
            latest_score = 0.0
            trend = "stable"
            risk_tier = "LOW"
            days_since_last_checkin = 10.0
            safety_attention = False
            last_checkin_timestamp = ""
            try:
                score_res = supabase.table("distress_scores") \
                    .select("*") \
                    .eq("case_id", case_id) \
                    .order("timestamp", desc=True) \
                    .limit(1) \
                    .execute()
                if score_res.data:
                    latest_score = score_res.data[0].get("total_score", 0.0)
                    trend = score_res.data[0].get("trend", "stable")
                    s_val = latest_score / 100.0
                    if s_val <= 0.25:
                        risk_tier = "LOW"
                    elif s_val <= 0.50:
                        risk_tier = "MODERATE"
                    elif s_val <= 0.75:
                        risk_tier = "HIGH"
                    else:
                        risk_tier = "SEVERE"
                
                checkin_res = supabase.table("check_ins") \
                    .select("*") \
                    .eq("case_id", case_id) \
                    .order("timestamp", desc=True) \
                    .limit(1) \
                    .execute()
                if checkin_res.data:
                    last_checkin = checkin_res.data[0]
                    ts_str = last_checkin.get("timestamp")
                    last_checkin_timestamp = ts_str
                    if ts_str:
                        try:
                            clean_ts = ts_str.replace("Z", "")
                            if "+" in clean_ts:
                                clean_ts = clean_ts.split("+")[0]
                            dt = datetime.fromisoformat(clean_ts)
                            elapsed = datetime.utcnow() - dt
                            days_since_last_checkin = max(0.0, elapsed.total_seconds() / 86400.0)
                        except Exception as parse_ex:
                            logger.warning(f"Failed to parse timestamp {ts_str}: {parse_ex}")
                    distress_indicators = last_checkin.get("distress_indicators") or {}
                    safety_attention = bool(distress_indicators.get("safety_attention", False))
                
                debug_logs.append(f"Successfully processed case {case_id}, score {latest_score}")
            except Exception as score_ex:
                logger.warning(f"Failed to fetch metrics for case {case_id}: {score_ex}")
                debug_logs.append(f"Failed query for case {case_id}: {score_ex}")
                
            results.append({
                "case_id": case_id,
                "nhaa_ref": nhaa_ref,
                "enrollment_date": case.get("enrollment_date", ""),
                "stage": case.get("stage", "active"),
                "user": user_info,
                "latest_distress_score": latest_score,
                "risk_tier": risk_tier,
                "trend": trend,
                "days_since_last_checkin": days_since_last_checkin,
                "safety_attention": safety_attention,
                "latest_checkin_timestamp": last_checkin_timestamp
            })
            
        # Run prioritization
        try:
            from backend.app.services.case_prioritization import case_prioritization_service
            cases_for_p = [
                {
                    "case_id": r["case_id"],
                    "distress_score": r["latest_distress_score"],
                    "trend": r["trend"],
                    "days_since_last_checkin": r["days_since_last_checkin"],
                    "risk_level": r["risk_tier"],
                    "safety_attention": r["safety_attention"]
                }
                for r in results
            ]
            prioritized = case_prioritization_service.prioritize_cases(cases_for_p)
            p_map = {
                p["case_id"]: {
                    "priority_level": p.get("priority", "LOW"),
                    "priority_score": p.get("priority_score", 0.0),
                    "priority_reason": p.get("reason", "Standard rule-based ranking.")
                }
                for p in prioritized
            }
        except Exception as p_ex:
            logger.error(f"Prioritization engine error: {p_ex}")
            p_map = {}

        for r in results:
            p_data = p_map.get(r["case_id"], {
                "priority_level": "LOW",
                "priority_score": 0.0,
                "priority_reason": "Standard rule-based ranking."
            })
            r.update(p_data)

        # Sort results by priority_score descending
        results.sort(key=lambda x: x.get("priority_score", 0.0), reverse=True)
            
        if debug:
            return {
                "cases_data_len": len(cases_data),
                "auth_users_len": len(auth_users),
                "user_map": user_map,
                "debug_logs": debug_logs,
                "results": results
            }
            
        return results
    except Exception as e:
        logger.error(f"Failed to get counsellor cases: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/counsellor/cases/{case_id}")
def get_case_details(case_id: str):
    try:
        case_res = supabase.table("cases").select("*").eq("id", case_id).execute()
        if not case_res.data:
            raise HTTPException(status_code=404, detail="Case not found")
        case = case_res.data[0]
        
        user_info = None
        try:
            users_list = supabase.auth.admin.list_users()
            auth_users = users_list if isinstance(users_list, list) else getattr(users_list, "users", [])
            
            # Identify Rohan and Ananya in the auth list
            rohan_u = None
            ananya_u = None
            for u in auth_users:
                meta = getattr(u, "user_metadata", {}) or {}
                name = meta.get("name", "Unknown User")
                if name == "Rohan" or "rohan" in u.email.lower():
                    rohan_u = u
                if "ananya" in name.lower() or "ananya" in u.email.lower():
                    ananya_u = u

            nhaa_ref = case.get("nhaa_ref", "") or ""
            target_user = None
            
            if nhaa_ref and "ROHAN" in nhaa_ref.upper():
                target_user = rohan_u
            elif nhaa_ref and "ANANYA" in nhaa_ref.upper():
                target_user = ananya_u
            else:
                for u in auth_users:
                    if str(u.id) == str(case_id):
                        target_user = u
                        break
                        
            if target_user:
                meta = getattr(target_user, "user_metadata", {}) or {}
                user_info = {
                    "id": str(target_user.id),
                    "name": meta.get("name", "Unknown User"),
                    "email": target_user.email,
                    "role": meta.get("role", "victim")
                }
        except Exception as e:
            logger.warning(f"Failed to fetch user in details: {e}")
            
        if not user_info:
            nhaa_ref = case.get("nhaa_ref", "") or ""
            user_info = {
                "id": case_id,
                "name": "Rohan" if "ROHAN" in nhaa_ref.upper() else "Ananya Patel" if "ANANYA" in nhaa_ref.upper() else "Anonymous Case",
                "email": "rohan@nirbhayamitra.com" if "ROHAN" in nhaa_ref.upper() else "ananya@nirbhayamitra.com" if "ANANYA" in nhaa_ref.upper() else "N/A",
                "role": "victim"
            }
            
        checkins_count = 0
        latest_score = 0.0
        trend = "stable"
        risk_tier = "LOW"
        last_interaction = ""
        try:
            checkins_res = supabase.table("check_ins").select("timestamp", count="exact").eq("case_id", case_id).execute()
            checkins_count = checkins_res.count if hasattr(checkins_res, "count") else len(checkins_res.data or [])
            
            score_res = supabase.table("distress_scores") \
                .select("*") \
                .eq("case_id", case_id) \
                .order("timestamp", desc=True) \
                .execute()
                
            explanation_text = ""
            if score_res.data:
                latest_score = score_res.data[0].get("total_score", 0.0)
                trend = score_res.data[0].get("trend", "stable")
                last_interaction = score_res.data[0].get("timestamp", "")
                explanation_text = score_res.data[0].get("explanation_text", "")
                s_val = latest_score / 100.0
                if s_val <= 0.25:
                    risk_tier = "LOW"
                elif s_val <= 0.50:
                    risk_tier = "MODERATE"
                elif s_val <= 0.75:
                    risk_tier = "HIGH"
                else:
                    risk_tier = "SEVERE"
        except Exception as ex:
            logger.warning(f"Error querying case metrics: {ex}")
            
        return {
            "case": case,
            "user": user_info,
            "summary": {
                "current_distress_score": latest_score / 100.0,
                "risk_tier": risk_tier,
                "trend": trend,
                "total_check_ins": checkins_count,
                "last_interaction": last_interaction,
                "explanation_text": explanation_text
            }
        }
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Failed to get case details: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/counsellor/cases/{case_id}/history")
def get_case_history(case_id: str):
    """
    Return turn-by-turn history for a case, sourced from persistent Supabase
    check_ins + distress_scores tables.  Falls back to in-memory session if
    Supabase returns nothing (e.g. first turn not yet committed).
    """
    try:
        # ── 1. Verify case exists ──────────────────────────────────────────────
        case_res = supabase.table("cases").select("id").eq("id", case_id).execute()
        if not case_res.data:
            raise HTTPException(status_code=404, detail="Case not found")

        # ── 2. Fetch all check_ins for this case, ordered oldest→newest ────────
        ci_res = (
            supabase.table("check_ins")
            .select("*")
            .eq("case_id", case_id)
            .order("timestamp", desc=False)
            .execute()
        )
        check_ins = ci_res.data or []

        # ── 3. Fetch all distress_scores for this case (for per-turn score) ────
        ds_res = (
            supabase.table("distress_scores")
            .select("*")
            .eq("case_id", case_id)
            .order("timestamp", desc=False)
            .execute()
        )
        distress_rows = ds_res.data or []

        if check_ins:
            # ── 4. Build history list from check_ins + nearest distress score ──
            # check_ins and distress_scores share case_id + a very close timestamp
            # (inserted in the same request handler, seconds apart).
            # We match each check_in to the nearest distress_score within 30 s.
            
            # Pre-parse distress_score timestamps to unix once
            ds_parsed: list = []
            for row in distress_rows:
                ts_raw = row.get("timestamp", "")
                try:
                    dt = datetime.fromisoformat(ts_raw.replace("Z", "+00:00"))
                    ds_parsed.append((dt.timestamp(), row))
                except Exception:
                    ds_parsed.append((0.0, row))

            history = []
            for ci in check_ins:
                # Convert check_in timestamp
                ts_raw = ci.get("timestamp", "")
                try:
                    dt = datetime.fromisoformat(ts_raw.replace("Z", "+00:00"))
                    ts_unix = dt.timestamp()
                except Exception:
                    ts_unix = 0.0

                # Find the nearest distress_score within 30 seconds
                ds_row: dict = {}
                if ds_parsed:
                    closest = min(ds_parsed, key=lambda x: abs(x[0] - ts_unix))
                    if abs(closest[0] - ts_unix) <= 30:
                        ds_row = closest[1]

                total_score_raw = ds_row.get("total_score", 0.0) or 0.0
                distress_score_norm = total_score_raw / 100.0  # normalise 0-1

                # Extract sub-analysis from distress_indicators (check_in field)
                di = ci.get("distress_indicators") or {}
                raw_analysis = (ds_row.get("sub_scores") or {}).get("raw_analysis") or {}
                
                text_ao = di.get("text_analysis_output") or raw_analysis.get("text_analysis_output") or {}
                vf = ci.get("voice_features") or {}

                # Voice emotions: check raw_analysis first, then check_in voice_features
                voice_emotions = raw_analysis.get("voice_emotions") or vf.get("voice_emotions") or None
                text_emotions = raw_analysis.get("text_emotions") or di.get("text_emotions") or None

                # Conversational features: extract from raw_analysis or build from check_in voice_features
                conv_feats = raw_analysis.get("conversational_features") or vf.get("conversational_features") or None
                if conv_feats is None and vf:
                    # Construct from check_in voice_features / acoustic_features if available
                    af = vf.get("acoustic_features") or {}
                    cf = vf.get("conversational_features") or {}
                    if af or cf:
                        conv_feats = {
                            "filler_count": cf.get("filler_count", 0),
                            "pause_duration": cf.get("pause_count", 0) * 0.5 if "pause_duration" not in cf else cf.get("pause_duration", 0.0),
                            "pause_count": cf.get("pause_count", 0),
                            "pitch_mean_hz": af.get("pitch_mean", 0.0) or af.get("pitch_mean_hz", 0.0),
                            "pitch_variability_hz": af.get("pitch_variance", 0.0) or af.get("pitch_variability_hz", 0.0),
                            "energy_variability": af.get("energy_mean", 0.0) or af.get("energy_variability", 0.0),
                        }
                elif isinstance(conv_feats, dict) and vf.get("acoustic_features"):
                    af = vf.get("acoustic_features") or {}
                    if "pitch_mean_hz" not in conv_feats and "pitch_mean" in af:
                        conv_feats["pitch_mean_hz"] = af["pitch_mean"]
                    if "pitch_variability_hz" not in conv_feats and "pitch_variance" in af:
                        conv_feats["pitch_variability_hz"] = af["pitch_variance"]

                fusion_metrics = raw_analysis.get("fusion_metrics") or {
                    "tier": ds_row.get("risk_tier", "LOW"),
                    "final_distress_score": distress_score_norm
                }

                turn = {
                    "timestamp": ts_unix,
                    "transcript": ci.get("raw_text") or ci.get("transcript", ""),
                    "distress_score": distress_score_norm,
                    "safety_attention": di.get("safety_attention") or raw_analysis.get("safety_attention") or False,
                    "conversation_state": di.get("conversation_state") or raw_analysis.get("conversation_state") or "NORMAL",
                    "internal_analysis": {
                        "text_analysis_output": text_ao,
                        "text_emotions": text_emotions,
                        "voice_emotions": voice_emotions,
                        "conversational_features": conv_feats,
                        "fusion_metrics": fusion_metrics,
                        "speech_state": raw_analysis.get("speech_state") or ("SPEECH_DETECTED" if voice_emotions else "NO_SPEECH_DETECTED"),
                        "text_state": raw_analysis.get("text_state") or "TEXT_EMOTIONS_AVAILABLE"
                    },
                    "explanation_text": ds_row.get("explanation_text", ""),
                    "risk_tier": ds_row.get("risk_tier", ""),
                }
                history.append(turn)
            return history

        # ── 5. Fallback: in-memory session (only useful during live session) ───
        session = conversation_session_manager.get_session(case_id)
        if session:
            return session.history
        return []

    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Failed to get case history: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/counsellor/alerts")
def get_all_alerts():
    try:
        res = supabase.table("alerts").select("*").order("created_at", desc=True).execute()
        alerts = res.data or []
        
        auth_users = []
        try:
            users_list = supabase.auth.admin.list_users()
            auth_users = users_list if isinstance(users_list, list) else getattr(users_list, "users", [])
        except Exception as e:
            logger.warning(f"Failed to fetch auth users in alerts: {e}")
            
        # Fetch cases to map alert user names using nhaa_ref
        cases_res = supabase.table("cases").select("id", "nhaa_ref").execute()
        case_ref_map = {c["id"]: c.get("nhaa_ref", "") for c in cases_res.data or []}

        user_map = {}
        for u in auth_users:
            meta = getattr(u, "user_metadata", {}) or {}
            user_map[str(u.id)] = meta.get("name", "Unknown User")

        # Fallback names
        rohan_name = "Rohan"
        ananya_name = "Ananya Patel"
        for u in auth_users:
            meta = getattr(u, "user_metadata", {}) or {}
            name = meta.get("name", "Unknown User")
            if name == "Rohan" or "rohan" in u.email.lower():
                rohan_name = name
            if "ananya" in name.lower() or "ananya" in u.email.lower():
                ananya_name = name
            
        for alert in alerts:
            cid = alert.get("case_id")
            nhaa_ref = case_ref_map.get(cid, "") or ""
            
            if nhaa_ref and "ROHAN" in nhaa_ref.upper():
                alert["user_name"] = rohan_name
            elif nhaa_ref and "ANANYA" in nhaa_ref.upper():
                alert["user_name"] = ananya_name
            else:
                alert["user_name"] = user_map.get(str(cid), f"Case {str(cid)[:8]}" if cid else "Unknown")
            
        return alerts
    except Exception as e:
        logger.error(f"Failed to get alerts: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
