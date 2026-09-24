import os
import sys
import unittest
from fastapi.testclient import TestClient

# Ensure workspace is in sys.path
workspace_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if workspace_path not in sys.path:
    sys.path.insert(0, workspace_path)

from backend.app.main import app
from backend.app.services.case_prioritization import case_prioritization_service
from backend.app.services.conversation_session import conversation_session_manager

class TestCasePrioritization(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        # Clear sessions before each test
        conversation_session_manager.sessions.clear()
        self.session_ids = []

    def tearDown(self):
        # Clear all dynamic session cases from Supabase database
        for sid in self.session_ids:
            try:
                conversation_session_manager.delete_session_permanently(sid)
            except Exception:
                pass

    def test_direct_service_fallback(self):
        """Test rule-based fallback logic directly."""
        mock_cases = [
            {
                "case_id": "C_LOW",
                "distress_score": 0.1,
                "trend": "stable",
                "days_since_last_checkin": 1.0,
                "risk_level": "LOW",
                "safety_attention": False
            },
            {
                "case_id": "C_CRITICAL",
                "distress_score": 0.85,
                "trend": "rising",
                "days_since_last_checkin": 10.0,
                "risk_level": "SEVERE",
                "safety_attention": True
            },
            {
                "case_id": "C_HIGH",
                "distress_score": 0.65,
                "trend": "rising",
                "days_since_last_checkin": 3.0,
                "risk_level": "HIGH",
                "safety_attention": False
            }
        ]
        
        # Test direct fallback call
        results = case_prioritization_service._prioritize_cases_fallback(mock_cases)
        
        # Verify length and sort order
        self.assertEqual(len(results), 3)
        self.assertEqual(results[0]["case_id"], "C_CRITICAL")
        self.assertEqual(results[0]["priority"], "CRITICAL")
        self.assertEqual(results[1]["case_id"], "C_HIGH")
        self.assertEqual(results[1]["priority"], "HIGH")
        self.assertEqual(results[2]["case_id"], "C_LOW")
        self.assertEqual(results[2]["priority"], "LOW")
        
        # Verify scores are valid and bounded
        for r in results:
            self.assertTrue(0.0 <= r["priority_score"] <= 100.0)
            self.assertIn("reason", r)
            self.assertFalse("diagnosis" in r["reason"].lower())  # Safety constraint check

    def test_endpoint_with_custom_payload(self):
        """Test POST /api/cases/prioritize with a list of custom cases."""
        payload = [
            {
                "case_id": "C_LOW_CHECK",
                "distress_score": 0.05,
                "trend": "falling",
                "days_since_last_checkin": 0.5,
                "risk_level": "LOW",
                "safety_attention": False
            },
            {
                "case_id": "C_HIGH_CHECK",
                "distress_score": 0.70,
                "trend": "rising",
                "days_since_last_checkin": 8.0,
                "risk_level": "HIGH",
                "safety_attention": True
            }
        ]
        
        response = self.client.post("/api/cases/prioritize", json={"cases": payload})
        self.assertEqual(response.status_code, 200)
        res_json = response.json()
        
        self.assertIn("prioritized_cases", res_json)
        cases_out = res_json["prioritized_cases"]
        self.assertEqual(len(cases_out), 2)
        
        # Verify ranking order
        self.assertEqual(cases_out[0]["case_id"], "C_HIGH_CHECK")
        self.assertEqual(cases_out[0]["priority"], "CRITICAL")
        self.assertEqual(cases_out[1]["case_id"], "C_LOW_CHECK")
        self.assertEqual(cases_out[1]["priority"], "LOW")

    def test_endpoint_with_dynamic_sessions(self):
        """Test POST /api/cases/prioritize dynamically loading active sessions."""
        # 1. Create session A (Normal Case)
        sid_a = conversation_session_manager.create_session()
        self.session_ids.append(sid_a)
        session_a = conversation_session_manager.get_session(sid_a)
        session_a.add_turn(
            transcript="I am feeling good today.",
            response_text="Glad to hear that!",
            conversation_state="NORMAL",
            distress_score=0.10,
            safety_attention=False,
            internal_analysis={
                "fusion_metrics": {"tier": "LOW"}
            }
        )
        
        # 2. Create session B (Critical Case)
        sid_b = conversation_session_manager.create_session()
        self.session_ids.append(sid_b)
        session_b = conversation_session_manager.get_session(sid_b)
        session_b.add_turn(
            transcript="I want to hurt myself. I've been feeling extremely bad.",
            response_text="Please reach out for help immediately.",
            conversation_state="SEVERE_DISTRESS",
            distress_score=0.88,
            safety_attention=True,
            internal_analysis={
                "fusion_metrics": {"tier": "SEVERE"}
            }
        )
        
        # Make a second turn to test rising trend
        session_b.add_turn(
            transcript="No, really, I'm hopeless.",
            response_text="I am here for you.",
            conversation_state="SEVERE_DISTRESS",
            distress_score=0.95, # 0.88 -> 0.95 is rising
            safety_attention=True,
            internal_analysis={
                "fusion_metrics": {"tier": "SEVERE"}
            }
        )
        
        # Call prioritize API with empty body (should fetch dynamically from memory)
        response = self.client.post("/api/cases/prioritize", json={"cases": []})
        self.assertEqual(response.status_code, 200)
        res_json = response.json()
        
        self.assertIn("prioritized_cases", res_json)
        cases_out = res_json["prioritized_cases"]
        self.assertEqual(len(cases_out), 2)
        
        # Session B should be critical and prioritized first
        self.assertEqual(cases_out[0]["case_id"], sid_b)
        self.assertEqual(cases_out[0]["priority"], "CRITICAL")
        self.assertEqual(cases_out[1]["case_id"], sid_a)
        self.assertEqual(cases_out[1]["priority"], "LOW")

    def test_endpoint_with_null_and_malformed_values(self):
        """Test POST /api/cases/prioritize with nulls and malformed structures."""
        payload = [
            {
                "case_id": "C_NULLS",
                "distress_score": None,
                "trend": None,
                "days_since_last_checkin": None,
                "risk_level": None,
                "safety_attention": None
            }
        ]
        response = self.client.post("/api/cases/prioritize", json={"cases": payload})
        self.assertEqual(response.status_code, 200)
        res_json = response.json()
        self.assertIn("prioritized_cases", res_json)
        cases_out = res_json["prioritized_cases"]
        self.assertEqual(len(cases_out), 1)
        self.assertEqual(cases_out[0]["case_id"], "C_NULLS")
        self.assertEqual(cases_out[0]["priority"], "LOW")

if __name__ == "__main__":
    unittest.main()
