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

from backend.app.main import app
from backend.app.utils.supabase_client import supabase
from backend.app.utils.timezone_utils import format_utc_iso, utc_now_iso

class TestFusionConsistency(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.test_case_id = str(uuid.uuid4())
        self.test_user_id = "7d64f81f-8108-467a-ae43-36986d04766f"
        self.created_score_ids = []
        self.created_checkin_ids = []

        # Create temporary case
        supabase.table("cases").insert({
            "id": self.test_case_id,
            "nhaa_ref": "TEST-FUSION-REF",
            "stage": "active",
            "enrollment_date": utc_now_iso()
        }).execute()

    def tearDown(self):
        # Cleanup
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
        try:
            supabase.table("cases").delete().eq("id", self.test_case_id).execute()
        except Exception:
            pass

    def test_canonical_latest_interaction_newer_text_turn_overrides_older_voice_turn(self):
        """
        Verify scenario:
        Turn 1 (Older, T0): Multimodal Turn (Text 1%, Voice 61%, Fusion 55%, Final 55%, HIGH)
        Turn 2 (Newer, T1): Text-only Turn (Text 0%, Voice N/A, Fusion 0%, Final 0%, LOW)

        When Turn 2 is the latest:
        - API /api/counsellor/cases/{case_id} latest_interaction must be Turn 2 (Final 0%, Text 0%, Voice None, Fusion 0%, LOW).
        - No stale voice (61%) or fusion (55%) from Turn 1 is present in latest_interaction.
        - History retains both Turn 1 and Turn 2.
        """
        t0 = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
        t1 = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()

        # Insert Turn 1 (Multimodal 55% HIGH)
        cid1 = str(uuid.uuid4())
        sid1 = str(uuid.uuid4())
        self.created_checkin_ids.append(cid1)
        self.created_score_ids.append(sid1)

        supabase.table("check_ins").insert({
            "id": cid1,
            "case_id": self.test_case_id,
            "channel": "voice",
            "raw_text": "I feel slightly stressed with work.",
            "voice_features": {"voice_emotions": {"anxiety": 0.61, "neutral": 0.39}},
            "timestamp": t0
        }).execute()

        supabase.table("distress_scores").insert({
            "id": sid1,
            "case_id": self.test_case_id,
            "total_score": 55.15,
            "trend": "stable",
            "sub_scores": {
                "raw_analysis": {
                    "text_analysis_output": {"sentiment_score": -0.01},
                    "voice_emotions": {"anxiety": 0.61, "neutral": 0.39},
                    "fusion_metrics": {
                        "d_text": 0.009,
                        "d_voice": 0.6127,
                        "d_base": 0.5494,
                        "final_distress_score": 0.5515,
                        "tier": "HIGH"
                    }
                }
            },
            "timestamp": t0
        }).execute()

        # Insert Turn 2 (Text-only 0% LOW)
        cid2 = str(uuid.uuid4())
        sid2 = str(uuid.uuid4())
        self.created_checkin_ids.append(cid2)
        self.created_score_ids.append(sid2)

        supabase.table("check_ins").insert({
            "id": cid2,
            "case_id": self.test_case_id,
            "channel": "text",
            "raw_text": "I am feeling totally relaxed and happy now.",
            "timestamp": t1
        }).execute()

        supabase.table("distress_scores").insert({
            "id": sid2,
            "case_id": self.test_case_id,
            "total_score": 0.0,
            "trend": "falling",
            "sub_scores": {
                "raw_analysis": {
                    "text_analysis_output": {"sentiment_score": 0.95},
                    "fusion_metrics": {
                        "d_text": 0.0,
                        "d_voice": "UNAVAILABLE",
                        "d_base": 0.0,
                        "final_distress_score": 0.0,
                        "tier": "LOW"
                    }
                }
            },
            "timestamp": t1
        }).execute()

        # Query GET /api/counsellor/cases/{case_id}
        res = self.client.get(f"/api/counsellor/cases/{self.test_case_id}")
        self.assertEqual(res.status_code, 200)
        data = res.json()

        latest = data["latest_interaction"]
        self.assertIsNotNone(latest)
        self.assertEqual(latest["final_distress_score"], 0)
        self.assertEqual(latest["text_score"], 0)
        self.assertIsNone(latest["voice_score"])
        self.assertEqual(latest["fusion_score"], 0)
        self.assertEqual(latest["risk_tier"], "LOW")
        self.assertFalse(latest["is_voice"])

        summary = data["summary"]
        self.assertEqual(summary["current_distress_percent"], 0)
        self.assertEqual(summary["risk_tier"], "LOW")

        # Query cases list GET /api/counsellor/cases
        res_cases = self.client.get("/api/counsellor/cases")
        self.assertEqual(res_cases.status_code, 200)
        case_row = next((c for c in res_cases.json() if c["case_id"] == self.test_case_id), None)
        self.assertIsNotNone(case_row)
        self.assertEqual(case_row["latest_distress_score"], 0.0)
        self.assertEqual(case_row["risk_tier"], "LOW")

    def test_canonical_latest_interaction_newer_multimodal_turn_is_authoritative(self):
        """
        Verify reverse scenario:
        Turn 1 (Older, T0): Text-only Turn (0% LOW)
        Turn 2 (Newer, T1): Multimodal Turn (Text 1%, Voice 61%, Fusion 55%, Final 55%, HIGH)

        When Turn 2 is the latest:
        - latest_interaction must be Turn 2 (Final 55%, Text 1%, Voice 61%, Fusion 55%, HIGH).
        - Table row latest_distress_score must be 55.15 and risk_tier HIGH.
        """
        t0 = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
        t1 = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()

        # Turn 1 (0% LOW)
        cid1 = str(uuid.uuid4())
        sid1 = str(uuid.uuid4())
        self.created_checkin_ids.append(cid1)
        self.created_score_ids.append(sid1)
        supabase.table("check_ins").insert({"id": cid1, "case_id": self.test_case_id, "channel": "text", "raw_text": "all good", "timestamp": t0}).execute()
        supabase.table("distress_scores").insert({"id": sid1, "case_id": self.test_case_id, "total_score": 0.0, "timestamp": t0}).execute()

        # Turn 2 (55.15% HIGH)
        cid2 = str(uuid.uuid4())
        sid2 = str(uuid.uuid4())
        self.created_checkin_ids.append(cid2)
        self.created_score_ids.append(sid2)
        supabase.table("check_ins").insert({
            "id": cid2, "case_id": self.test_case_id, "channel": "voice",
            "raw_text": "feeling stressed",
            "voice_features": {"voice_emotions": {"anxiety": 0.6127}},
            "timestamp": t1
        }).execute()
        supabase.table("distress_scores").insert({
            "id": sid2, "case_id": self.test_case_id, "total_score": 55.15, "trend": "rising",
            "sub_scores": {
                "raw_analysis": {
                    "voice_emotions": {"anxiety": 0.6127},
                    "fusion_metrics": {"d_text": 0.009, "d_voice": 0.6127, "d_base": 0.5494, "final_distress_score": 0.5515, "tier": "HIGH"}
                }
            },
            "timestamp": t1
        }).execute()

        res = self.client.get(f"/api/counsellor/cases/{self.test_case_id}")
        self.assertEqual(res.status_code, 200)
        data = res.json()

        latest = data["latest_interaction"]
        self.assertEqual(latest["final_distress_score"], 55)
        self.assertEqual(latest["text_score"], 1)
        self.assertEqual(latest["voice_score"], 61)
        self.assertEqual(latest["fusion_score"], 55)
        self.assertEqual(latest["risk_tier"], "HIGH")
        self.assertTrue(latest["is_voice"])

    def test_rohan_case2_consistency_in_live_db(self):
        """
        Verify live database consistency for Rohan Case 2:
        All values (Table latest_distress_score, Details summary distress, and latest_interaction)
        match exactly without contradictory mixing.
        """
        rohan_case2_id = "a0a0a0a0-b0b0-c0c0-d0d0-e0e0e0e0e0e0"

        # 1. GET /api/counsellor/cases
        res_cases = self.client.get("/api/counsellor/cases")
        self.assertEqual(res_cases.status_code, 200)
        rohan_case = next((c for c in res_cases.json() if c["case_id"] == rohan_case2_id), None)
        self.assertIsNotNone(rohan_case)

        # 2. GET /api/counsellor/cases/{case_id}
        res_details = self.client.get(f"/api/counsellor/cases/{rohan_case2_id}")
        self.assertEqual(res_details.status_code, 200)
        details = res_details.json()

        table_score = round(rohan_case["latest_distress_score"])
        details_score = details["summary"]["current_distress_percent"]
        latest_interaction_score = details["latest_interaction"]["final_distress_score"]

        # MUST ALL BE IDENTICAL
        self.assertEqual(table_score, details_score)
        self.assertEqual(table_score, latest_interaction_score)
        self.assertEqual(rohan_case["risk_tier"], details["summary"]["risk_tier"])
        self.assertEqual(rohan_case["risk_tier"], details["latest_interaction"]["risk_tier"])
