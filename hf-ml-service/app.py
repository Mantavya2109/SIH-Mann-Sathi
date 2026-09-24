import os
import re
import wave
import tempfile
import logging
from typing import Optional, Dict, Any, List
import numpy as np
import av
import librosa
import torch
from fastapi import FastAPI, UploadFile, File, HTTPException, Header, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from transformers import (
    AutoConfig,
    AutoModelForAudioClassification,
    AutoFeatureExtractor,
    AutoTokenizer,
    AutoModelForSequenceClassification,
)
from faster_whisper import WhisperModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("HF-ML-Service")

app = FastAPI(
    title="SIH Mental Health Multimodal ML Inference Service",
    version="1.0.0",
    description="Standalone microservice for Whisper STT, Wav2Vec2 Speech Emotion, DistilRoBERTa Text Emotion, and Librosa Acoustic Analysis."
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Optional API Token protection
HF_SERVICE_TOKEN = os.getenv("HF_SERVICE_TOKEN", "")

def verify_token(authorization: Optional[str] = Header(None)):
    if HF_SERVICE_TOKEN:
        if not authorization:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authorization header missing.")
        token = authorization.replace("Bearer ", "").strip()
        if token != HF_SERVICE_TOKEN:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid authorization token.")
    return True

# ---------------------------------------------------------------------------
# Model Singletons (Loaded lazily or on startup)
# ---------------------------------------------------------------------------
SPEECH_EMOTION_MODEL_ID = os.getenv("HF_SPEECH_EMOTION_MODEL", "superb/wav2vec2-base-superb-er")
TEXT_EMOTION_MODEL_ID = os.getenv("HF_TEXT_EMOTION_MODEL", "j-hartmann/emotion-english-distilroberta-base")
WHISPER_MODEL_ID = os.getenv("HF_WHISPER_MODEL", "base.en")

class MLPipeline:
    def __init__(self):
        self.speech_config = None
        self.speech_extractor = None
        self.speech_model = None
        
        self.text_config = None
        self.text_tokenizer = None
        self.text_model = None
        
        self.whisper_model = None

    def get_speech_emotion_model(self):
        if self.speech_model is None:
            logger.info(f"Loading Wav2Vec2 speech emotion model: {SPEECH_EMOTION_MODEL_ID}")
            self.speech_config = AutoConfig.from_pretrained(SPEECH_EMOTION_MODEL_ID)
            self.speech_extractor = AutoFeatureExtractor.from_pretrained(SPEECH_EMOTION_MODEL_ID)
            self.speech_model = AutoModelForAudioClassification.from_pretrained(SPEECH_EMOTION_MODEL_ID)
            self.speech_model.eval()
        return self.speech_extractor, self.speech_model

    def get_text_emotion_model(self):
        if self.text_model is None:
            logger.info(f"Loading DistilRoBERTa text emotion model: {TEXT_EMOTION_MODEL_ID}")
            self.text_config = AutoConfig.from_pretrained(TEXT_EMOTION_MODEL_ID)
            self.text_tokenizer = AutoTokenizer.from_pretrained(TEXT_EMOTION_MODEL_ID)
            self.text_model = AutoModelForSequenceClassification.from_pretrained(TEXT_EMOTION_MODEL_ID)
            self.text_model.eval()
        return self.text_config, self.text_tokenizer, self.text_model

    def get_whisper_model(self):
        if self.whisper_model is None:
            logger.info(f"Loading Faster-Whisper model: {WHISPER_MODEL_ID}")
            self.whisper_model = WhisperModel(WHISPER_MODEL_ID, device="cpu", compute_type="float32")
        return self.whisper_model

pipeline = MLPipeline()

@app.on_event("startup")
def preload_models():
    """Warm up all models during Space boot so subsequent requests are fast."""
    try:
        pipeline.get_speech_emotion_model()
        pipeline.get_text_emotion_model()
        pipeline.get_whisper_model()
        logger.info("All ML models preloaded successfully.")
    except Exception as e:
        logger.warning(f"Failed to preload models at startup: {e}")

# ---------------------------------------------------------------------------
# Audio Processing Utilities
# ---------------------------------------------------------------------------
def convert_to_wav(input_path: str, output_path: str):
    """Converts any audio file supported by PyAV into 16kHz mono 16-bit PCM WAV."""
    with av.open(input_path) as container:
        if not container.streams.audio:
            raise ValueError("No audio stream found in the input file.")
        
        stream = container.streams.audio[0]
        resampler = av.AudioResampler(format='s16', layout='mono', rate=16000)
        
        with wave.open(output_path, 'wb') as wav_out:
            wav_out.setnchannels(1)
            wav_out.setsampwidth(2)
            wav_out.setframerate(16000)
            
            for packet in container.decode(stream):
                resampled_frames = resampler.resample(packet)
                for frame in resampled_frames:
                    data = frame.to_ndarray().tobytes()
                    wav_out.writeframes(data)

def extract_text_features(transcript: str) -> dict:
    fillers = re.findall(r"\b(um|umm|uh|hmm|ah|mm|mmm|mhm|mm-hmm)\b", transcript, re.IGNORECASE)
    repetitions = re.findall(r"\b(\w+)\s+\1\b", transcript, re.IGNORECASE)
    
    uncertainty_patterns = [
        r"\bi\s+don't\s+know\b",
        r"\bmaybe\b",
        r"\bi\s+guess\b",
        r"\bnot\s+sure\b",
        r"\bprobably\b",
        r"\bi'm\s+not\s+sure\b",
        r"\bhard\s+to\s+say\b",
        r"\bworried\b"
    ]
    uncertainty_count = 0
    detected_uncertainties = []
    for pattern in uncertainty_patterns:
        matches = re.findall(pattern, transcript, re.IGNORECASE)
        if matches:
            uncertainty_count += len(matches)
            clean_term = pattern.replace(r"\b", "").replace(r"\s+", " ").strip()
            detected_uncertainties.append(clean_term)
            
    tokens = transcript.split()
    return {
        "filler_count": len(fillers),
        "fillers_found": fillers,
        "repetition_count": len(repetitions),
        "repetitions_found": repetitions,
        "uncertainty_count": uncertainty_count,
        "uncertainties_found": list(set(detected_uncertainties)),
        "token_count": len(tokens)
    }

def extract_acoustic_features(file_path: str) -> dict:
    try:
        y, sr = librosa.load(file_path, sr=None)
        if len(y) == 0:
            return {"energy_variability": 0.0, "pitch_mean_hz": 0.0, "pitch_variability_hz": 0.0}
        
        hop_length = 512
        rms = librosa.feature.rms(y=y, hop_length=hop_length)
        energy_var = float(np.std(rms[0])) if len(rms) > 0 and len(rms[0]) > 0 else 0.0
        
        fmin = 65.0
        fmax = 500.0
        try:
            f0 = librosa.yin(y, fmin=fmin, fmax=fmax, sr=sr, hop_length=hop_length)
            f0_valid = f0[f0 > fmin]
            pitch_var = float(np.std(f0_valid)) if len(f0_valid) > 0 else 0.0
            pitch_mean = float(np.mean(f0_valid)) if len(f0_valid) > 0 else 0.0
        except Exception:
            pitch_var = 0.0
            pitch_mean = 0.0
            
        return {
            "energy_variability": energy_var,
            "pitch_mean_hz": pitch_mean,
            "pitch_variability_hz": pitch_var
        }
    except Exception as e:
        logger.error(f"Acoustic features extraction error: {e}")
        return {"energy_variability": 0.0, "pitch_mean_hz": 0.0, "pitch_variability_hz": 0.0}

def extract_vad_metrics(segment_list: List[dict], total_duration: float) -> dict:
    vad_speech_duration = sum(s["end"] - s["start"] for s in segment_list)
    meaningful_pauses = []
    previous_end = 0.0
    for segment in segment_list:
        gap = segment["start"] - previous_end
        if gap >= 0.5:
            meaningful_pauses.append((previous_end, segment["start"], gap))
        previous_end = segment["end"]
        
    trailing_gap = total_duration - previous_end
    if trailing_gap >= 0.5:
        meaningful_pauses.append((previous_end, total_duration, trailing_gap))
        
    total_pause_duration = sum(p[2] for p in meaningful_pauses)
    vad_silence_duration = max(0.0, total_duration - vad_speech_duration)
    
    vad_speech_to_silence_ratio = (
        vad_speech_duration / vad_silence_duration if vad_silence_duration > 0 else 100.0
    )
    speech_state = "NO_SPEECH_DETECTED" if vad_speech_duration <= 0.05 else "SPEECH_DETECTED"
    
    return {
        "speech_state": speech_state,
        "total_duration": total_duration,
        "speech_duration": vad_speech_duration,
        "silence_duration": vad_silence_duration,
        "pause_duration": total_pause_duration,
        "pause_count": len(meaningful_pauses),
        "speech_silence_ratio": vad_speech_to_silence_ratio
    }

def predict_speech_emotion(wav_path: str) -> Dict[str, float]:
    extractor, model = pipeline.get_speech_emotion_model()
    y_speech, _ = librosa.load(wav_path, sr=16000)
    if len(y_speech) == 0:
        return {"Neutral": 1.0, "Happy": 0.0, "Sad": 0.0, "Angry": 0.0}
    
    inputs = extractor(y_speech, sampling_rate=16000, return_tensors="pt")
    with torch.no_grad():
        outputs = model(**inputs)
        probs = torch.softmax(outputs.logits, dim=-1).squeeze().numpy()
        
    correct_labels = {0: "ang", 1: "hap", 2: "neu", 3: "sad"}
    voice_friendly_names = {"neu": "Neutral", "hap": "Happy", "ang": "Angry", "sad": "Sad"}
    voice_results = {}
    for idx, score in enumerate(probs):
        raw_label = correct_labels.get(idx, f"LABEL_{idx}")
        friendly = voice_friendly_names.get(raw_label, raw_label.capitalize())
        voice_results[friendly] = float(score)
    return voice_results

def predict_text_emotion(text: str) -> Dict[str, float]:
    config, tokenizer, model = pipeline.get_text_emotion_model()
    inputs = tokenizer(text, return_tensors="pt", truncation=True, padding=True)
    with torch.no_grad():
        outputs = model(**inputs)
        probs = torch.softmax(outputs.logits, dim=-1).squeeze().numpy()
        
    text_results = {}
    for idx, score in enumerate(probs):
        label = config.id2label[idx].capitalize()
        text_results[label] = float(score)
    return text_results

# ---------------------------------------------------------------------------
# API Endpoints
# ---------------------------------------------------------------------------
class TextEmotionRequest(BaseModel):
    text: str

@app.get("/")
@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "SIH Hugging Face ML Service",
        "speech_emotion_model": SPEECH_EMOTION_MODEL_ID,
        "text_emotion_model": TEXT_EMOTION_MODEL_ID,
        "whisper_model": WHISPER_MODEL_ID
    }

