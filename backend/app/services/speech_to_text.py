import os
import logging
from faster_whisper import WhisperModel

logger = logging.getLogger(__name__)

class SpeechToTextService:
    """
    Production speech-to-text service module utilizing faster-whisper.
    Loads model once lazily and caches it in memory.
    """
    def __init__(self, model_size: str = "base.en", device: str = "cpu", compute_type: str = "float32"):
        self.model_size = model_size
        self.device = device
        self.compute_type = compute_type
        self.model = None

    def _load_model(self):
        """Loads WhisperModel into memory if not already loaded."""
        if self.model is None:
            logger.info(f"Loading Whisper STT model: {self.model_size} ({self.device})")
            try:
                self.model = WhisperModel(self.model_size, device=self.device, compute_type=self.compute_type)
            except Exception as e:
                logger.error(f"Failed to load Whisper STT model: {e}")
                raise e

    def transcribe(self, file_path: str) -> dict:
        """
        Transcribes the audio file, enabling word timestamps, VAD filtering,
        and steering disfluency transcription via the initial prompt.
        
        Args:
            file_path: Path to the local WAV file.
            
        Returns:
            Dictionary containing:
                - transcript: Cleaned combined transcript string
                - segments: List of segment dictionaries containing start, end, and text
                - duration: Total duration of the audio in seconds
        """
        try:
            self._load_model()
            if not os.path.exists(file_path):
                raise FileNotFoundError(f"Audio file not found: {file_path}")
            
            segments, info = self.model.transcribe(
                file_path,
                beam_size=5,
                language="en",
                # Feed disfluencies into decoder's context window to prevent automatic omission
                initial_prompt="Umm, uh, basically, like, you know, uh, I think we should, um, proceed... hmm, ah.",
                word_timestamps=True,
                vad_filter=True
            )
            
            segment_list = []
            full_transcript = []
            for s in segments:
                segment_list.append({
                    "start": float(s.start),
                    "end": float(s.end),
                    "text": s.text
                })
                full_transcript.append(s.text)
                
            transcript_text = "".join(full_transcript).strip()
            
            return {
                "transcript": transcript_text,
                "segments": segment_list,
                "duration": float(info.duration)
            }
        except Exception as e:
            logger.error(f"Speech-to-text transcription failed for {file_path}: {e}")
            return {
                "transcript": "",
                "segments": [],
                "duration": 0.0
            }

# Singleton instance for application reuse
speech_to_text_service = SpeechToTextService()
