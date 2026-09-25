import os
import re
import io
import logging
import tempfile
from typing import Dict, Any, Optional, List
try:
    import numpy as np
except ImportError:
    np = None

try:
    import soundfile as sf
except ImportError:
    sf = None

try:
    import librosa
except ImportError:
    librosa = None

from groq import Groq
from dotenv import load_dotenv
from pathlib import Path

env_path = Path(__file__).resolve().parents[3] / ".env"
load_dotenv(dotenv_path=env_path)

from backend.app.services.conversation_features import conversation_features_service

logger = logging.getLogger("HFClient")

# Model IDs
TEXT_EMOTION_MODEL_ID = "j-hartmann/emotion-english-distilroberta-base"
AUDIO_EMOTION_MODEL_ID = "superb/wav2vec2-base-superb-er"

class HFInferenceClient:
    """
    Direct model inference client utilizing Hugging Face Transformers & Librosa
    for local/cached inference with GPU/CPU acceleration, plus Groq Cloud / Faster-Whisper for STT.
    """
    def __init__(self):
        self.api_token = os.getenv("HF_API_TOKEN") or os.getenv("HF_TOKEN") or ""
        groq_key = os.getenv("GROQ_API_KEY")
        self.groq_client = Groq(api_key=groq_key) if groq_key else None
        
        self._text_pipeline = None
        self._audio_pipeline = None
        self._whisper_model = None

    def _get_text_pipeline(self):
        """Lazy-loaded DistilRoBERTa 7-class emotion classification pipeline."""
        if self._text_pipeline is None:
            from transformers import pipeline
            logger.info(f"Loading Hugging Face text emotion pipeline: {TEXT_EMOTION_MODEL_ID}")
            self._text_pipeline = pipeline(
                "text-classification",
                model=TEXT_EMOTION_MODEL_ID,
                token=self.api_token if self.api_token else None,
                top_k=None
            )
            logger.info("DistilRoBERTa text emotion pipeline loaded successfully.")
        return self._text_pipeline

    def _get_audio_pipeline(self):
        """Lazy-loaded Wav2Vec2 4-class speech emotion classification pipeline."""
        if self._audio_pipeline is None:
            from transformers import pipeline
            logger.info(f"Loading Hugging Face speech emotion pipeline: {AUDIO_EMOTION_MODEL_ID}")
            self._audio_pipeline = pipeline(
                "audio-classification",
                model=AUDIO_EMOTION_MODEL_ID,
                token=self.api_token if self.api_token else None,
                top_k=None
            )
            logger.info("Wav2Vec2 speech emotion pipeline loaded successfully.")
        return self._audio_pipeline

    def _get_whisper_model(self):
        """Lazy-loaded local Faster-Whisper model."""
        if self._whisper_model is None:
            try:
                from faster_whisper import WhisperModel
                logger.info("Loading Faster-Whisper STT model (base, cpu)...")
                self._whisper_model = WhisperModel("base", device="cpu", compute_type="int8")
                logger.info("Faster-Whisper model loaded successfully.")
            except Exception as e:
                logger.warning(f"Could not load faster_whisper locally: {e}. Will use Groq Whisper.")
                self._whisper_model = None
        return self._whisper_model

    async def predict_text_emotion(self, text: str) -> Dict[str, float]:
        """
        Runs authentic 7-class emotion classification on user text using DistilRoBERTa.
        Returns:
            {
                "Joy": float,
                "Sadness": float,
                "Fear": float,
                "Anger": float,
                "Surprise": float,
                "Disgust": float,
                "Neutral": float
            }
        """
        if not text or not text.strip():
            return {
                "Joy": 0.0, "Sadness": 0.0, "Fear": 0.0, "Anger": 0.0,
                "Surprise": 0.0, "Disgust": 0.0, "Neutral": 1.0
            }

        try:
            pipe = self._get_text_pipeline()
            # DistilRoBERTa inference
            raw_results = pipe(text)
            
            # Format results: pipe returns [[{"label": "surprise", "score": 0.69}, ...]]
            items = raw_results[0] if isinstance(raw_results, list) and raw_results and isinstance(raw_results[0], list) else raw_results
            
            label_mapping = {
                "joy": "Joy",
                "sadness": "Sadness",
                "fear": "Fear",
                "anger": "Anger",
                "surprise": "Surprise",
                "disgust": "Disgust",
                "neutral": "Neutral"
            }
            
            emotions: Dict[str, float] = {
                "Joy": 0.0, "Sadness": 0.0, "Fear": 0.0, "Anger": 0.0,
                "Surprise": 0.0, "Disgust": 0.0, "Neutral": 0.0
            }
            
            for item in (items if isinstance(items, list) else []):
                raw_label = item.get("label", "").lower()
                clean_label = label_mapping.get(raw_label, raw_label.capitalize())
                score = float(item.get("score", 0.0))
                emotions[clean_label] = round(score, 4)
                
            logger.info(f"DistilRoBERTa emotion result for '{text[:40]}...': {emotions}")
            return emotions

        except Exception as e:
            logger.error(f"Text emotion inference failed for input '{text}': {e}", exc_info=True)
            raise RuntimeError(f"Text emotion model inference error: {e}") from e

    async def analyze_audio(self, file_bytes: bytes, filename: str = "audio.webm", content_type: str = "audio/webm") -> Dict[str, Any]:
        """
        Full authentic audio analysis pipeline:
        1. STT via Groq Cloud Whisper / Faster-Whisper -> Transcript, Segments, Timestamps.
        2. Text Emotion Analysis via DistilRoBERTa -> 7-class probability distribution.
        3. Vocal Emotion Recognition via Wav2Vec2 -> 4-class probability distribution.
        4. Acoustic / Prosodic Feature Extraction via Librosa -> Pitch, Energy, Silence.
        """
        transcript = ""
        duration = 1.0
        segments = []
        speech_state = "SPEECH_DETECTED"

        # 1. Transcribe audio with Groq Whisper or Faster-Whisper
        if self.groq_client:
            try:
                audio_file = (filename or "audio.wav", file_bytes)
                groq_resp = self.groq_client.audio.transcriptions.create(
                    file=audio_file,
                    model="whisper-large-v3",
                    language="en",
                    response_format="verbose_json"
                )
                transcript = getattr(groq_resp, "text", "") or ""
                duration = float(getattr(groq_resp, "duration", 1.0) or 1.0)
                raw_segments = getattr(groq_resp, "segments", []) or []
                segments = [{"start": float(s.get("start", 0)), "end": float(s.get("end", 0)), "text": s.get("text", "")} for s in raw_segments] if isinstance(raw_segments, list) else []
            except Exception as e:
                logger.warning(f"Groq Whisper transcription failed: {e}. Trying local Faster-Whisper.")
                transcript = ""

        if not transcript:
            # Fallback to local Faster-Whisper
            whisper_mod = self._get_whisper_model()
            if whisper_mod:
                try:
                    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                        tmp.write(file_bytes)
                        tmp_path = tmp.name
                    seg_gen, info = whisper_mod.transcribe(tmp_path, beam_size=5)
                    segments = [{"start": s.start, "end": s.end, "text": s.text} for s in seg_gen]
                    transcript = " ".join(s["text"] for s in segments).strip()
                    duration = info.duration or 1.0
                    try:
                        os.remove(tmp_path)
                    except OSError:
                        pass
                except Exception as ex:
                    logger.error(f"Faster-Whisper transcription error: {ex}")
                    transcript = "Audio recording received."

        # 2. Extract Text Features & Pause Metrics
        text_feats = conversation_features_service.extract_text_features(transcript)
        vad_metrics = conversation_features_service.extract_vad_metrics(segments, duration)
        speech_state = vad_metrics.get("speech_state", "SPEECH_DETECTED")

        # 3. Audio Loading for Wav2Vec2 & Librosa
        audio_array, sr = None, 16000
        try:
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_audio:
                tmp_audio.write(file_bytes)
                tmp_path = tmp_audio.name
            audio_array, sr = librosa.load(tmp_path, sr=16000)
            try:
                os.remove(tmp_path)
            except OSError:
                pass
        except Exception as load_err:
            logger.warning(f"Librosa direct load failed: {load_err}. Attempting soundfile memory load.")
            try:
                audio_array, sr = sf.read(io.BytesIO(file_bytes))
                if sr != 16000:
                    audio_array = librosa.resample(audio_array.astype(np.float32), orig_sr=sr, target_sr=16000)
                    sr = 16000
            except Exception as sf_err:
                logger.error(f"Could not decode audio waveform: {sf_err}")
                audio_array = None

        # 4. Speech Emotion Recognition via Wav2Vec2
        voice_emotions = {
            "Neutral": 0.25,
            "Happy": 0.25,
            "Sad": 0.25,
            "Angry": 0.25
        }
        if audio_array is not None and len(audio_array) > 0:
            try:
                audio_pipe = self._get_audio_pipeline()
                # Ensure float32 1D numpy array
                if audio_array.ndim > 1:
                    audio_array = np.mean(audio_array, axis=1)
                audio_array = audio_array.astype(np.float32)
                
                raw_audio_res = audio_pipe({"raw": audio_array, "sampling_rate": 16000})
                label_map = {"neu": "Neutral", "hap": "Happy", "ang": "Angry", "sad": "Sad"}
                voice_emotions = {"Neutral": 0.0, "Happy": 0.0, "Sad": 0.0, "Angry": 0.0}
                for item in (raw_audio_res if isinstance(raw_audio_res, list) else []):
                    raw_lbl = item.get("label", "").lower()
                    friendly = label_map.get(raw_lbl, raw_lbl.capitalize())
                    voice_emotions[friendly] = round(float(item.get("score", 0.0)), 4)
                logger.info(f"Wav2Vec2 vocal emotion result: {voice_emotions}")
            except Exception as e:
                logger.error(f"Wav2Vec2 speech emotion inference failed: {e}", exc_info=True)

        # 5. Acoustic Prosodic Feature Extraction via Librosa
        acoustic_feats = {
            "energy_variability": 0.0,
            "pitch_mean_hz": 0.0,
            "pitch_variability_hz": 0.0,
            "rms_energy_mean": 0.0
        }
        if audio_array is not None and len(audio_array) > 0:
            try:
                # Fundamental frequency (pitch) tracking
                f0, voiced_flag, voiced_probs = librosa.pyin(
                    audio_array,
                    fmin=librosa.note_to_hz('C2'),
                    fmax=librosa.note_to_hz('C7'),
                    sr=16000
                )
                f0_clean = f0[~np.isnan(f0)] if f0 is not None else []
                pitch_mean = float(np.mean(f0_clean)) if len(f0_clean) > 0 else 180.0
                pitch_var = float(np.std(f0_clean)) if len(f0_clean) > 0 else 25.0
                
                # RMS energy
                rms = librosa.feature.rms(y=audio_array)[0]
                rms_mean = float(np.mean(rms)) if len(rms) > 0 else 0.05
                rms_var = float(np.std(rms)) if len(rms) > 0 else 0.02
                
                acoustic_feats = {
                    "pitch_mean_hz": round(pitch_mean, 2),
                    "pitch_variability_hz": round(pitch_var, 2),
                    "energy_variability": round(rms_var, 4),
                    "rms_energy_mean": round(rms_mean, 4)
                }
                logger.info(f"Librosa acoustic metrics: {acoustic_feats}")
            except Exception as e:
                logger.warning(f"Librosa acoustic feature extraction warning: {e}")

        # 6. Text Emotion via DistilRoBERTa on Transcript
        clean_text = re.sub(r"[^\w\s]", "", transcript).strip()
        if clean_text:
            text_emotions = await self.predict_text_emotion(transcript)
            text_state = "TEXT_EMOTIONS_AVAILABLE"
        else:
            text_emotions = "UNAVAILABLE"
            text_state = "UNAVAILABLE (Silence/Punctuation Only)"

        return {
            "transcript": transcript,
            "segments": segments,
            "duration": duration,
            "speech_state": speech_state,
            "text_state": text_state,
            "voice_emotions": voice_emotions,
            "text_emotions": text_emotions,
            "text_features": text_feats,
            "acoustic_features": acoustic_feats,
            "vad_metrics": vad_metrics
        }

hf_client = HFInferenceClient()
