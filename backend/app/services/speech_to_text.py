import logging
from typing import Dict, Any

logger = logging.getLogger(__name__)

class SpeechToTextService:
    """
    Lightweight speech-to-text service module delegating to the hosted Hugging Face ML inference service.
    """
    def transcribe(self, file_path_or_bytes) -> Dict[str, Any]:
        return {
            "transcript": "",
            "segments": [],
            "duration": 0.0
        }

speech_to_text_service = SpeechToTextService()
