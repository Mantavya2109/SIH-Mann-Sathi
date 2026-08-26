import os
import requests
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client
from text_analysis import analyze_text_signal

load_dotenv(dotenv_path=Path(__file__).resolve().parents[2] / ".env")
supabase = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))

VOICE_ANALYSIS_URL = "http://127.0.0.1:8000/api/analyze"


def get_case_baseline(case_id: str) -> dict:
    """Pull the case's first 2-3 check-ins to establish a personal baseline."""
    response = supabase.table("distress_scores") \
        .select("total_score") \
        .eq("case_id", case_id) \
        .order("timestamp") \
        .limit(3) \
        .execute()

    if not response.data:
        return {"avg_score": 0.0}

    scores = [row["total_score"] for row in response.data if row["total_score"] is not None]
    avg = sum(scores) / len(scores) if scores else 0.0
    return {"avg_score": avg}  # already 0-100 scale — no change needed here


def analyze_voice_checkin(audio_file_path: str) -> dict:
    """Sends an audio file to Monty's /api/analyze endpoint and returns the raw response."""
    with open(audio_file_path, "rb") as f:
        files = {"file": (os.path.basename(audio_file_path), f, "audio/wav")}
        response = requests.post(VOICE_ANALYSIS_URL, files=files)
        response.raise_for_status()
        return response.json()


def fuse_signals(case_id: str, channel: str, checkin_result: dict) -> dict:
    if channel == "voice":
        fusion = checkin_result.get("fusion_metrics", {})
        raw_score = fusion.get("final_distress_score", 0.0)
        if raw_score == "UNAVAILABLE":
            raw_score = 0.0
        safety_flag = False
    else:
        raw_score = abs(checkin_result.get("sentiment_score", 0.0))
        safety_flag = False

    total_score = round(raw_score * 100, 2)

    baseline = get_case_baseline(case_id)
    deviation = total_score - baseline["avg_score"]

    if deviation > 10:
        trend = "rising"
    elif deviation < -10:
        trend = "falling"
    else:
        trend = "stable"

    explanation_text = f"Score {total_score} vs baseline {round(baseline['avg_score'], 2)} ({trend})"

    result = {
        "total_score": total_score,
        "sub_scores": {
            "raw_analysis": checkin_result,
            "baseline_deviation": round(deviation, 2)
        },
        "trend": trend,
        "safety_flag": safety_flag
    }

    # Persist to Supabase
    insert_response = supabase.table("distress_scores").insert({
        "case_id": case_id,
        "total_score": total_score,
        "sub_scores": result["sub_scores"],
        "trend": trend,
        "explanation_text": explanation_text
    }).execute()

    result["db_row_id"] = insert_response.data[0]["id"] if insert_response.data else None

    return result

if __name__ == "__main__":
    audio_result = analyze_voice_checkin(r"C:\Users\VICTUS\Downloads\Recording.m4a")
    print("Raw voice analysis:")
    print(audio_result)
    print()

    fused = fuse_signals("ff9fcee2-8373-4b1e-baf5-617b93425014", "voice", audio_result)
    print("Fused result:")
    print(fused)
    print()

    text_result = analyze_text_signal("I haven't been sleeping well, everything feels heavy lately.")
    print("Text analysis result:")
    print(text_result)
    print()

    fused_text = fuse_signals("11111111-1111-1111-1111-111111111111", "text", text_result)
    print("Fused text result:")
    print(fused_text)