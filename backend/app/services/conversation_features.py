import os
import re
import numpy as np
import librosa
import logging

logger = logging.getLogger(__name__)

class ConversationFeaturesService:
    """
    Production service to extract text-based disfluencies and acoustic signal metrics.
    """
    def extract_text_features(self, transcript: str) -> dict:
        """
        Extracts disfluency counts (fillers, repetitions, uncertainty words) and token count.
        """
        # 1. Hesitation / filler markers (including mm, mmm, mhm, mm-hmm, um, umm, uh, hmm, ah)
        fillers = re.findall(r"\b(um|umm|uh|hmm|ah|mm|mmm|mhm|mm-hmm)\b", transcript, re.IGNORECASE)
        filler_count = len(fillers)
        
        # 2. Repeated words/phrases (stuttering/dysfluency)
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
                
        # 4. Token (word) count
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

    def extract_acoustic_features(self, file_path: str) -> dict:
        """
        Extracts pitch and energy parameters from the audio file using Librosa.
        """
        try:
            if not os.path.exists(file_path):
                raise FileNotFoundError(f"Audio file not found: {file_path}")
            
            y, sr = librosa.load(file_path, sr=None)
            if len(y) == 0:
                return {
                    "energy_variability": 0.0,
                    "pitch_mean_hz": 0.0,
                    "pitch_variability_hz": 0.0
                }
            
            # 1. Energy Analysis (RMS Variability)
            hop_length = 512
            rms = librosa.feature.rms(y=y, hop_length=hop_length)
            energy_var = float(np.std(rms[0])) if len(rms) > 0 and len(rms[0]) > 0 else 0.0
            
            # 2. Pitch Analysis (YIN Variability)
            fmin = 65.0
            fmax = 500.0
            try:
                f0 = librosa.yin(y, fmin=fmin, fmax=fmax, sr=sr, hop_length=hop_length)
                f0_valid = f0[f0 > fmin]
                pitch_var = float(np.std(f0_valid)) if len(f0_valid) > 0 else 0.0
                pitch_mean = float(np.mean(f0_valid)) if len(f0_valid) > 0 else 0.0
            except Exception:
                pitch_var = 0.0
                pitch_mean = 0.0
                
            return {
                "energy_variability": energy_var,
                "pitch_mean_hz": pitch_mean,
                "pitch_variability_hz": pitch_var
            }
        except Exception as e:
            logger.error(f"Acoustic features extraction failed for {file_path}: {e}")
            return {
                "energy_variability": 0.0,
                "pitch_mean_hz": 0.0,
                "pitch_variability_hz": 0.0
            }

    def extract_vad_metrics(self, segment_list: list[dict], total_duration: float) -> dict:
        """
        Calculates conversational pause metrics from VAD segment lists.
        
        Args:
            segment_list: List of segment dictionaries containing 'start' and 'end' keys.
            total_duration: Total audio duration in seconds.
            
        Returns:
            Dictionary containing speech presence flags, pause durations, and speech ratio.
        """
        vad_speech_duration = sum(s["end"] - s["start"] for s in segment_list)
        
        # Detect pauses (gaps between speech segments >= 0.5 seconds)
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
        vad_silence_duration = total_duration - vad_speech_duration
        
        vad_speech_to_silence_ratio = (
            vad_speech_duration / vad_silence_duration if vad_silence_duration > 0 else 100.0
        )
        
        # VAD active speech threshold check
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

# Singleton instance for application reuse
conversation_features_service = ConversationFeaturesService()
