import os
import sys
import unittest
from fastapi.testclient import TestClient

# Ensure workspace is in sys.path
workspace_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if workspace_path not in sys.path:
    sys.path.insert(0, workspace_path)

from backend.app.main import app
from backend.app.utils.supabase_client import supabase
from backend.app.services.conversation_session import conversation_session_manager

class TestTurnByTurnIntegration(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.rohan_user_id = "7d64f81f-8108-467a-ae43-36986d04766f"
        self.rohan_case2_id = "a0a0a0a0-b0b0-c0c0-d0d0-e0e0e0e0e0e0"
        
        # Track inserted record IDs for clean-up
        self.check_in_ids = []
        self.distress_score_ids = []
        self.alert_ids = []

    def tearDown(self):
        # Clean up database records created during test run
        for aid in self.alert_ids:
            try:
                supabase.table("alerts").delete().eq("id", aid).execute()
            except Exception:
                pass
        for dsid in self.distress_score_ids:
            try:
                supabase.table("distress_scores").delete().eq("id", dsid).execute()
            except Exception:
                pass
        for ciid in self.check_in_ids:
            try:
                supabase.table("check_ins").delete().eq("id", ciid).execute()
            except Exception:
                pass

    def test_turn_by_turn_and_deactivation_safety(self):
        # 1. Start conversation (POST /api/conversation/start)
        res_start = self.client.post("/api/conversation/start", data={"user_id": self.rohan_user_id})
        self.assertEqual(res_start.status_code, 201)
        start_data = res_start.json()
        session_id = start_data["session_id"]
        
        # Verify resolved case ID inside session manager
        session = conversation_session_manager.get_session(session_id)
        self.assertIsNotNone(session)
        self.assertEqual(session.case_id, self.rohan_case2_id)

        # 2. Send ONE message (POST /api/conversation/respond)
        test_message = "I am feeling very depressed right now and I feel like suicide."
        res_respond = self.client.post(
            "/api/conversation/respond",
            data={
                "session_id": session_id,
                "message": test_message
            }
        )
        self.assertEqual(res_respond.status_code, 200)
        respond_data = res_respond.json()
        self.assertEqual(respond_data["transcript"], test_message)

        # 3. Query Supabase directly (check immediate persistence)
        # Checkins
        ci_res = supabase.table("check_ins") \
            .select("*") \
            .eq("case_id", self.rohan_case2_id) \
            .order("timestamp", desc=True) \
            .limit(1) \
            .execute()
        self.assertTrue(len(ci_res.data) > 0)
        ci_rec = ci_res.data[0]
        self.assertEqual(ci_rec["raw_text"], test_message)
        self.check_in_ids.append(ci_rec["id"])

        # Distress Scores
        ds_res = supabase.table("distress_scores") \
            .select("*") \
            .eq("case_id", self.rohan_case2_id) \
            .order("timestamp", desc=True) \
            .limit(1) \
            .execute()
        self.assertTrue(len(ds_res.data) > 0)
        ds_rec = ds_res.data[0]
        self.distress_score_ids.append(ds_rec["id"])
        
        # Alerts (crisis language should trigger alert >= 85 distress score)
        al_res = supabase.table("alerts") \
            .select("*") \
            .eq("case_id", self.rohan_case2_id) \
            .order("created_at", desc=True) \
            .limit(1) \
            .execute()
        self.assertTrue(len(al_res.data) > 0)
        al_rec = al_res.data[0]
        self.alert_ids.append(al_rec["id"])
        
        # 4. Call Counselor Cases API (GET /api/counsellor/cases)
        res_cases = self.client.get("/api/counsellor/cases")
        self.assertEqual(res_cases.status_code, 200)
        cases_list = res_cases.json()
        
        rohan_case2_obj = next((c for c in cases_list if c["case_id"] == self.rohan_case2_id), None)
        self.assertIsNotNone(rohan_case2_obj)
        # Score is formatted as integer percent on list endpoint
        self.assertEqual(rohan_case2_obj["latest_distress_score"], ds_rec["total_score"])
        self.assertEqual(rohan_case2_obj["priority_level"], "CRITICAL")

        # 5. Call Case Details API (GET /api/counsellor/cases/{case_id})
        res_details = self.client.get(f"/api/counsellor/cases/{self.rohan_case2_id}")
        self.assertEqual(res_details.status_code, 200)
        details_data = res_details.json()
        
        # Verify summary stats
        summary = details_data.get("summary", {})
        self.assertEqual(summary["current_distress_score"], ds_rec["total_score"] / 100.0)

        # Call Case History API (GET /api/counsellor/cases/{case_id}/history)
        res_history = self.client.get(f"/api/counsellor/cases/{self.rohan_case2_id}/history")
        self.assertEqual(res_history.status_code, 200)
        history = res_history.json()
        
        # Verify history contains new turn
        self.assertTrue(len(history) > 0)
        latest_turn = history[-1]
        self.assertEqual(latest_turn["transcript"], test_message)

        # 6. End session (POST /api/conversation/end)
        res_end = self.client.post("/api/conversation/end", data={"session_id": session_id})
        self.assertEqual(res_end.status_code, 200)

        # 7. Verify ending session keeps Rohan Case 2 active
        res_case = supabase.table("cases").select("stage").eq("id", self.rohan_case2_id).execute()
        self.assertEqual(res_case.data[0]["stage"], "active")

if __name__ == "__main__":
    unittest.main()
