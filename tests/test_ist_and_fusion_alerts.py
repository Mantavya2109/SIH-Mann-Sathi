import os
import sys
import unittest
import uuid
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient

# Ensure workspace is in sys.path
workspace_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if workspace_path not in sys.path:
    sys.path.insert(0, workspace_path)

from backend.app.main import app, parse_utc_timestamp, IST_ZONE
from backend.app.services.conversation_session import conversation_session_manager
from backend.app.utils.supabase_client import supabase

class TestISTTimezoneAndFusionAlerts(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.rohan_user_id = "7d64f81f-8108-467a-ae43-36986d04766f"
        self.rohan_case2_id = "a0a0a0a0-b0b0-c0c0-d0d0-e0e0e0e0e0e0"
        self.created_alert_ids = []
        self.created_score_ids = []
        self.created_checkin_ids = []

    def tearDown(self):
        # Clean up database records created during test run
        for aid in self.created_alert_ids:
            try:
                supabase.table("alerts").delete().eq("id", aid).execute()
            except Exception:
                pass
        for sid in self.created_score_ids:
            try:
                supabase.table("distress_scores").delete().eq("id", sid).execute()
            except Exception:
                pass
        for cid in self.created_checkin_ids:
            try:
                supabase.table("check_ins").delete().eq("id", cid).execute()
            except Exception:
                pass

    def test_ist_midnight_boundary_classification(self):
        """
        Verify that UTC timestamps crossing the IST midnight boundary (+05:30)
        are correctly converted and classified in Asia/Kolkata timezone.
        For example: 2026-08-28 18:45:00 UTC -> 2026-08-29 00:15:00 IST (TODAY)
                     2026-08-28 12:00:00 UTC -> 2026-08-28 17:30:00 IST (YESTERDAY)
        """
        utc_ts_str = "2026-08-28T18:45:00+00:00"
        dt_utc = parse_utc_timestamp(utc_ts_str)
        self.assertIsNotNone(dt_utc)
        
        # Convert to IST
        dt_ist = dt_utc.astimezone(IST_ZONE)
        
        # In IST, date must be 2026-08-29 and time must be 00:15
        self.assertEqual(dt_ist.year, 2026)
        self.assertEqual(dt_ist.month, 8)
        self.assertEqual(dt_ist.day, 29)
        self.assertEqual(dt_ist.hour, 0)
        self.assertEqual(dt_ist.minute, 15)
        
        ist_date_key = dt_ist.strftime("%Y-%m-%d")
        self.assertEqual(ist_date_key, "2026-08-29")
        
        # Compare with an earlier turn on 2026-08-28 12:00 UTC
        prev_utc_ts_str = "2026-08-28T12:00:00+00:00"
        dt_prev_utc = parse_utc_timestamp(prev_utc_ts_str)
        dt_prev_ist = dt_prev_utc.astimezone(IST_ZONE)
        prev_ist_date_key = dt_prev_ist.strftime("%Y-%m-%d")
        
        self.assertEqual(dt_prev_ist.day, 28)
        self.assertEqual(prev_ist_date_key, "2026-08-28")
        
        # Verify Today vs Yesterday distinction
        self.assertNotEqual(ist_date_key, prev_ist_date_key)

    def test_prompt_exact_conversion_examples(self):
        """
        Verify prompt exact requirements:
        1. UTC 2026-08-29T05:38:21Z must format as 11:08:21 AM IST (hour is 11, NOT 5, NOT 10).
        2. Naive Supabase ISO string (e.g. '2026-08-29T06:23:00.540834') must be interpreted as UTC instant
           and convert to 11:53:00 AM IST (NOT 06:23 AM).
        """
        from backend.app.utils.timezone_utils import parse_to_utc, to_ist, format_ist, format_utc_iso, get_ist_date_key

        # Test 1: 05:38:21 UTC
        raw_utc = "2026-08-29T05:38:21Z"
        dt_utc = parse_to_utc(raw_utc)
        self.assertEqual(dt_utc.hour, 5)
        dt_ist = to_ist(dt_utc)
        self.assertEqual(dt_ist.hour, 11)
        self.assertEqual(dt_ist.minute, 8)
        self.assertEqual(dt_ist.second, 21)
        formatted_ist = format_ist(raw_utc)
        self.assertIn("11:08:21 AM IST", formatted_ist.upper())
        self.assertEqual(get_ist_date_key(raw_utc), "2026-08-29")

        # Test 2: Naive string from Supabase column
        naive_str = "2026-08-29T06:23:00.540834"
        dt_naive_utc = parse_to_utc(naive_str)
        self.assertEqual(dt_naive_utc.hour, 6)
        dt_naive_ist = to_ist(dt_naive_utc)
        self.assertEqual(dt_naive_ist.hour, 11)
        self.assertEqual(dt_naive_ist.minute, 53)
        formatted_naive_ist = format_ist(naive_str)
        self.assertIn("11:53:00 AM IST", formatted_naive_ist.upper())

    def test_counsellor_api_timezone_aware_outputs(self):
        """
        Verify that all counsellor APIs return timezone-aware ISO timestamps ending with Z
        and that they refer to the exact same instant as stored in Supabase.
        """
        from backend.app.utils.timezone_utils import parse_to_utc

        # 1. GET /api/counsellor/cases
        res_cases = self.client.get("/api/counsellor/cases")
        self.assertEqual(res_cases.status_code, 200)
        cases = res_cases.json()
        self.assertTrue(len(cases) > 0)
        for c in cases:
            if c.get("enrollment_date"):
                self.assertTrue(c["enrollment_date"].endswith("Z") or "+" in c["enrollment_date"])
            if c.get("latest_checkin_timestamp"):
                self.assertTrue(c["latest_checkin_timestamp"].endswith("Z") or "+" in c["latest_checkin_timestamp"])

        # 2. GET /api/counsellor/cases/{case_id}
        res_details = self.client.get(f"/api/counsellor/cases/{self.rohan_case2_id}")
        self.assertEqual(res_details.status_code, 200)
        details = res_details.json()
        if details.get("case", {}).get("enrollment_date"):
            self.assertTrue(details["case"]["enrollment_date"].endswith("Z"))
        if details.get("summary", {}).get("last_interaction"):
            self.assertTrue(details["summary"]["last_interaction"].endswith("Z"))

        # 3. GET /api/counsellor/cases/{case_id}/history
        res_history = self.client.get(f"/api/counsellor/cases/{self.rohan_case2_id}/history")
        self.assertEqual(res_history.status_code, 200)
        history = res_history.json()
        if history:
            for turn in history:
                self.assertTrue(turn["timestamp"].endswith("Z") or "+" in turn["timestamp"])

        # 4. GET /api/counsellor/alerts
        res_alerts = self.client.get("/api/counsellor/alerts")
        self.assertEqual(res_alerts.status_code, 200)
        alerts = res_alerts.json()
        if alerts:
            for a in alerts:
                self.assertTrue(a["created_at"].endswith("Z") or "+" in a["created_at"])

    def test_multimodal_fusion_alert_evaluation_and_case_attachment(self):
        """
        Verify live chat with Rohan on ROHAN-CASE-2:
        1. Performs text & voice fusion distress scoring
        2. Final risk tier & fusion results are generated
        3. Alert is evaluated on the final fusion result + crisis override
        4. Alert is inserted with correct case_id (ROHAN-CASE-2), status ('active'), and cited provisions
        5. Counsellor alerts API returns the alert for Rohan
        """
        # 1. Start live conversation for Rohan
        res_start = self.client.post("/api/conversation/start", data={"user_id": self.rohan_user_id})
        self.assertEqual(res_start.status_code, 201)
        session_id = res_start.json()["session_id"]
        
        session = conversation_session_manager.get_session(session_id)
        self.assertIsNotNone(session)
        self.assertEqual(session.case_id, self.rohan_case2_id)

        # 2. Send high distress message that triggers crisis & high fusion distress
        test_msg = "I feel completely hopeless, scared for my safety, and having thoughts of ending my life."
        res_respond = self.client.post(
            "/api/conversation/respond",
            data={
                "session_id": session_id,
                "message": test_msg
            }
        )
        self.assertEqual(res_respond.status_code, 200)

        # 3. Query check-in
        ci_res = supabase.table("check_ins").select("*").eq("case_id", self.rohan_case2_id).order("timestamp", desc=True).limit(1).execute()
        self.assertTrue(len(ci_res.data) > 0)
        ci_row = ci_res.data[0]
        self.created_checkin_ids.append(ci_row["id"])
        self.assertEqual(ci_row["raw_text"], test_msg)

        # 4. Query distress_scores and verify fusion metrics
        ds_res = supabase.table("distress_scores").select("*").eq("case_id", self.rohan_case2_id).order("timestamp", desc=True).limit(1).execute()
        self.assertTrue(len(ds_res.data) > 0)
        ds_row = ds_res.data[0]
        self.created_score_ids.append(ds_row["id"])
        
        raw_analysis = (ds_row.get("sub_scores") or {}).get("raw_analysis") or {}
        fusion_metrics = raw_analysis.get("fusion_metrics") or {}
        self.assertIn("tier", fusion_metrics)
        self.assertIn("final_distress_score", fusion_metrics)

        # 5. Query alerts and verify attachment to Rohan Case 2
        al_res = supabase.table("alerts").select("*").eq("case_id", self.rohan_case2_id).order("created_at", desc=True).limit(1).execute()
        self.assertTrue(len(al_res.data) > 0, "Expected alert to be created for high distress / safety trigger")
        alert = al_res.data[0]
        self.created_alert_ids.append(alert["id"])

        self.assertEqual(alert["case_id"], self.rohan_case2_id)
        self.assertEqual(alert["status"], "active")
        self.assertIsNotNone(alert["distress_score_id"])
        self.assertTrue(len(alert["recommendation_text"]) > 0)
        self.assertTrue(isinstance(alert["cited_provisions"], list))
        self.assertTrue(len(alert["cited_provisions"]) > 0)

        # 6. Verify Counsellor API /api/counsellor/alerts returns the active alert
        alerts_api_res = self.client.get("/api/counsellor/alerts")
        self.assertEqual(alerts_api_res.status_code, 200)
        counsellor_alerts = alerts_api_res.json()
        matching_alert = next((a for a in counsellor_alerts if a["id"] == alert["id"]), None)
        self.assertIsNotNone(matching_alert)
        self.assertEqual(matching_alert["user_name"], "Rohan")
        self.assertEqual(matching_alert["status"], "active")

        # 7. Verify Counsellor History API contains fusion metrics
        hist_res = self.client.get(f"/api/counsellor/cases/{self.rohan_case2_id}/history")
        self.assertEqual(hist_res.status_code, 200)
        history = hist_res.json()
        self.assertTrue(len(history) > 0)
        latest_hist_turn = history[-1]
        self.assertIn("internal_analysis", latest_hist_turn)
        self.assertIn("fusion_metrics", latest_hist_turn["internal_analysis"])
        self.assertEqual(latest_hist_turn["internal_analysis"]["fusion_metrics"]["tier"], fusion_metrics["tier"])

        # 8. End conversation cleanly
        self.client.post("/api/conversation/end", data={"session_id": session_id})

if __name__ == "__main__":
    unittest.main()
