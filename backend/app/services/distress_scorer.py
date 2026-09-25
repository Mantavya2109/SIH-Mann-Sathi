import logging
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)

def apply_temporal_smoothing(
    previous_score: float | None,
    calculated_score: float,
    safety_attention: bool = False,
    max_downward_drop: float = 5.5,
    max_upward_step: float = 25.0
) -> float:
    """
    Applies clinical temporal smoothing to distress scores across conversation turns:
    1. If previous_score is None, return calculated_score directly.
    2. When distress is decreasing (calculated_score < previous_score):
       Caps the drop to approximately 5-6 percentage points (~5.5%) per turn to avoid
       abrupt artificial plunges from a single neutral/positive turn.
    3. When distress is increasing (calculated_score > previous_score):
       - If safety_attention is True (crisis/emergency/suicidal intent): allows immediate escalation.
       - In normal non-crisis turns: smoothly ramps up the score by allowing natural increases
         (up to 25.0 percentage points or 40% of delta) preventing unrealistic 6% -> 99% single-turn jumps.
    """
    if previous_score is None:
        return calculated_score
    
    # Detect scale (0.0-1.0 vs 0.0-100.0)
    is_unit_scale = (float(calculated_score) <= 1.0 and float(previous_score) <= 1.0 and float(previous_score) >= 0.0 and float(calculated_score) >= 0.0)
    
    prev_100 = float(previous_score) * 100.0 if is_unit_scale else float(previous_score)
    calc_100 = float(calculated_score) * 100.0 if is_unit_scale else float(calculated_score)
    
    if calc_100 < prev_100:
        # Cap downward reduction to approximately 5.5 percentage points
        min_allowed_score = prev_100 - max_downward_drop
        final_100 = max(calc_100, min_allowed_score)
    elif calc_100 > prev_100:
        if safety_attention:
            final_100 = calc_100
        else:
            allowed_jump = max(max_upward_step, (calc_100 - prev_100) * 0.40)
            max_allowed_score = prev_100 + allowed_jump
            final_100 = min(calc_100, max_allowed_score)
    else:
        final_100 = calc_100
        
    final_100 = max(0.0, min(100.0, final_100))
    
    if is_unit_scale:
        return round(final_100 / 100.0, 4)
    return round(final_100, 2)


