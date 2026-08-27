import os
import sys
import unittest
import uuid
from datetime import datetime
from fastapi.testclient import TestClient

# Ensure workspace is in sys.path
workspace_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if workspace_path not in sys.path:
    sys.path.insert(0, workspace_path)

from backend.app.main import app
from backend.app.services.conversation_session import conversation_session_manager
from backend.app.utils.supabase_client import supabase

class TestAlertsAndAcknowledgements(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        # Setup unique case ID for test run to avoid conflicts
        self.session_id = conversation_session_manager.create_session()
        self.session = conversation_session_manager.get_session(self.session_id)

    def tearDown(self):
        # Mark case stage as inactive
        conversation_session_manager.delete_session(self.session_id)

    def test_alert_creation_and_acknowledgement(self):
        """
        Verify that crossing the distress threshold triggers a database alert insertion,
        provisions and recommendations are persisted correctly, and counsellor PATCH acknowledgement works.
        """
        # Define specific recommendation and cited provisions (upstream simulation)
        rec_text = "Urgent attention required. Flagged self-harm indicator."
        cited_provs = ["Section 375 of Bharatiya Nyaya Sanhita (BNS)", "Section 354 IPC"]

        # Add a turn crossing the distress score threshold (0.9 distress score)
        self.session.add_turn(
            transcript="I am feeling extremely overwhelmed and hopeless.",
            response_text="I hear you, please take deep breaths. I am here to help.",
            conversation_state="HIGH_DISTRESS",
            distress_score=0.90,  # 90% distress (>= 85% threshold)
            safety_attention=True,
            internal_analysis={
                "text_emotions": {"fear": 0.85, "sadness": 0.15}
            },
            recommendation_text=rec_text,
            cited_provisions=cited_provs
        )

        # 1. Verify alert row creation in Supabase
        alerts_res = supabase.table("alerts") \
            .select("*") \
            .eq("case_id", self.session_id) \
            .execute()
        
        self.assertTrue(len(alerts_res.data) > 0, "No alerts created in Supabase for high distress case.")
        
        alert = alerts_res.data[0]
        alert_id = alert["id"]
        
        self.assertEqual(alert["case_id"], self.session_id)
        self.assertIsNotNone(alert["distress_score_id"])
        self.assertEqual(alert["recommendation_text"], rec_text)
        self.assertEqual(alert["cited_provisions"], cited_provs)
        self.assertEqual(alert["status"], "active")

        # 2. Test counsellor acknowledgement operation (PATCH /api/alerts/{alert_id}/acknowledge)
        counsellor_name = "Counsellor_Priya"
        response = self.client.patch(
            f"/api/alerts/{alert_id}/acknowledge",
            json={"acknowledged_by": counsellor_name}
        )
        self.assertEqual(response.status_code, 200)
        
        res_json = response.json()
        self.assertEqual(res_json["alert_id"], alert_id)
        self.assertEqual(res_json["acknowledged_by"], counsellor_name)

        # 3. Verify updated fields inside Supabase
        updated_res = supabase.table("alerts") \
            .select("*") \
            .eq("id", alert_id) \
            .execute()
        
        self.assertEqual(len(updated_res.data), 1)
        updated_alert = updated_res.data[0]
        
        self.assertEqual(updated_alert["status"], "acknowledged")
        self.assertEqual(updated_alert["acknowledged_by"], counsellor_name)
        self.assertIsNotNone(updated_alert["acknowledged_at"])
