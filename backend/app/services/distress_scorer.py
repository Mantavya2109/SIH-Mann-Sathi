import logging

logger = logging.getLogger(__name__)

def apply_distress_reduction_cap(previous_score: float | None, calculated_score: float, max_reduction_ratio: float = 0.08) -> float:
    """
    Enforces rate-limiting smoothing on decreasing distress scores.
    When distress is decreasing (calculated_score < previous_score),
    caps the reduction to at most `max_reduction_ratio` (default 8% / 0.08) of the previous score per update.
    When distress is increasing or equal, leaves the score completely unchanged.
    Handles both 0.0-1.0 and 0.0-100.0 scales seamlessly.
    """
    if previous_score is None:
        return calculated_score
    
    # Detect scale (0-1.0 vs 0-100.0)
    is_unit_scale = (float(calculated_score) <= 1.0 and float(previous_score) <= 1.0 and float(previous_score) > 0.0 and float(calculated_score) >= 0.0)
    
    prev_100 = float(previous_score) * 100.0 if is_unit_scale else float(previous_score)
    calc_100 = float(calculated_score) * 100.0 if is_unit_scale else float(calculated_score)
    
    if calc_100 < prev_100:
        max_allowed_drop = prev_100 * max_reduction_ratio
        min_allowed_score = prev_100 - max_allowed_drop
        final_100 = max(calc_100, min_allowed_score)
    else:
        final_100 = calc_100
        
    final_100 = max(0.0, min(100.0, final_100))
    
    if is_unit_scale:
        return round(final_100 / 100.0, 4)
    return round(final_100, 2)


def get_tier_for_score(score: float) -> str:
    """
    Maps a distress score (0.0-1.0 or 0-100) to its clinical risk tier.
    """
    s = score / 100.0 if score > 1.0 else score
    if s <= 0.25:
        return "LOW"
    elif s <= 0.50:
        return "MODERATE"
    elif s <= 0.75:
        return "HIGH"
    else:
        return "SEVERE"


class DistressScorerService:
    """
    Production-ready Multimodal Distress Scorer.
    Integrates multiple analysis modalities (Voice, Text, Acoustic, and VAD)
    using the validated non-linear max-pooling and bidirectional dissonance framework.
    """
    def __init__(self):
        self.weights = {
            "emotional_distress": 0.60,
            "dissonance": 0.40
        }
        self.conversational_boost_limit = 0.25
        self.conversational_weights = {
            "filler_weight": 0.20,
            "uncertainty_weight": 0.30,
            "pause_weight": 0.30,
            "ratio_weight": 0.20
        }

    def apply_reduction_cap(self, previous_score: float | None, calculated_score: float, max_reduction_ratio: float = 0.08) -> float:
        return apply_distress_reduction_cap(previous_score, calculated_score, max_reduction_ratio)

    def get_tier(self, score: float) -> str:
        return get_tier_for_score(score)

    def calculate_score(self, voice_emotions: dict | None, text_emotions: dict | str | None,
                        text_features: dict, acoustic_features: dict | None,
                        vad_metrics: dict | None, speech_state: str, voice_available: bool = True) -> dict:
        text_available = text_emotions is not None and text_emotions != "UNAVAILABLE"

        if not voice_available:
            if not text_available:
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
                    "text_available": False,
                    "voice_available": False
                }
            
            text_sad = text_emotions.get("Sadness", 0.0) if isinstance(text_emotions, dict) else 0.0
            text_fear = text_emotions.get("Fear", 0.0) if isinstance(text_emotions, dict) else 0.0
            text_angry = text_emotions.get("Anger", 0.0) if isinstance(text_emotions, dict) else 0.0
            d_text = text_sad + text_fear + text_angry
            
            filler_penalty = min(1.0, text_features.get("filler_count", 0) * 0.25)
            uncertainty_penalty = min(1.0, text_features.get("uncertainty_count", 0) * 0.33)
            s_conversational = 0.40 * filler_penalty + 0.60 * uncertainty_penalty
            
            d_base = d_text
            conversational_boost = 0.15 * s_conversational * (1.0 - d_base)
            d_final = d_base + conversational_boost
            d_final = max(0.0, min(1.0, d_final))
            
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
                "d_voice": "UNAVAILABLE",
                "d_text": round(d_text, 4),
                "s_emotional": round(d_text, 4),
                "diss_a": "UNAVAILABLE",
                "diss_b": "UNAVAILABLE",
                "s_dissonance": "UNAVAILABLE",
                "s_conversational": round(s_conversational, 4),
                "d_base": round(d_base, 4),
                "conversational_boost": round(conversational_boost, 4),
                "tier": tier,
                "text_available": True,
                "voice_available": False
            }

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
                "text_available": False,
                "voice_available": True
            }

        voice_sad = voice_emotions.get("Sad", 0.0) if voice_emotions else 0.0
        voice_angry = voice_emotions.get("Angry", 0.0) if voice_emotions else 0.0
        voice_happy = voice_emotions.get("Happy", 0.0) if voice_emotions else 0.0
        
        d_voice = voice_sad + voice_angry
        
        if text_available:
            text_sad = text_emotions.get("Sadness", 0.0) if isinstance(text_emotions, dict) else 0.0
            text_fear = text_emotions.get("Fear", 0.0) if isinstance(text_emotions, dict) else 0.0
            text_angry = text_emotions.get("Anger", 0.0) if isinstance(text_emotions, dict) else 0.0
            text_joy = text_emotions.get("Joy", 0.0) if isinstance(text_emotions, dict) else 0.0
            
            d_text = text_sad + text_fear + text_angry
        else:
            d_text = 0.0
            text_joy = 0.0
            
        if text_available:
            max_distress = max(d_voice, d_text)
            avg_distress = (d_voice + d_text) / 2.0
            s_emotional = 0.70 * max_distress + 0.30 * avg_distress
        else:
            s_emotional = d_voice
            
        if text_available:
            diss_a = text_joy * d_voice
            diss_b = d_text * voice_happy
            s_dissonance = max(diss_a, diss_b)
        else:
            diss_a = 0.0
            diss_b = 0.0
            s_dissonance = 0.0
            
        cw = self.conversational_weights
        
        filler_penalty = min(1.0, text_features.get("filler_count", 0) * 0.25)
        uncertainty_penalty = min(1.0, text_features.get("uncertainty_count", 0) * 0.33)
        
        total_dur = vad_metrics["total_duration"] if vad_metrics else 0.0
        pause_dur = vad_metrics["pause_duration"] if vad_metrics else 0.0
        pause_ratio = min(1.0, pause_dur / total_dur) if total_dur > 0 else 0.0
        
        ratio = vad_metrics["speech_silence_ratio"] if vad_metrics else 100.0
        ratio_penalty = max(0.0, 1.0 - (ratio / 1.5)) if ratio < 1.5 else 0.0
        
        s_conversational = (
            cw["filler_weight"] * filler_penalty +
            cw["uncertainty_weight"] * uncertainty_penalty +
            cw["pause_weight"] * pause_ratio +
            cw["ratio_weight"] * ratio_penalty
        )
        
        w = self.weights
        if text_available:
            d_base = w["emotional_distress"] * s_emotional + w["dissonance"] * s_dissonance
        else:
            d_base = s_emotional
            
        beta = self.conversational_boost_limit
        conversational_boost = beta * s_conversational * (1.0 - d_base)
        d_final = d_base + conversational_boost
        
        d_final = max(0.0, min(1.0, d_final))
        
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
            "text_available": text_available,
            "voice_available": True
        }

distress_scorer_service = DistressScorerService()