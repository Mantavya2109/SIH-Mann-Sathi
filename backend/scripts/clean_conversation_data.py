import os
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

# Add project root to sys.path
project_root = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(project_root))

from backend.app.utils.supabase_client import supabase

ROHAN_CASE_2_ID = "a0a0a0a0-b0b0-c0c0-d0d0-e0e0e0e0e0e0"

def clean_conversation_data():
    print("=== STARTING CONVERSATION DATA CLEANUP ===")

    # 1. Clean all conversation-derived history for ROHAN-CASE-2
    for table in ["alerts", "distress_scores", "check_ins"]:
        try:
            res = supabase.table(table).delete().eq("case_id", ROHAN_CASE_2_ID).execute()
            print(f"Cleared all records from {table} for ROHAN-CASE-2")
        except Exception as e:
            print(f"Error clearing {table} for ROHAN-CASE-2: {e}")


    # 2. Clean any TEST-* or Anonymous cases from database
    try:
        cases_res = supabase.table("cases").select("*").execute()
        for c in cases_res.data or []:
            cid = c.get("id")
            ref = (c.get("nhaa_ref") or "").upper()
            if ref.startswith("TEST") or ref.startswith("TEMP") or "ANONYMOUS" in ref:
                for table in ["alerts", "distress_scores", "check_ins", "consents"]:
                    try:
                        supabase.table(table).delete().eq("case_id", cid).execute()
                    except Exception:
                        pass
                try:
                    supabase.table("cases").delete().eq("id", cid).execute()
                    print(f"Removed test case {ref} ({cid})")
                except Exception as ex:
                    print(f"Failed to delete test case {cid}: {ex}")
    except Exception as e:
        print(f"Error cleaning test cases: {e}")

    # 3. Ensure ROHAN-CASE-2 is active and present in cases table
    now_utc = datetime.now(timezone.utc).isoformat()
    try:
        case_res = supabase.table("cases").select("*").eq("id", ROHAN_CASE_2_ID).execute()
        if not case_res.data:
            supabase.table("cases").insert({
                "id": ROHAN_CASE_2_ID,
                "nhaa_ref": "ROHAN-CASE-2",
                "enrollment_date": now_utc,
                "stage": "active"
            }).execute()
            print("Inserted permanent case ROHAN-CASE-2")
        else:
            supabase.table("cases").update({
                "stage": "active",
                "nhaa_ref": "ROHAN-CASE-2"
            }).eq("id", ROHAN_CASE_2_ID).execute()
            print("Verified permanent case ROHAN-CASE-2 is active")

        # Ensure Consent
        consent_res = supabase.table("consents").select("*").eq("case_id", ROHAN_CASE_2_ID).execute()
        if not consent_res.data:
            supabase.table("consents").insert({
                "case_id": ROHAN_CASE_2_ID,
                "checkin_consent": True,
                "wearable_consent": False,
                "consented_at": now_utc
            }).execute()
            print("Ensured consent for ROHAN-CASE-2")
    except Exception as e:
        print(f"Error verifying ROHAN-CASE-2 in cases: {e}")

    print("=== CLEANUP COMPLETED: ROHAN-CASE-2 is fresh and active with zero old turns ===")

clean_rohan_case_data = clean_conversation_data

if __name__ == "__main__":
    clean_conversation_data()

