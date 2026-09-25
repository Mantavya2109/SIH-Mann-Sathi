import logging
from typing import Dict
from backend.app.services.hf_client import hf_client

logger = logging.getLogger(__name__)

class TextEmotionService:
    """
    Text emotion service using the Hugging Face DistilRoBERTa model.
    """
    async def predict_emotion_async(self, text: str) -> Dict[str, float]:
        return await hf_client.predict_text_emotion(text)

    def predict_emotion(self, text: str) -> Dict[str, float]:
        import asyncio
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                import concurrent.futures
                with concurrent.futures.ThreadPoolExecutor() as pool:
                    return pool.submit(asyncio.run, hf_client.predict_text_emotion(text)).result()
            else:
                return loop.run_until_complete(hf_client.predict_text_emotion(text))
        except Exception as e:
            logger.error(f"Text emotion prediction error: {e}", exc_info=True)
            raise

text_emotion_service = TextEmotionService()
