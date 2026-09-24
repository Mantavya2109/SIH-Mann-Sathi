import os
import sys
import uuid
from datetime import datetime, timedelta
from pathlib import Path

# Add project root to sys.path
project_root = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(project_root))

from backend.app.utils.supabase_client import supabase

def clean_and_seed():
    print("=== STARTING DATABASE CLEANUP & SEED ===")

    # 1. Fetch existing users to identify target accounts
    try:
        users_list = supabase.auth.admin.list_users()
        auth_users = users_list if isinstance(users_list, list) else getattr(users_list, "users", [])
    except Exception as e:
        print("Error listing users from auth:", e)
        return
        
    user_email_map = {u.email.lower(): u for u in auth_users}

    # Define target IDs
    rohan_user = user_email_map.get("rohan@nirbhayamitra.com")
    ananya_user = user_email_map.get("ananya@nirbhayamitra.com")
    counsellor_user = user_email_map.get("counsellor@nirbhayamitra.com")

    if not rohan_user or not ananya_user or not counsellor_user:
        print("Error: Essential users (Rohan, Ananya, Counsellor) not found in Auth!")
        return

    rohan_id = rohan_user.id
    ananya_id = ananya_user.id
    rohan_case2_id = "a0a0a0a0-b0b0-c0c0-d0d0-e0e0e0e0e0e0"

    allowed_case_ids = {rohan_id, rohan_case2_id, ananya_id}
    allowed_auth_ids = {rohan_id, ananya_id, counsellor_user.id}

    # Delete other auth users
    for u in auth_users:
        if u.id not in allowed_auth_ids:
            try:
                supabase.auth.admin.delete_user(u.id)
                print(f"Deleted obsolete auth user: {u.email} ({u.id})")
            except Exception as e:
                print(f"Failed to delete auth user {u.email}: {e}")

    # Delete records in dependent tables first, then consents, then cases
    # Alerts
    try:
        res = supabase.table("alerts").select("*").execute()
        for r in res.data or []:
            if r.get("case_id") not in allowed_case_ids:
                supabase.table("alerts").delete().eq("id", r["id"]).execute()
    except Exception as e:
        print(f"Failed to clean alerts: {e}")

    # Distress Scores
    try:
        res = supabase.table("distress_scores").select("*").execute()
        for r in res.data or []:
            if r.get("case_id") not in allowed_case_ids:
                supabase.table("distress_scores").delete().eq("id", r["id"]).execute()
    except Exception as e:
        print(f"Failed to clean distress_scores: {e}")

    # Checkins
    try:
        res = supabase.table("check_ins").select("*").execute()
        for r in res.data or []:
            if r.get("case_id") not in allowed_case_ids:
                supabase.table("check_ins").delete().eq("id", r["id"]).execute()
    except Exception as e:
        print(f"Failed to clean check_ins: {e}")

    # Consents
    try:
        res = supabase.table("consents").select("*").execute()
        for r in res.data or []:
            if r.get("case_id") not in allowed_case_ids:
                supabase.table("consents").delete().eq("case_id", r["case_id"]).execute()
    except Exception as e:
        print(f"Failed to clean consents: {e}")

    # Cases
    try:
        res = supabase.table("cases").select("*").execute()
        for r in res.data or []:
            if r.get("id") not in allowed_case_ids:
                supabase.table("cases").delete().eq("id", r["id"]).execute()
    except Exception as e:
        print(f"Failed to clean cases: {e}")

    # 2. Setup the target cases
    target_cases = [
        {"id": rohan_id, "nhaa_ref": "ROHAN-CASE-1", "enrollment_date": (datetime.utcnow() - timedelta(days=10)).isoformat(), "stage": "active"},
        {"id": rohan_case2_id, "nhaa_ref": "ROHAN-CASE-2", "enrollment_date": (datetime.utcnow() - timedelta(days=8)).isoformat(), "stage": "active"},
        {"id": ananya_id, "nhaa_ref": "ANANYA-CASE-1", "enrollment_date": (datetime.utcnow() - timedelta(days=5)).isoformat(), "stage": "active"}
    ]

    for tc in target_cases:
        try:
            res_case = supabase.table("cases").select("*").eq("id", tc["id"]).execute()
            if not res_case.data:
                supabase.table("cases").insert(tc).execute()
                print(f"Inserted case: {tc['nhaa_ref']} ({tc['id']})")
                # Insert Consent
                supabase.table("consents").insert({
                    "case_id": tc["id"],
                    "checkin_consent": True,
                    "wearable_consent": False,
                    "consented_at": tc["enrollment_date"]
                }).execute()
            else:
                # Update stage to active
                supabase.table("cases").update({"stage": "active", "nhaa_ref": tc["nhaa_ref"]}).eq("id", tc["id"]).execute()
                print(f"Ensured case active: {tc['nhaa_ref']} ({tc['id']})")
        except Exception as e:
            print(f"Failed to insert/update case {tc['nhaa_ref']}: {e}")

    # 3. Seed Case histories (leaving Rohan Case 1's real history intact, but adding baseline if missing)
    # We will clear and re-seed Rohan Case 2 and Ananya Case 1 history to be clean and predictable.
    for tc_id in [rohan_case2_id, ananya_id]:
        for table in ["alerts", "distress_scores", "check_ins"]:
            try:
                supabase.table(table).delete().eq("case_id", tc_id).execute()
            except Exception as e:
                print(f"Failed to clear check-ins/scores for case {tc_id} from {table}: {e}")

    # Seed Rohan Case 2
    session_r2 = str(uuid.uuid4())
    r2_history = [
        {"offset_days": 3, "score": 55.0, "channel": "text", "text": "I am trying to stay strong but everything feels heavy."},
        {"offset_days": 2, "score": 72.0, "channel": "voice", "text": "It's getting late and I can't calm down. I hear noises outside.", "voice": True},
        {"offset_days": 1, "score": 86.0, "channel": "text", "text": "I feel really anxious, please help me find safety.", "alert": True, "alert_rec": "Immediate counselor contact advised", "alert_prov": ["Section 15A Protection Order"]},
        {"offset_days": 0, "score": 40.0, "channel": "text", "text": "I talked to the representative and feel much better now."}
    ]

    # Seed Ananya Case 1
    session_a1 = str(uuid.uuid4())
    a1_history = [
        {"offset_days": 2, "score": 50.0, "channel": "text", "text": "I felt very uneasy in public transit today."},
        {"offset_days": 1, "score": 78.0, "channel": "text", "text": "I think I was followed home. I am anxious.", "alert": True, "alert_rec": "Advise patient to avoid transit routes and contact local helpline.", "alert_prov": ["Section 354 IPC"]},
        {"offset_days": 0, "score": 82.0, "channel": "voice", "text": "Cannot sleep at all, keep checking the locks.", "voice": True, "alert": True, "alert_rec": "Trigger immediate outreach per protection of civil rights relief provisions.", "alert_prov": ["Section 15A - Support and Relief"]}
    ]

    def insert_turn(case_id, session_id, turn, idx):
        offset = turn["offset_days"]
        score = turn["score"]
        channel = turn["channel"]
        text = turn["text"]
        
        timestamp = (datetime.utcnow() - timedelta(days=offset)).isoformat()
        
        text_emotions = {
            "fear": 0.88 if score > 70 else 0.40,
            "sadness": 0.70 if score > 50 else 0.30,
            "anger": 0.15,
            "joy": 0.01 if score > 50 else 0.30
        }
        
        distress_indicators = {
            "session_id": session_id,
            "text_emotions": text_emotions,
            "text_analysis_output": {
                "sentiment_score": -0.80 if score > 70 else -0.20,
                "emotion_category": "fear" if score > 70 else "neutral",
                "emotion_intensity": "high" if score > 70 else "medium",
                "distress_indicators": ["feeling unsafe", "anxious", "heavy"] if score > 50 else [],
                "text_emotions": text_emotions
            },
            "ai_response": "I hear you, please take deep breaths. I am here to support you." if score > 60 else "Thank you for checking in.",
            "follow_up_question": "Would you like me to connect you to a helpline?" if score > 75 else "How can I support you?",
            "safety_attention": True if score >= 85 else False,
            "conversation_state": "HIGH_DISTRESS" if score > 60 else "NORMAL"
        }
        
        voice_features = None
        if turn.get("voice"):
            voice_features = {
                "voice_emotions": {
                    "Neutral": 0.05 if score > 60 else 0.70,
                    "Happy": 0.01 if score > 60 else 0.20,
                    "Sad": 0.54 if score > 60 else 0.05,
                    "Angry": 0.40 if score > 60 else 0.05
                },
                "conversational_features": {
                    "filler_count": 6 if score > 60 else 1,
                    "pause_count": 9 if score > 60 else 2,
                    "token_count": 42
                },
                "acoustic_features": {
                    "pitch_mean": 195.2 if score > 60 else 145.0,
                    "pitch_variance": 42.1 if score > 60 else 8.0,
                    "energy_mean": 0.52 if score > 60 else 0.20
                }
            }
            
        checkin_id = str(uuid.uuid4())
        supabase.table("check_ins").insert({
            "id": checkin_id,
            "case_id": case_id,
            "timestamp": timestamp,
            "channel": channel,
            "raw_text": text,
            "language": "English",
            "sentiment_score": abs(distress_indicators["text_analysis_output"]["sentiment_score"]),
            "emotion": "fear" if score > 70 else "neutral",
            "distress_indicators": distress_indicators,
            "voice_features": voice_features
        }).execute()
        
        deviation = 0.0
        trend = "stable"
        
        internal_analysis = {
            "speech_state": "SPEECH_DETECTED" if turn.get("voice") else "NO_SPEECH_DETECTED",
            "text_state": "TEXT_EMOTIONS_AVAILABLE",
            "voice_emotions": voice_features["voice_emotions"] if voice_features else None,
            "text_emotions": text_emotions,
            "conversational_features": {
                "filler_count": voice_features["conversational_features"]["filler_count"] if voice_features else 0,
                "pause_duration": voice_features["conversational_features"]["pause_count"] * 0.5 if voice_features else 0.0,
                "pitch_mean_hz": voice_features["acoustic_features"]["pitch_mean"] if voice_features else 0.0,
                "pitch_variability_hz": voice_features["acoustic_features"]["pitch_variance"] if voice_features else 0.0,
            } if voice_features else None,
            "fusion_metrics": {
                "final_distress_score": score / 100.0,
                "tier": "SEVERE" if score >= 85 else "HIGH" if score >= 60 else "MODERATE" if score >= 30 else "LOW"
            },
            "conversation_state": "HIGH_DISTRESS" if score > 60 else "NORMAL",
            "safety_attention": True if score >= 85 else False,
            "text_analysis_output": distress_indicators["text_analysis_output"]
        }
        
        sub_scores = {
            "session_id": session_id,
            "raw_analysis": internal_analysis,
            "baseline_deviation": round(deviation, 2)
        }
        
        score_id = str(uuid.uuid4())
        supabase.table("distress_scores").insert({
            "id": score_id,
            "case_id": case_id,
            "timestamp": timestamp,
            "total_score": score,
            "sub_scores": sub_scores,
            "trend": trend,
            "explanation_text": f"Patient reports high anxiety. Fused score is {score}%."
        }).execute()
        
        if turn.get("alert"):
            alert_id = str(uuid.uuid4())
            supabase.table("alerts").insert({
                "id": alert_id,
                "case_id": case_id,
                "distress_score_id": score_id,
                "created_at": timestamp,
                "recommendation_text": turn["alert_rec"],
                "cited_provisions": turn["alert_prov"],
                "status": "active"
            }).execute()
            print(f"Seeded alert for case {case_id} on day offset {offset}")

    # Run inserts
    for idx, turn in enumerate(sorted(r2_history, key=lambda x: x["offset_days"], reverse=True)):
        insert_turn(rohan_case2_id, session_r2, turn, idx)
        
    for idx, turn in enumerate(sorted(a1_history, key=lambda x: x["offset_days"], reverse=True)):
        insert_turn(ananya_id, session_a1, turn, idx)

    print("=== DATABASE CLEANUP & SEED COMPLETED SUCCESSFULLY ===")

if __name__ == "__main__":
    clean_and_seed()
