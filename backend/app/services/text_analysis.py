import os
import json
from pathlib import Path
from groq import Groq
from dotenv import load_dotenv

env_path = Path(__file__).resolve().parents[3] / ".env"


load_dotenv(dotenv_path=env_path)


client = Groq(api_key=os.getenv("GROQ_API_KEY"))

# models = client.models.list()
# for m in models.data:
#     print(m.id)
def analyze_text_signal(message: str) -> dict:
    if not message or not message.strip():
        return {
            "sentiment_score": 0.0,
            "emotion_category": "neutral",
            "emotion_intensity": "low",
            "distress_indicators": [],
            "language": "unknown",
            "note": "empty_input"
        }

    prompt = f"""Analyze this check-in message from someone who may be under
psychological distress. Respond ONLY with valid JSON in this exact format:
{{
  "sentiment_score": <float between -1.0 (very negative) and 1.0 (very positive)>,
  "emotion_category": "<one of exactly these: grief, fear, anxiety, anger,
    numbness, hopelessness, loneliness, shame, relief, hope, calm, gratitude, neutral>",
  "emotion_intensity": "<low, medium, or high>",
  "distress_indicators": ["<short phrase>", "<short phrase>"],
  "language": "<detected language name>"
}}

Message: "{message}" """

    model = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
    response = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        temperature=0
    )

    result = json.loads(response.choices[0].message.content)
    return result

if __name__ == "__main__":
    result = analyze_text_signal("kuch theek nahi lag raha, bas thak gaya hoon")
    print(result)