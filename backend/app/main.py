import os
import re
import tempfile
import shutil
import logging
import wave
import av
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from backend.app.schemas.analysis import DistressAnalysisResponse, ConversationResponse, SessionStartResponse, SessionEndResponse
from backend.app.services.speech_emotion import speech_emotion_service
from backend.app.services.speech_to_text import speech_to_text_service
from backend.app.services.text_emotion import text_emotion_service
from backend.app.services.conversation_features import conversation_features_service
from backend.app.services.distress_scorer import distress_scorer_service
from backend.app.services.conversation_manager import conversation_manager
from backend.app.services.response_generator import response_generator
from backend.app.services.conversation_session import conversation_session_manager

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

@app.post("/api/conversation/start", response_model=SessionStartResponse, status_code=status.HTTP_201_CREATED)
def start_conversation():
    """
    Creates a new conversation session, returning its session ID.
    """
    session_id = conversation_session_manager.create_session()
    return {
        "session_id": session_id,
        "message": "Conversation started"
    }

@app.post("/api/conversation/respond", response_model=ConversationResponse, status_code=status.HTTP_200_OK)
async def get_conversation_response(file: UploadFile = File(...), session_id: str = Form(None)):
    """
    Multimodal Mental Health Response Generation Endpoint.
    Accepts a single WAV audio file and an optional session_id to maintain history context,
    runs the full analysis pipeline, and returns the response plus session/turn data.
    """
    # If session_id is provided, check if it exists
    session = None
    if session_id:
        session = conversation_session_manager.get_session(session_id)
        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Conversation session not found: {session_id}"
            )
            
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
        
        # Assemble pipeline analysis result dictionary for manager consumption
        analysis_result = {
            "transcript": transcript,
            "speech_state": speech_state,
            "text_state": text_state,
            "fusion_metrics": fusion
        }
        
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
                    **acoustic_feats,
                    **vad_metrics
                },
                "fusion_metrics": fusion,
                "conversation_state": final_response["conversation_state"],
                "safety_attention": final_response["safety_attention"]
            }
            session.add_turn(
                transcript=transcript,
                response_text=final_response["response_text"],
                conversation_state=final_response["conversation_state"],
                distress_score=fusion.get("final_distress_score", 0.0),
                safety_attention=final_response["safety_attention"],
                internal_analysis=internal_analysis
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