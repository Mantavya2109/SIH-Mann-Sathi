def format_explanation(channel: str, checkin_result: dict, total_score: float, trend: str) -> str:
    """
    Generates a human-readable explanation for a distress score,
    based purely on the structured data already computed — no LLM call.
    """
    reasons = []

    if channel == "voice":
        fusion = checkin_result.get("fusion_metrics", {})
        voice_emotions = checkin_result.get("voice_emotions", {})
        text_emotions = checkin_result.get("text_emotions", {})
        conv = checkin_result.get("conversational_features", {})

        # Dominant voice emotion
        if voice_emotions:
            top_voice = max(voice_emotions, key=voice_emotions.get)
            top_voice_val = voice_emotions[top_voice]
            if top_voice != "Neutral" and top_voice_val > 0.5:
                reasons.append(f"voice tone registered {round(top_voice_val * 100)}% {top_voice}")

        # Dominant text emotion
        if isinstance(text_emotions, dict) and text_emotions:
            top_text = max(text_emotions, key=text_emotions.get)
            top_text_val = text_emotions[top_text]
            if top_text not in ("Neutral", "Joy") and top_text_val > 0.3:
                reasons.append(f"spoken words scored {round(top_text_val * 100)}% {top_text}")

        # Dissonance (mismatch between tone and words)
        dissonance = fusion.get("s_dissonance", 0.0)
        if isinstance(dissonance, float) and dissonance > 0.1:
            reasons.append("a mismatch was detected between vocal tone and word content")

        # Pause/silence pattern
        pause_ratio = conv.get("pause_duration", 0) / conv.get("total_duration", 1) if conv.get("total_duration") else 0
        if pause_ratio > 0.5:
            reasons.append(f"speech contained mostly silence ({round(pause_ratio * 100)}% pause ratio)")

        # Fillers/uncertainty
        if conv.get("uncertainty_count", 0) > 0:
            reasons.append(f"{conv['uncertainty_count']} uncertainty phrase(s) detected")

    else:  # text channel
        emotion_category = checkin_result.get("emotion_category", "neutral")
        emotion_intensity = checkin_result.get("emotion_intensity", "low")
        distress_indicators = checkin_result.get("distress_indicators", [])

        if emotion_category != "neutral":
            reasons.append(f"{emotion_intensity} intensity {emotion_category} detected")

        if distress_indicators:
            quoted = ", ".join(f"'{d}'" for d in distress_indicators)
            reasons.append(f"distress phrases identified: {quoted}")

    # Assemble final sentence
    if not reasons:
        base = f"No significant distress indicators found (score: {total_score}, {trend})."
    else:
        base = f"Flagged because: {'; '.join(reasons)}. Score: {total_score} ({trend})."

    return base


if __name__ == "__main__":
    test_voice_result = {
        "fusion_metrics": {"s_dissonance": 0.0135},
        "voice_emotions": {"Angry": 0.9985, "Happy": 0.0009, "Neutral": 0.0006, "Sad": 0.0},
        "text_emotions": {"Sadness": 0.6568, "Neutral": 0.1975, "Fear": 0.0705, "Anger": 0.018, "Disgust": 0.0346, "Joy": 0.0135, "Surprise": 0.009},
        "conversational_features": {"pause_duration": 3.4576, "total_duration": 4.4576, "uncertainty_count": 0}
    }
    print(format_explanation("voice", test_voice_result, 62.29, "rising"))

    test_text_result = {
        "emotion_category": "hopelessness",
        "emotion_intensity": "medium",
        "distress_indicators": ["haven't been sleeping well", "everything feels heavy"]
    }
    print(format_explanation("text", test_text_result, 65.0, "rising"))