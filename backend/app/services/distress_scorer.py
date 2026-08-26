import logging

logger = logging.getLogger(__name__)

class DistressScorerService:
    """
    Production-ready Multimodal Distress Scorer.
    Integrates multiple analysis modalities (Voice, Text, Acoustic, and VAD)
    using the validated non-linear max-pooling and bidirectional dissonance framework.
    """
    def __init__(self):
        # Weights combining fused emotional score (E) and dissonance (S_dissonance)
        self.weights = {
            "emotional_distress": 0.60,
            "dissonance": 0.40
        }
        # Maximum additive boost limit of conversational disfluency
        self.conversational_boost_limit = 0.25
        # Conversational sub-weights
        self.conversational_weights = {
            "filler_weight": 0.20,
            "uncertainty_weight": 0.30,
            "pause_weight": 0.30,
            "ratio_weight": 0.20
        }

    def calculate_score(self, voice_emotions: dict, text_emotions: dict | str | None,
                        text_features: dict, acoustic_features: dict,
                        vad_metrics: dict, speech_state: str) -> dict:
        """
        Calculates final multimodal distress index and assigns a risk tier.
        
        Args:
            voice_emotions: Dict of voice emotion probabilities (Neutral, Happy, Sad, Angry).
            text_emotions: Dict of text emotion probabilities or 'UNAVAILABLE'.
            text_features: Dict containing filler_count and uncertainty_count.
            acoustic_features: Dict containing pitch and energy parameters.
            vad_metrics: Dict containing total_duration and pause_duration.
            speech_state: String ('SPEECH_DETECTED' or 'NO_SPEECH_DETECTED').
            
        Returns:
            Dictionary containing intermediate metrics, final distress score, and risk tier.
        """
        # 1. Safely handle silence / empty audio
        if speech_state == "NO_SPEECH_DETECTED":
            return {
                "final_distress_score": "UNAVAILABLE",
                "d_voice": "UNAVAILABLE",
                "d_text": "UNAVAILABLE",
                "s_emotional": "UNAVAILABLE",
                "diss_a": "UNAVAILABLE",
                "diss_b": "UNAVAILABLE",
                "s_dissonance": "UNAVAILABLE",
                "s_conversational": "UNAVAILABLE",
                "d_base": "UNAVAILABLE",
                "conversational_boost": "UNAVAILABLE",
                "tier": "NOT_ASSESSED",
                "text_available": False
            }

        # 2. Extract Distress Channels
        voice_sad = voice_emotions.get("Sad", 0.0)
        voice_angry = voice_emotions.get("Angry", 0.0)
        voice_happy = voice_emotions.get("Happy", 0.0)
        
        d_voice = voice_sad + voice_angry
        
        text_available = text_emotions is not None and text_emotions != "UNAVAILABLE"
        
        if text_available:
            text_sad = text_emotions.get("Sadness", 0.0)
            text_fear = text_emotions.get("Fear", 0.0)
            text_angry = text_emotions.get("Anger", 0.0)
            text_joy = text_emotions.get("Joy", 0.0)
            
            d_text = text_sad + text_fear + text_angry
        else:
            d_text = 0.0
            text_joy = 0.0
            
        # 3. Emotional Distress (Non-Linear Max-Pool)
        if text_available:
            max_distress = max(d_voice, d_text)
            avg_distress = (d_voice + d_text) / 2.0
            # 70% maximum channel, 30% average channels
            s_emotional = 0.70 * max_distress + 0.30 * avg_distress
        else:
            # Voice-only distress fallback
            s_emotional = d_voice
            
        # 4. Bidirectional Dissonance
        if text_available:
            # Type A: Text positive + Voice negative (Emotional Masking)
            diss_a = text_joy * d_voice
            # Type B: Text negative + Voice positive (Hysteria or SER Pitch Bias)
            diss_b = d_text * voice_happy
            s_dissonance = max(diss_a, diss_b)
        else:
            diss_a = 0.0
            diss_b = 0.0
            s_dissonance = 0.0
            
        # 5. Conversational Distress Score (C)
        cw = self.conversational_weights
        
        filler_penalty = min(1.0, text_features.get("filler_count", 0) * 0.25)
        uncertainty_penalty = min(1.0, text_features.get("uncertainty_count", 0) * 0.33)
        
        total_dur = vad_metrics["total_duration"]
        pause_dur = vad_metrics["pause_duration"]
        pause_ratio = min(1.0, pause_dur / total_dur) if total_dur > 0 else 0.0
        
        ratio = vad_metrics["speech_silence_ratio"]
        ratio_penalty = max(0.0, 1.0 - (ratio / 1.5)) if ratio < 1.5 else 0.0
        
        s_conversational = (
            cw["filler_weight"] * filler_penalty +
            cw["uncertainty_weight"] * uncertainty_penalty +
            cw["pause_weight"] * pause_ratio +
            cw["ratio_weight"] * ratio_penalty
        )
        
        # 6. Base Score calculation
        w = self.weights
        if text_available:
            d_base = w["emotional_distress"] * s_emotional + w["dissonance"] * s_dissonance
        else:
            d_base = s_emotional
            
        # 7. Final Score with Conversational Boost
        beta = self.conversational_boost_limit
        conversational_boost = beta * s_conversational * (1.0 - d_base)
        d_final = d_base + conversational_boost
        
        # Scale verification
        d_final = max(0.0, min(1.0, d_final))
        
        # Risk Tier
        if d_final <= 0.25:
            tier = "LOW"
        elif d_final <= 0.50:
            tier = "MODERATE"
        elif d_final <= 0.75:
            tier = "HIGH"
        else:
            tier = "SEVERE"
            
        return {
            "final_distress_score": round(d_final, 4),
            "d_voice": round(d_voice, 4),
            "d_text": round(d_text, 4) if text_available else "UNAVAILABLE",
            "s_emotional": round(s_emotional, 4),
            "diss_a": round(diss_a, 4) if text_available else "UNAVAILABLE",
            "diss_b": round(diss_b, 4) if text_available else "UNAVAILABLE",
            "s_dissonance": round(s_dissonance, 4) if text_available else "UNAVAILABLE",
            "s_conversational": round(s_conversational, 4),
            "d_base": round(d_base, 4),
            "conversational_boost": round(conversational_boost, 4),
            "tier": tier,
            "text_available": text_available
        }

# Singleton instance for application reuse
distress_scorer_service = DistressScorerService()
