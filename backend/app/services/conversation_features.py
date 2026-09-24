import os
import re
import logging

logger = logging.getLogger(__name__)

class ConversationFeaturesService:
    """
    Lightweight service to extract text-based disfluencies and VAD pause metrics.
    Pure Python implementation without heavy ML/Librosa dependencies.
    """
    def extract_text_features(self, transcript: str) -> dict:
        """
        Extracts disfluency counts (fillers, repetitions, uncertainty words) and token count.
        """
        # 1. Hesitation / filler markers
        fillers = re.findall(r"\b(um|umm|uh|hmm|ah|mm|mmm|mhm|mm-hmm)\b", transcript, re.IGNORECASE)
        filler_count = len(fillers)
        
        # 2. Repeated words/phrases
        repetitions = re.findall(r"\b(\w+)\s+\1\b", transcript, re.IGNORECASE)
        repetition_count = len(repetitions)
        
        # 3. Uncertainty phrases
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
                
        # 4. Token count
        tokens = transcript.split()
        token_count = len(tokens)
        
        return {
            "filler_count": filler_count,
            "fillers_found": fillers,
            "repetition_count": repetition_count,
            "repetitions_found": repetitions,
            "uncertainty_count": uncertainty_count,
            "uncertainties_found": list(set(detected_uncertainties)),
            "token_count": token_count
        }

    def extract_acoustic_features(self, acoustic_dict: dict = None) -> dict:
        """Pass-through for acoustic features calculated by Hugging Face service."""
        if acoustic_dict and isinstance(acoustic_dict, dict):
            return acoustic_dict
        return {
            "energy_variability": 0.0,
            "pitch_mean_hz": 0.0,
            "pitch_variability_hz": 0.0
        }

    def extract_vad_metrics(self, segment_list: list[dict], total_duration: float) -> dict:
        """Calculates conversational pause metrics from segment lists."""
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

conversation_features_service = ConversationFeaturesService()
