import logging
from typing import Dict
import asyncio
from backend.app.services.hf_client import hf_client

logger = logging.getLogger(__name__)

class SpeechEmotionService:
    """
    Speech emotion service delegating to the Wav2Vec2 audio pipeline.
    """
    def predict_emotion(self, file_path_or_bytes) -> Dict[str, float]:
        """
        Returns speech emotion mapping.
        """
        # If passed raw bytes or path, analyze through hf_client
        if isinstance(file_path_or_bytes, bytes):
            loop = asyncio.get_event_loop()
            if loop.is_running():
                import concurrent.futures
                with concurrent.futures.ThreadPoolExecutor() as pool:
                    res = pool.submit(asyncio.run, hf_client.analyze_audio(file_path_or_bytes)).result()
            else:
                res = loop.run_until_complete(hf_client.analyze_audio(file_path_or_bytes))
            return res.get("voice_emotions", {"Neutral": 1.0, "Happy": 0.0, "Sad": 0.0, "Angry": 0.0})
        elif isinstance(file_path_or_bytes, str):
            with open(file_path_or_bytes, "rb") as f:
                content = f.read()
            return self.predict_emotion(content)
        return {"Neutral": 1.0, "Happy": 0.0, "Sad": 0.0, "Angry": 0.0}

speech_emotion_service = SpeechEmotionService()
