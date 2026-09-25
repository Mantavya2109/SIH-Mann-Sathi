import logging
from typing import Dict, Any
import asyncio
from backend.app.services.hf_client import hf_client

logger = logging.getLogger(__name__)

class SpeechToTextService:
    """
    Speech-to-text service module delegating to Faster-Whisper / Groq Whisper.
    """
    def transcribe(self, file_path_or_bytes) -> Dict[str, Any]:
        if isinstance(file_path_or_bytes, bytes):
            loop = asyncio.get_event_loop()
            if loop.is_running():
                import concurrent.futures
                with concurrent.futures.ThreadPoolExecutor() as pool:
                    res = pool.submit(asyncio.run, hf_client.analyze_audio(file_path_or_bytes)).result()
            else:
                res = loop.run_until_complete(hf_client.analyze_audio(file_path_or_bytes))
            return {
                "transcript": res.get("transcript", ""),
                "segments": res.get("segments", []),
                "duration": res.get("duration", 0.0)
            }
        elif isinstance(file_path_or_bytes, str):
            with open(file_path_or_bytes, "rb") as f:
                content = f.read()
            return self.transcribe(content)
        return {
            "transcript": "",
            "segments": [],
            "duration": 0.0
        }

speech_to_text_service = SpeechToTextService()