def apply_distress_reduction_cap(previous_score: float | None, calculated_score: float, max_reduction_ratio: float = 0.08) -> float:
    """Alias for backwards compatibility with existing callers, using calibrated temporal smoothing."""
    return apply_temporal_smoothing(previous_score, calculated_score, safety_attention=False, max_downward_drop=5.5)


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
        return apply_temporal_smoothing(previous_score, calculated_score, max_downward_drop=5.5)

    def apply_smoothing(self, previous_score: float | None, calculated_score: float, safety_attention: bool = False) -> float:
        return apply_temporal_smoothing(previous_score, calculated_score, safety_attention=safety_attention)

    def get_tier(self, score: float) -> str:
        return get_tier_for_score(score)

    def calculate_score(
        self,
        voice_emotions: dict | None,
        text_emotions: dict | str | None,
        text_features: dict,
        acoustic_features: dict | None,
        vad_metrics: dict | None,
        speech_state: str,
        voice_available: bool = True,
        biosignal_data: Optional[dict] = None,
        biosignal_available: bool = False
    ) -> dict:
        text_available = text_emotions is not None and text_emotions != "UNAVAILABLE"

        # Calculate text distress component (d_text)
        d_text = 0.0
        text_joy = 0.0
        if text_available:
            text_sad = text_emotions.get("Sadness", 0.0) if isinstance(text_emotions, dict) else 0.0
            text_fear = text_emotions.get("Fear", 0.0) if isinstance(text_emotions, dict) else 0.0
            text_angry = text_emotions.get("Anger", 0.0) if isinstance(text_emotions, dict) else 0.0
            text_disgust = text_emotions.get("Disgust", 0.0) if isinstance(text_emotions, dict) else 0.0
            text_surprise = text_emotions.get("Surprise", 0.0) if isinstance(text_emotions, dict) else 0.0
            text_joy = text_emotions.get("Joy", 0.0) if isinstance(text_emotions, dict) else 0.0
            
            d_text_emotions = text_sad + text_fear + text_angry + (text_disgust * 0.5) + (text_surprise * 0.35)

            # Incorporate sentiment and text_analysis_output
            text_ao = text_features.get("text_analysis_output") or {}
            if not text_ao and isinstance(text_emotions, dict) and "text_analysis_output" in text_emotions:
                text_ao = text_emotions["text_analysis_output"]
            
            sentiment_val = text_ao.get("sentiment_score") if isinstance(text_ao, dict) else None
            intensity = str(text_ao.get("emotion_intensity", "medium")).lower() if isinstance(text_ao, dict) else "medium"
            intensity_weight = 1.0 if intensity == "high" else 0.70 if intensity == "medium" else 0.45

            if sentiment_val is not None:
                # Negative sentiment maps to distress: -1.0 -> 1.0, 0.0 -> 0.0, 1.0 -> 0.0
                sentiment_distress = max(0.0, -float(sentiment_val))
                calibrated_emotion_distress = d_text_emotions * intensity_weight
                d_text = max(sentiment_distress, calibrated_emotion_distress)
            else:
                d_text = d_text_emotions * intensity_weight
            d_text = max(0.0, min(1.0, d_text))

        # Calculate voice distress component (d_voice)
        d_voice = 0.0
        voice_happy = 0.0
        if voice_available and bool(voice_emotions):
            voice_sad = voice_emotions.get("Sad", 0.0) or voice_emotions.get("sadness", 0.0) or 0.0
            voice_angry = voice_emotions.get("Angry", 0.0) or voice_emotions.get("anger", 0.0) or 0.0
            voice_fear = voice_emotions.get("Fear", 0.0) or voice_emotions.get("fear", 0.0) or 0.0
            voice_happy = voice_emotions.get("Happy", 0.0) or voice_emotions.get("joy", 0.0) or 0.0
            d_voice = max(0.0, min(1.0, float(voice_sad) + float(voice_angry) + float(voice_fear)))
        else:
            voice_available = False

        # Calculate biosignal distress component (d_bio)
        d_bio = None
        if biosignal_available and biosignal_data:
            bio_distress_factors = []
            
            # Heart rate factor
            hr_val = biosignal_data.get("heart_rate")
            if isinstance(hr_val, dict):
                avg_bpm = hr_val.get("average_bpm") or hr_val.get("resting_bpm")
            else:
                avg_bpm = hr_val or biosignal_data.get("heart_rate_bpm")
            if avg_bpm is not None:
                # Baseline is ~70 BPM, >90 is elevated, >110 is high stress
                hr_factor = min(1.0, max(0.0, (float(avg_bpm) - 65.0) / 45.0))
                bio_distress_factors.append(hr_factor)

            # HRV (Heart Rate Variability) factor - lower HRV indicates higher sympathetic stress
            hrv_val = biosignal_data.get("hrv_ms") or biosignal_data.get("hrv")
            if isinstance(hrv_val, dict):
                hrv_val = hrv_val.get("value") or hrv_val.get("rmssd")
            if hrv_val is not None:
                # Normal HRV ~50-80ms, <30ms indicates acute stress
                hrv_factor = min(1.0, max(0.0, (60.0 - float(hrv_val)) / 40.0))
                bio_distress_factors.append(hrv_factor)

            # Skin Conductance / EDA factor
            gsr_val = biosignal_data.get("skin_conductance")
            if isinstance(gsr_val, dict):
                peak_us = gsr_val.get("peak_us") or gsr_val.get("average_us")
            else:
                peak_us = gsr_val or biosignal_data.get("skin_conductance_us")
            if peak_us is not None:
                # Baseline ~2.0 µS, >4.5 µS elevated
                gsr_factor = min(1.0, max(0.0, (float(peak_us) - 2.0) / 3.5))
                bio_distress_factors.append(gsr_factor)

            # Sleep factor
            sleep_val = biosignal_data.get("sleep") or biosignal_data.get("sleep_duration")
            if isinstance(sleep_val, dict):
                duration_mins = sleep_val.get("duration_minutes")
                disturbances = sleep_val.get("disturbances", 0)
            else:
                # If hours provided (e.g. 4.0), convert to mins
                duration_mins = float(sleep_val) * 60.0 if sleep_val is not None and float(sleep_val) <= 24.0 else sleep_val
                disturbances = biosignal_data.get("sleep_disturbances", 0)
            if duration_mins is not None:
                # Ideal is 480 mins (8h), <360 mins (6h) is poor sleep
                sleep_dur_factor = min(1.0, max(0.0, (480.0 - float(duration_mins)) / 180.0))
                sleep_dist_factor = min(1.0, float(disturbances) * 0.25)
                bio_distress_factors.append(0.6 * sleep_dur_factor + 0.4 * sleep_dist_factor)

            # SpO2 factor
            spo2_val = biosignal_data.get("blood_oxygen") or biosignal_data.get("spo2")
            if isinstance(spo2_val, dict):
                spo2_val = spo2_val.get("average_spo2")
            if spo2_val is not None and float(spo2_val) < 95.0:
                spo2_factor = min(1.0, (95.0 - float(spo2_val)) / 10.0)
                bio_distress_factors.append(spo2_factor)

            if bio_distress_factors:
                d_bio = max(0.0, min(1.0, sum(bio_distress_factors) / len(bio_distress_factors)))
            else:
                biosignal_available = False

        if not text_available and not voice_available and not biosignal_available:
            return {
                "final_distress_score": "UNAVAILABLE",
                "d_voice": "UNAVAILABLE",
                "d_text": "UNAVAILABLE",
                "d_biosignal": "UNAVAILABLE",
                "s_emotional": "UNAVAILABLE",
                "diss_a": "UNAVAILABLE",
                "diss_b": "UNAVAILABLE",
                "s_dissonance": "UNAVAILABLE",
                "s_conversational": "UNAVAILABLE",
                "d_base": "UNAVAILABLE",
                "conversational_boost": "UNAVAILABLE",
                "tier": "NOT_ASSESSED",
                "text_available": False,
                "voice_available": False,
                "biosignal_available": False
            }

        # Conversational features calculation
        cw = self.conversational_weights
        filler_penalty = min(1.0, text_features.get("filler_count", 0) * 0.25)
        uncertainty_penalty = min(1.0, text_features.get("uncertainty_count", 0) * 0.33)

        if voice_available and vad_metrics:
            total_dur = vad_metrics.get("total_duration", 0.0)
            pause_dur = vad_metrics.get("pause_duration", 0.0)
            pause_ratio = min(1.0, pause_dur / total_dur) if total_dur > 0 else 0.0
            ratio = vad_metrics.get("speech_silence_ratio", 100.0)
            ratio_penalty = max(0.0, 1.0 - (ratio / 1.5)) if ratio < 1.5 else 0.0
            s_conversational = (
                cw["filler_weight"] * filler_penalty +
                cw["uncertainty_weight"] * uncertainty_penalty +
                cw["pause_weight"] * pause_ratio +
                cw["ratio_weight"] * ratio_penalty
            )
        else:
            s_conversational = 0.40 * filler_penalty + 0.60 * uncertainty_penalty

        # Emotional dissonance between text and voice
        if text_available and voice_available:
            max_distress = max(d_voice, d_text)
            avg_distress = (d_voice + d_text) / 2.0
            s_emotional = 0.70 * max_distress + 0.30 * avg_distress
            diss_a = text_joy * d_voice
            diss_b = d_text * voice_happy
            s_dissonance = max(diss_a, diss_b)
        elif voice_available:
            s_emotional = d_voice
            s_dissonance = 0.0
            diss_a = 0.0
            diss_b = 0.0
        else:
            s_emotional = d_text
            s_dissonance = 0.0
            diss_a = 0.0
            diss_b = 0.0

        # Multimodal fusion combination
        if text_available and voice_available and biosignal_available and d_bio is not None:
            # Tri-modal Fusion: Text + Voice + Biosignal
            w_conv = 0.45 * s_emotional + 0.25 * s_dissonance
            d_base = 0.70 * w_conv + 0.30 * d_bio
        elif text_available and voice_available:
            # Bi-modal Fusion: Text + Voice
            d_base = self.weights["emotional_distress"] * s_emotional + self.weights["dissonance"] * s_dissonance
        elif text_available and biosignal_available and d_bio is not None:
            # Bi-modal Fusion: Text + Biosignal
            d_base = 0.65 * d_text + 0.35 * d_bio
        elif voice_available and biosignal_available and d_bio is not None:
            # Bi-modal Fusion: Voice + Biosignal
            d_base = 0.65 * d_voice + 0.35 * d_bio
        elif biosignal_available and d_bio is not None:
            # Biosignal only
            d_base = d_bio
        elif voice_available:
            # Voice only
            d_base = s_emotional
        else:
            # Text only
            d_base = d_text

        # Conversational boost
        beta = self.conversational_boost_limit
        conversational_boost = beta * s_conversational * (1.0 - d_base)
        d_final = d_base + conversational_boost
        d_final = max(0.0, min(1.0, d_final))

        tier = self.get_tier(d_final)

        return {
            "final_distress_score": round(d_final, 4),
            "d_voice": round(d_voice, 4) if voice_available else "UNAVAILABLE",
            "d_text": round(d_text, 4) if text_available else "UNAVAILABLE",
            "d_biosignal": round(d_bio, 4) if (biosignal_available and d_bio is not None) else "UNAVAILABLE",
            "s_emotional": round(s_emotional, 4),
            "diss_a": round(diss_a, 4) if (text_available and voice_available) else "UNAVAILABLE",
            "diss_b": round(diss_b, 4) if (text_available and voice_available) else "UNAVAILABLE",
            "s_dissonance": round(s_dissonance, 4) if (text_available and voice_available) else "UNAVAILABLE",
            "s_conversational": round(s_conversational, 4),
            "d_base": round(d_base, 4),
            "conversational_boost": round(conversational_boost, 4),
            "tier": tier,
            "risk_tier": tier,
            "text_available": text_available,
            "voice_available": voice_available,
            "biosignal_available": (biosignal_available and d_bio is not None)
        }

distress_scorer_service = DistressScorerService()