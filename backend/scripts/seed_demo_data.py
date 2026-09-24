import os
import sys
import uuid
import random
from datetime import datetime, timedelta
from pathlib import Path

# Add project root to sys.path
project_root = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(project_root))

from backend.app.utils.supabase_client import supabase

def seed_data():
    print("=== STARTING DATABASE SEED ===")
    
    # 1. Fetch existing users to avoid duplicates
    try:
        users_list = supabase.auth.admin.list_users()
        auth_users = users_list if isinstance(users_list, list) else getattr(users_list, "users", [])
    except Exception as e:
        print("Error listing users from auth:", e)
        return
        
    user_email_map = {u.email.lower(): u for u in auth_users}
    
    # Define users to seed
    users_to_seed = [
        {"name": "Rohan", "email": "rohan@nirbhayamitra.com", "password": "Rohan@123", "role": "victim"},
        {"name": "Counsellor", "email": "counsellor@nirbhayamitra.com", "password": "Counsellor@123", "role": "counsellor"},
        {"name": "Aditi Sharma", "email": "aditi@nirbhayamitra.com", "password": "Aditi@123", "role": "victim"},
        {"name": "Priya Verma", "email": "priya@nirbhayamitra.com", "password": "Priya@123", "role": "victim"},
        {"name": "Neha Singh", "email": "neha@nirbhayamitra.com", "password": "Neha@123", "role": "victim"},
        {"name": "Ananya Patel", "email": "ananya@nirbhayamitra.com", "password": "Ananya@123", "role": "victim"},
        {"name": "Kavya Mehta", "email": "kavya@nirbhayamitra.com", "password": "Kavya@123", "role": "victim"},
        {"name": "Sneha Kapoor", "email": "sneha@nirbhayamitra.com", "password": "Sneha@123", "role": "victim"}
    ]
    
    user_ids = {}
    
    # Create Auth Users
    for user_info in users_to_seed:
        email = user_info["email"]
        role = user_info["role"]
        name = user_info["name"]
        password = user_info["password"]
        
        email_key = email.lower()
        if email_key in user_email_map:
            u = user_email_map[email_key]
            print(f"User {name} ({email}) already exists with ID: {u.id}")
            user_ids[name] = u.id
        else:
            try:
                res = supabase.auth.admin.create_user({
                    "email": email,
                    "password": password,
                    "email_confirm": True,
                    "user_metadata": {"role": role, "name": name}
                })
                u_id = res.user.id
                print(f"Created Auth User: {name} ({email}) -> ID: {u_id}")
                user_ids[name] = u_id
            except Exception as e:
                print(f"Failed to create user {name}: {e}")
                
    # 2. Seed Cases and Consents
    # We will only seed cases for victim roles
    victims = [u for u in users_to_seed if u["role"] == "victim"]
    
    for v in victims:
        name = v["name"]
        u_id = user_ids.get(name)
        if not u_id:
            continue
            
        # Check if case already exists
        case_res = supabase.table("cases").select("*").eq("id", u_id).execute()
        if case_res.data:
            print(f"Case already exists for {name} (Case ID: {u_id})")
        else:
            enrollment_date = (datetime.utcnow() - timedelta(days=5)).isoformat()
            try:
                # Insert Case
                supabase.table("cases").insert({
                    "id": u_id,
                    "nhaa_ref": f"DEMO-{name.upper().replace(' ', '-')}",
                    "enrollment_date": enrollment_date,
                    "stage": "active"
                }).execute()
                print(f"Created Case record for {name} -> Case ID: {u_id}")
                
                # Insert Consent
                supabase.table("consents").insert({
                    "case_id": u_id,
                    "checkin_consent": True,
                    "wearable_consent": False,
                    "consented_at": enrollment_date
                }).execute()
                print(f"Created Consent record for {name}")
            except Exception as e:
                print(f"Failed to create case/consent for {name}: {e}")
                
    # 3. Seed Check-ins, Distress Scores, and Alerts
    # Defining history datasets for each user
    histories = {
        "Rohan": [
            {"offset_days": 4, "score": 42.0, "channel": "text", "text": "I've been feeling a bit stressed recently but keeping up."},
            {"offset_days": 3, "score": 51.0, "channel": "voice", "text": "Work has been really demanding and I feel a bit overwhelmed."},
            {"offset_days": 2, "score": 64.0, "channel": "text", "text": "It's getting harder to sleep, feeling anxious."},
            {"offset_days": 1, "score": 72.0, "channel": "voice", "text": "I feel very anxious and unsafe, not sure what to do."}
        ],
        "Aditi Sharma": [
            {"offset_days": 4, "score": 30.0, "channel": "text", "text": "Just wanted to check in today."},
            {"offset_days": 3, "score": 45.0, "channel": "voice", "text": "Feeling a bit uneasy today."},
            {"offset_days": 2, "score": 62.0, "channel": "text", "text": "I got another threatening message, I'm scared."},
            {"offset_days": 1, "score": 85.0, "channel": "voice", "text": "I am extremely terrified. Someone is outside my house, please help."}
        ],
        "Priya Verma": [
            {"offset_days": 3, "score": 25.0, "channel": "text", "text": "Everything seems okay so far."},
            {"offset_days": 2, "score": 35.0, "channel": "text", "text": "Had a small argument, feeling slightly down."},
            {"offset_days": 1, "score": 48.0, "channel": "voice", "text": "Feeling lonely and a bit anxious tonight."}
        ],
        "Neha Singh": [
            {"offset_days": 3, "score": 15.0, "channel": "text", "text": "Doing great, thank you!"},
            {"offset_days": 2, "score": 12.0, "channel": "text", "text": "Had a good day at school."},
            {"offset_days": 1, "score": 18.0, "channel": "voice", "text": "Feeling tired but generally fine."}
        ],
        "Ananya Patel": [
            {"offset_days": 4, "score": 50.0, "channel": "text", "text": "Felt very uneasy in public transit today."},
            {"offset_days": 3, "score": 58.0, "channel": "text", "text": "I think I was followed home. I am anxious."},
            {"offset_days": 2, "score": 62.0, "channel": "voice", "text": "Cannot sleep at all, keep checking the locks."},
            {"offset_days": 1, "score": 70.0, "channel": "text", "text": "Extremely stressed, feeling very vulnerable."}
        ],
        "Kavya Mehta": [
            {"offset_days": 2, "score": 10.0, "channel": "text", "text": "Spent time with family, feeling peaceful."},
            {"offset_days": 1, "score": 12.0, "channel": "voice", "text": "All good here."}
        ],
        "Sneha Kapoor": [
            {"offset_days": 3, "score": 32.0, "channel": "text", "text": "A bit stressed about exams."},
            {"offset_days": 2, "score": 40.0, "channel": "voice", "text": "Feeling moderate pressure."},
            {"offset_days": 1, "score": 45.0, "channel": "text", "text": "Keeping things under control but anxious."}
        ]
    }
    
    for name, history in histories.items():
        case_id = user_ids.get(name)
        if not case_id:
            continue
            
        # Check if this case already has check_ins
        existing_checkins = supabase.table("check_ins").select("id").eq("case_id", case_id).execute()
        if existing_checkins.data:
            print(f"Skipping seeding history for {name} since check-ins already exist.")
            continue
            
        session_id = str(uuid.uuid4())
        print(f"Seeding history for {name} (Case ID: {case_id}, Session ID: {session_id})")
        
        # We will insert history sorted by offset_days descending (oldest first)
        history_sorted = sorted(history, key=lambda x: x["offset_days"], reverse=True)
        
        baseline_score = 0.0
        scores_inserted = []
        
        for idx, turn in enumerate(history_sorted):
            offset = turn["offset_days"]
            score = turn["score"]
            channel = turn["channel"]
            text = turn["text"]
            
            timestamp = (datetime.utcnow() - timedelta(days=offset)).isoformat()
            
            # Formulate JSONB columns
            text_emotions = {
                "fear": 0.82 if score > 60 else 0.20,
                "sadness": 0.60 if score > 50 else 0.30,
                "anger": 0.15,
                "joy": 0.02 if score > 50 else 0.40
            }
            
            distress_indicators = {
                "session_id": session_id,
                "text_emotions": text_emotions,
                "text_analysis_output": {
                    "sentiment_score": -0.72 if score > 60 else -0.10,
                    "emotion_category": "fear" if score > 60 else "neutral",
                    "emotion_intensity": "high" if score > 60 else "low",
                    "distress_indicators": ["feeling unsafe", "very anxious"] if score > 60 else [],
                    "text_emotions": text_emotions
                },
                "ai_response": "I hear you, please take deep breaths. I am here to help." if score > 60 else "Thank you for checking in. I am listening.",
                "follow_up_question": "Would you like me to connect you to a helpline?" if score > 75 else "How can I support you?",
                "safety_attention": True if score >= 85 else False,
                "conversation_state": "HIGH_DISTRESS" if score > 60 else "NORMAL"
            }
            
            voice_features = None
            if channel == "voice":
                voice_features = {
                    "voice_emotions": {
                        "Neutral": 0.10 if score > 60 else 0.70,
                        "Happy": 0.02 if score > 60 else 0.20,
                        "Sad": 0.62 if score > 60 else 0.05,
                        "Angry": 0.26 if score > 60 else 0.05
                    },
                    "conversational_features": {
                        "filler_count": 5 if score > 60 else 1,
                        "pause_count": 8 if score > 60 else 2,
                        "token_count": 35
                    },
                    "acoustic_features": {
                        "pitch_mean": 182.4 if score > 60 else 150.0,
                        "pitch_variance": 31.2 if score > 60 else 10.0,
                        "energy_mean": 0.41 if score > 60 else 0.25
                    }
                }
                
            checkin_id = str(uuid.uuid4())
            try:
                # Insert Check-in
                supabase.table("check_ins").insert({
                    "id": checkin_id,
                    "case_id": case_id,
                    "timestamp": timestamp,
                    "channel": channel,
                    "raw_text": text,
                    "language": "English",
                    "sentiment_score": abs(distress_indicators["text_analysis_output"]["sentiment_score"]),
                    "emotion": "fear" if score > 60 else "neutral",
                    "distress_indicators": distress_indicators,
                    "voice_features": voice_features
                }).execute()
            except Exception as e:
                print(f"Failed to insert check-in for {name} turn {idx}: {e}")
                
            # Calculate baseline deviation & trend
            deviation = 0.0
            if idx > 0:
                avg_prev = sum(scores_inserted) / len(scores_inserted)
                deviation = score - avg_prev
                
            if deviation > 10:
                trend = "rising"
            elif deviation < -10:
                trend = "falling"
            else:
                trend = "stable"
                
            scores_inserted.append(score)
            
            internal_analysis = {
                "speech_state": "SPEECH_DETECTED" if channel == "voice" else "NO_SPEECH_DETECTED",
                "text_state": "TEXT_EMOTIONS_AVAILABLE",
                "voice_emotions": voice_features["voice_emotions"] if voice_features else None,
                "text_emotions": text_emotions,
                "conversational_features": {
                    "filler_count": voice_features["conversational_features"]["filler_count"] if voice_features else 0,
                    "pause_duration": voice_features["conversational_features"]["pause_count"] * 0.5 if voice_features else 0.0,
                    "pitch_variability_hz": voice_features["acoustic_features"]["pitch_variance"] if voice_features else 0.0,
                } if voice_features else None,
                "fusion_metrics": {
                    "final_distress_score": score / 100.0,
                    "tier": "SEVERE" if score >= 80 else "HIGH" if score >= 60 else "MODERATE" if score >= 30 else "LOW"
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
            try:
                # Insert Distress Score
                supabase.table("distress_scores").insert({
                    "id": score_id,
                    "case_id": case_id,
                    "timestamp": timestamp,
                    "total_score": score,
                    "sub_scores": sub_scores,
                    "trend": trend,
                    "explanation_text": f"Score {score} vs baseline average {round(avg_prev, 2) if idx > 0 else score} ({trend})"
                }).execute()
            except Exception as e:
                print(f"Failed to insert distress score for {name} turn {idx}: {e}")
                
            # Create Alert if Severe or High (and it's the latest check-in)
            is_latest = (idx == len(history_sorted) - 1)
            if is_latest and (score >= 85.0 or (name == "Ananya Patel" and score >= 70.0)):
                alert_id = str(uuid.uuid4())
                rec_text = "Immediate crisis check-in. Safety protocols should be activated immediately." if score >= 85.0 else "Advise patient to avoid transit routes reported unsafe and contact local helpline."
                cited_provs = ["Section 375 of Bharatiya Nyaya Sanhita (BNS)", "Section 354 IPC"] if score >= 85.0 else ["Section 15A - Victim Protection"]
                
                try:
                    supabase.table("alerts").insert({
                        "id": alert_id,
                        "case_id": case_id,
                        "distress_score_id": score_id,
                        "created_at": timestamp,
                        "recommendation_text": rec_text,
                        "cited_provisions": cited_provs,
                        "status": "active"
                    }).execute()
                    print(f"Created ALERT for {name} (Risk: {'SEVERE' if score >= 85.0 else 'HIGH'})")
                except Exception as e:
                    print(f"Failed to insert alert for {name}: {e}")
                    
    print("=== SEEDING COMPLETED SUCCESSFULLY ===")

if __name__ == "__main__":
    seed_data()