@app.post("/predict_text_emotion", dependencies=[Depends(verify_token)])
def api_predict_text_emotion(payload: TextEmotionRequest):
    if not payload.text or not payload.text.strip():
        return {
            "text_emotions": {
                "Joy": 0.0, "Sadness": 0.0, "Fear": 0.0, "Anger": 0.0,
                "Surprise": 0.0, "Disgust": 0.0, "Neutral": 1.0
            }
        }
    emotions = predict_text_emotion(payload.text.strip())
    return {"text_emotions": emotions}

@app.post("/analyze_audio", dependencies=[Depends(verify_token)])
async def api_analyze_audio(file: UploadFile = File(...)):
    """
    Accepts audio in any container (.webm, .ogg, .wav, .mp4),
    converts to standard WAV, runs Whisper + Wav2Vec2 + DistilRoBERTa + Librosa,
    and returns full multimodal signals.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="Audio file must have a filename.")
    
    ext = os.path.splitext(file.filename)[1].lower() or ".webm"
    temp_upload = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
    temp_wav = tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
    
    try:
        content = await file.read()
        if len(content) == 0:
            raise HTTPException(status_code=400, detail="Uploaded audio file is empty (0 bytes).")
            
        with open(temp_upload.name, "wb") as f:
            f.write(content)
        temp_wav.close()
        
        # 1. Convert to 16kHz mono WAV
        convert_to_wav(temp_upload.name, temp_wav.name)
        
        # 2. Whisper Speech-to-Text
        whisper = pipeline.get_whisper_model()
        segments, info = whisper.transcribe(
            temp_wav.name,
            beam_size=5,
            language="en",
            initial_prompt="Umm, uh, basically, like, you know, uh, I think we should, um, proceed... hmm, ah.",
            word_timestamps=True,
            vad_filter=True
        )
        
        segment_list = [{"start": float(s.start), "end": float(s.end), "text": s.text} for s in segments]
        transcript = "".join([s["text"] for s in segment_list]).strip()
        duration = float(info.duration)
        
        # 3. Speech Emotion
        voice_emotions = predict_speech_emotion(temp_wav.name)
        
        # 4. Conversational & Acoustic Features
        text_feats = extract_text_features(transcript)
        acoustic_feats = extract_acoustic_features(temp_wav.name)
        vad_metrics = extract_vad_metrics(segment_list, duration)
        speech_state = vad_metrics["speech_state"]
        
        # 5. Text Emotion (if speech was transcribed)
        clean_text = re.sub(r"[^\w\s]", "", transcript).strip()
        if clean_text:
            text_emotions = predict_text_emotion(transcript)
            text_state = "TEXT_EMOTIONS_AVAILABLE"
        else:
            text_emotions = "UNAVAILABLE"
            text_state = "UNAVAILABLE (Silence/Punctuation Only)"
            
        return {
            "transcript": transcript,
            "segments": segment_list,
            "duration": duration,
            "speech_state": speech_state,
            "text_state": text_state,
            "voice_emotions": voice_emotions,
            "text_emotions": text_emotions,
            "text_features": text_feats,
            "acoustic_features": acoustic_feats,
            "vad_metrics": vad_metrics
        }
        
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Inference pipeline failure: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"ML inference failure: {str(e)}")
    finally:
        for p in (temp_upload.name, temp_wav.name):
            if os.path.exists(p):
                try:
                    os.remove(p)
                except Exception:
                    pass

# ---------------------------------------------------------------------------
# Gradio Interface (Allows Free Hugging Face Gradio Space Hosting)
# ---------------------------------------------------------------------------
import gradio as gr

def gradio_text_demo(text: str):
    if not text or not text.strip():
        return {"Neutral": 1.0}
    return predict_text_emotion(text.strip())

with gr.Blocks(title="SIH ML Inference Service") as demo:
    gr.Markdown("# 🧠 SIH Multimodal Mental Health ML Inference Microservice")
    gr.Markdown("This Hugging Face Space hosts the core ML models for the SIH Mental Health Monitoring System:\n- **Whisper STT** (`faster-whisper`)\n- **Speech Emotion Recognition** (`wav2vec2-base-superb-er`)\n- **Text Emotion Classification** (`emotion-english-distilroberta-base`)\n- **Acoustic & VAD Signal Extraction** (`librosa` / `av`)")
    with gr.Tab("Test Text Emotion"):
        txt_input = gr.Textbox(label="Test Transcript / Message", placeholder="I've been feeling terrified and overwhelmed...")
        txt_output = gr.JSON(label="Predicted Emotions")
        btn = gr.Button("Classify Emotion")
        btn.click(fn=gradio_text_demo, inputs=txt_input, outputs=txt_output)

# Mount Gradio onto the FastAPI app (API endpoints /analyze_audio & /predict_text_emotion remain available at root)
app = gr.mount_gradio_app(app, demo, path="/ui")

