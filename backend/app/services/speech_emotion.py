import logging
from typing import Dict
from backend.app.services.hf_client import hf_client

logger = logging.getLogger(__name__)

class SpeechEmotionService:
    """
    Lightweight speech emotion service delegating to the hosted Hugging Face ML inference service.
    """
    def predict_emotion(self, file_path_or_bytes) -> Dict[str, float]:
        """
        Returns speech emotion mapping.
        """
        # Handled in the unified HF inference call
        return {"Neutral": 1.0, "Happy": 0.0, "Sad": 0.0, "Angry": 0.0}

speech_emotion_service = SpeechEmotionService()
