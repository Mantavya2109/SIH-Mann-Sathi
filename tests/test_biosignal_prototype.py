import os
import sys
import unittest
from fastapi.testclient import TestClient

# Ensure workspace is in sys.path
workspace_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if workspace_path not in sys.path:
    sys.path.insert(0, workspace_path)

from backend.app.main import app
from backend.app.services.biosignal_service import biosignal_provider

class TestBiosignalPrototype(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.rohan_case2_id = "a0a0a0a0-b0b0-c0c0-d0d0-e0e0e0e0e0e0"
        self.rohan_case1_id = "60895178-7a8b-4392-961b-ac82d4b7ec0c"
        self.ananya_case1_id = "11111111-2222-3333-4444-555555555555"
        self.rohan_user_id = "7d64f81f-8108-467a-ae43-36986d04766f"

    def test_case_isolation_and_deterministic_data(self):
        """
        Verify case isolation and deterministic data between Rohan Case 2, Rohan Case 1, and Ananya Case 1.
        """
        # 1. Fetch Rohan Case 2 telemetry
        res_r2 = self.client.get(f"/api/biosignals/{self.rohan_case2_id}")
        self.assertEqual(res_r2.status_code, 200)
        data_r2 = res_r2.json()

        self.assertEqual(data_r2["case_name"], "ROHAN-CASE-2")
        self.assertEqual(data_r2["patient_name"], "Rohan")
        self.assertTrue(data_r2["is_demo"])
        self.assertEqual(data_r2["sleep"]["duration_formatted"], "6h 42m")
        self.assertEqual(data_r2["heart_rate"]["resting_bpm"], 74)
        self.assertEqual(data_r2["skin_conductance"]["average_us"], 2.8)
        self.assertEqual(data_r2["blood_oxygen"]["average_spo2"], 98)
        self.assertEqual(data_r2["respiratory_rate"]["average_bpm"], 15)
        self.assertTrue(len(data_r2["sleep_history"]) >= 4)

        # 2. Fetch Rohan Case 1 telemetry
        res_r1 = self.client.get(f"/api/biosignals/{self.rohan_case1_id}")
        self.assertEqual(res_r1.status_code, 200)
        data_r1 = res_r1.json()

        self.assertEqual(data_r1["case_name"], "ROHAN-CASE-1")
        self.assertNotEqual(data_r1["sleep"]["duration_formatted"], data_r2["sleep"]["duration_formatted"])
        self.assertEqual(data_r1["sleep"]["duration_formatted"], "7h 35m")
        self.assertEqual(data_r1["skin_conductance"]["average_us"], 2.1)

        # 3. Fetch Ananya Case 1 telemetry
        res_a1 = self.client.get(f"/api/biosignals/{self.ananya_case1_id}")
        self.assertEqual(res_a1.status_code, 200)
        data_a1 = res_a1.json()

        self.assertEqual(data_a1["case_name"], "ANANYA-CASE-1")
        self.assertEqual(data_a1["patient_name"], "Ananya Patel")
        self.assertEqual(data_a1["sleep"]["duration_formatted"], "7h 12m")

        # Confirm cases do not leak into one another
        self.assertNotEqual(data_r2["case_name"], data_a1["case_name"])
        self.assertNotEqual(data_r1["case_name"], data_a1["case_name"])

    def test_sleep_history_and_modalities(self):
        """
        Verify sleep analytics, sleep history table structure, and physiological telemetry parameters.
        """
        res = self.client.get(f"/api/biosignals/{self.rohan_case2_id}")
        self.assertEqual(res.status_code, 200)
        data = res.json()

        # Check sleep structure
        self.assertIn("sleep", data)
        self.assertIn("duration_formatted", data["sleep"])
        self.assertIn("quality", data["sleep"])
        self.assertIn("consistency", data["sleep"])
        self.assertIn("disturbances", data["sleep"])
        self.assertIn("recovery", data["sleep"])

        # Check sleep history table
        history = data["sleep_history"]
        self.assertTrue(len(history) >= 4)
        for entry in history:
            self.assertIn("date", entry)
            self.assertIn("duration", entry)
            self.assertIn("quality", entry)
            self.assertIn("recovery", entry)
            self.assertIn("disturbances", entry)

        # Check heart rate
        self.assertIn("resting_bpm", data["heart_rate"])
        self.assertIn("average_bpm", data["heart_rate"])
        self.assertIn("range_formatted", data["heart_rate"])
        self.assertIn("status", data["heart_rate"])

        # Check skin conductance
        self.assertIn("average_us", data["skin_conductance"])
        self.assertIn("peak_us", data["skin_conductance"])
        self.assertIn("stress_events", data["skin_conductance"])

        # Check SpO2 & respiration
        self.assertIn("average_spo2", data["blood_oxygen"])
        self.assertIn("min_spo2", data["blood_oxygen"])
        self.assertIn("average_bpm", data["respiratory_rate"])

    def test_holistic_mental_status_assessment(self):
        """
        Verify holistic mental status assessment combines multimodal conversational AI signals
        with prototype biosignals without altering existing underlying fusion or distress algorithms.
        """
        res = self.client.get(f"/api/biosignals/{self.rohan_case2_id}/holistic")
        self.assertEqual(res.status_code, 200)
        holistic = res.json()

        self.assertIn("current_status", holistic)
        self.assertIn("trend", holistic)
        self.assertIn("confidence", holistic)
        self.assertEqual(holistic["confidence"], "Demo / Prototype")
        self.assertIn("signals", holistic)
        self.assertIn("fusion_score", holistic["signals"])
        self.assertIn("overall_interpretation", holistic)
        self.assertIn("contributing_indicators", holistic)
        self.assertTrue(len(holistic["contributing_indicators"]) >= 2)

        # Confirm non-diagnostic phrasing
        interpretation = holistic["overall_interpretation"].lower()
        self.assertNotIn("diagnosed with", interpretation)
        self.assertNotIn("patient has depression", interpretation)

    def test_simulated_sync_and_victim_user_endpoint(self):
        """
        Verify POST /api/biosignals/{case_id}/sync and GET /api/biosignals/user/{user_id}.
        """
        # Test simulated sync
        res_sync = self.client.post(f"/api/biosignals/{self.rohan_case2_id}/sync")
        self.assertEqual(res_sync.status_code, 200)
        sync_data = res_sync.json()
        self.assertEqual(sync_data["status"], "synced")
        self.assertIn("last_sync_ist", sync_data)

        # Test victim user endpoint resolves active case
        res_user = self.client.get(f"/api/biosignals/user/{self.rohan_user_id}")
        self.assertEqual(res_user.status_code, 200)
        user_bio = res_user.json()
        self.assertEqual(user_bio["case_name"], "ROHAN-CASE-2")
        self.assertEqual(user_bio["device_status"], "Connected")

if __name__ == "__main__":
    unittest.main()
