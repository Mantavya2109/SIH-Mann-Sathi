import os
import torch
import librosa
import numpy as np
import logging
from transformers import AutoConfig, AutoModelForAudioClassification, AutoFeatureExtractor

logger = logging.getLogger(__name__)

class SpeechEmotionService:
    """
    Production-ready voice emotion service encapsulating Wav2Vec2.
    Loads models once lazily and caches them in memory.
    """
    def __init__(self, model_name: str = "superb/wav2vec2-base-superb-er"):
        self.model_name = model_name
        self.config = None
        self.extractor = None
        self.model = None

    def _load_model(self):
        """Loads Wav2Vec2 model into memory if not already loaded."""
        if self.model is None:
            logger.info(f"Loading Wav2Vec2 speech emotion model: {self.model_name}")
            try:
                self.config = AutoConfig.from_pretrained(self.model_name)
                self.extractor = AutoFeatureExtractor.from_pretrained(self.model_name)
                self.model = AutoModelForAudioClassification.from_pretrained(self.model_name)
                self.model.eval()
            except Exception as e:
                logger.error(f"Failed to load speech emotion model: {e}")
                raise e

    def predict_emotion(self, file_path: str) -> dict[str, float]:
        """
        Extracts raw emotion confidence scores from a local WAV file.
        Resamples input audio to 16 kHz.
        
        Args:
            file_path: Path to the local audio WAV file.
            
        Returns:
            Dictionary containing mapped emotion probabilities (Neutral, Happy, Sad, Angry).
        """
        try:
            self._load_model()
            if not os.path.exists(file_path):
                raise FileNotFoundError(f"Audio file not found: {file_path}")
            
            # Resample to 16 kHz as expected by Wav2Vec2
            y_speech, sr_speech = librosa.load(file_path, sr=16000)
            if len(y_speech) == 0:
                logger.warning(f"Empty audio file provided: {file_path}")
                return {"Neutral": 1.0, "Happy": 0.0, "Sad": 0.0, "Angry": 0.0}

            speech_inputs = self.extractor(y_speech, sampling_rate=16000, return_tensors="pt")
            with torch.no_grad():
                speech_outputs = self.model(**speech_inputs)
                speech_logits = speech_outputs.logits
                speech_probs = torch.softmax(speech_logits, dim=-1).squeeze().numpy()
                
            correct_labels = {0: "ang", 1: "hap", 2: "neu", 3: "sad"}
            voice_friendly_names = {"neu": "Neutral", "hap": "Happy", "ang": "Angry", "sad": "Sad"}
            voice_results = {}
            for idx, score in enumerate(speech_probs):
                raw_label = correct_labels.get(idx, f"LABEL_{idx}")
                friendly = voice_friendly_names.get(raw_label, raw_label.capitalize())
                voice_results[friendly] = float(score)
                
            return voice_results
        except Exception as e:
            logger.error(f"Speech emotion classification failed for {file_path}: {e}")
            # Safe default fallback
            return {"Neutral": 1.0, "Happy": 0.0, "Sad": 0.0, "Angry": 0.0}

# Singleton instance for application reuse
speech_emotion_service = SpeechEmotionService()
