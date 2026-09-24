import logging
from typing import Dict
from backend.app.services.hf_client import hf_client

logger = logging.getLogger(__name__)

class TextEmotionService:
    """
    Lightweight text emotion service delegating to the hosted Hugging Face ML inference service.
    """
    async def predict_emotion_async(self, text: str) -> Dict[str, float]:
        return await hf_client.predict_text_emotion(text)

    def predict_emotion(self, text: str) -> Dict[str, float]:
        # Synchronous fallback
        import asyncio
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                # If loop is already running, run in a worker thread
                import concurrent.futures
                with concurrent.futures.ThreadPoolExecutor() as pool:
                    return pool.submit(asyncio.run, hf_client.predict_text_emotion(text)).result()
            else:
                return loop.run_until_complete(hf_client.predict_text_emotion(text))
        except Exception as e:
            logger.warning(f"Fallback synchronous text emotion prediction error: {e}")
            return {
                "Joy": 0.0, "Sadness": 0.0, "Fear": 0.0, "Anger": 0.0,
                "Surprise": 0.0, "Disgust": 0.0, "Neutral": 1.0
            }

text_emotion_service = TextEmotionService()
