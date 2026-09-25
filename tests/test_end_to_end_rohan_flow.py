import os
import unittest
import numpy as np
import soundfile as sf
import io
import base64
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.utils.supabase_client import get_supabase_client
from backend.scripts.clean_conversation_data import clean_rohan_case_data

class TestEndToEndRohanFlow(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        cls.supabase = get_supabase_client()
        cls.case_id = "a0a0a0a0-b0b0-c0c0-d0d0-e0e0e0e0e0e0"

    def setUp(self):
        # 1. Clean Rohan Case 2 conversation data ONLY if explicit ephemeral test mode is enabled
        if os.getenv("TEST_MODE") == "ephemeral":
            clean_rohan_case_data()

    def generate_dummy_wav_bytes(self, duration_s=1.0, freq=440.0):
        sr = 16000
        t = np.linspace(0, duration_s, int(sr * duration_s), False)
        tone = 0.5 * np.sin(2 * np.pi * freq * t)
        buf = io.BytesIO()
        sf.write(buf, tone, sr, format='WAV')
        buf.seek(0)
        return buf.getvalue()

    def test_complete_rohan_case_2_flow(self):
        import json
        from backend.app.services.conversation_session import conversation_session_manager

        # Step 2: Start a session
        start_res = self.client.post("/api/conversation/start")
        self.assertIn(start_res.status_code, [200, 201])
        session_data = start_res.json()
        session_id = session_data["session_id"]
        
        # Verify session is bound to ROHAN-CASE-2
        session_obj = conversation_session_manager.get_session(session_id)
        self.assertIsNotNone(session_obj)
        self.assertEqual(session_obj.case_id, self.case_id)

        # Step 3: Send ONE text message
        turn1_res = self.client.post("/api/conversation/respond", data={
            "session_id": session_id,
            "message": "I am feeling very lonely and sad today."
        })
        self.assertEqual(turn1_res.status_code, 200)
        turn1_data = turn1_res.json()

        # Step 4, 5, 6, 7, 8: Verify one check-in & one distress score belong to ROHAN-CASE-2
        check_ins = self.supabase.table("check_ins").select("*").eq("case_id", self.case_id).execute().data
        distress_scores = self.supabase.table("distress_scores").select("*").eq("case_id", self.case_id).execute().data

        self.assertEqual(len(check_ins), 1, "Expected exactly 1 check-in for Turn 1")
        self.assertEqual(len(distress_scores), 1, "Expected exactly 1 distress_score for Turn 1")
        self.assertEqual(check_ins[0]["case_id"], self.case_id)
        self.assertEqual(distress_scores[0]["case_id"], self.case_id)

        turn1_distress = distress_scores[0]["total_score"]
        self.assertGreater(turn1_distress, 0, "Distress score must be calculated and > 0")
        self.assertIn("response_text", turn1_data)
        self.assertIn("transcript", turn1_data)

        # Verify text analysis in turn1 check_in
        turn1_indicators = check_ins[0].get("distress_indicators") or {}
        self.assertIn("text_analysis_output", turn1_indicators)
        self.assertIn("fusion_metrics", turn1_indicators)

        # Step 9, 10: Verify GET counsellor cases returns updated Rohan Case 2 matching the new score
        cases_res = self.client.get("/api/counsellor/cases")
        self.assertEqual(cases_res.status_code, 200)
        cases = cases_res.json()
        rohan_case = next((c for c in cases if c["id"] == self.case_id), None)
        self.assertIsNotNone(rohan_case, "ROHAN-CASE-2 must be present in counsellor cases")
        self.assertEqual(rohan_case["distress_score"], turn1_distress, "Counsellor case score must match Turn 1 score")

        # Step 11, 12, 13: Send a SECOND text message (distinct sentiment)
        turn2_res = self.client.post("/api/conversation/respond", data={
            "session_id": session_id,
            "message": "Actually I spoke to my friend and I feel so much better and calm now."
        })
        self.assertEqual(turn2_res.status_code, 200)
        turn2_data = turn2_res.json()
        self.assertIn("response_text", turn2_data)

        check_ins_turn2 = self.supabase.table("check_ins").select("*").eq("case_id", self.case_id).order("timestamp", desc=False).execute().data
        distress_scores_turn2 = self.supabase.table("distress_scores").select("*").eq("case_id", self.case_id).order("timestamp", desc=False).execute().data

        self.assertEqual(len(check_ins_turn2), 2, "Expected exactly 2 check-ins after Turn 2")
        self.assertEqual(len(distress_scores_turn2), 2, "Expected exactly 2 distress scores after Turn 2")

        turn2_distress = distress_scores_turn2[1]["total_score"]
        # Verify score changed
        self.assertNotEqual(turn1_distress, turn2_distress, "Score must update when user sentiment improves")

        # Step 14, 15, 16: Send a VOICE turn with audio
        wav_bytes = self.generate_dummy_wav_bytes()
        turn3_res = self.client.post(
            "/api/conversation/respond",
            data={"session_id": session_id, "message": "I am sending this voice recording."},
            files={"file": ("recording.wav", io.BytesIO(wav_bytes), "audio/wav")}
        )
        self.assertEqual(turn3_res.status_code, 200)
        turn3_data = turn3_res.json()

        check_ins_turn3 = self.supabase.table("check_ins").select("*").eq("case_id", self.case_id).order("timestamp", desc=False).execute().data
        self.assertEqual(len(check_ins_turn3), 3)
        turn3_voice = check_ins_turn3[2].get("voice_features")
        self.assertIsNotNone(turn3_voice, "Voice features must be present for audio message")
        self.assertIn("voice_emotions", turn3_voice)
        self.assertIn("conversational_features", turn3_voice)
        
        turn3_fusion = check_ins_turn3[2]["distress_indicators"]["fusion_metrics"]
        self.assertTrue(turn3_fusion.get("voice_available", False), "Voice modality must be marked as available")

        # Step 17, 18: Inject prototype biosignal data and verify tri-modal fusion
        biosignal_payload = {
            "heart_rate": 115.0,
            "hrv": 22.0,
            "skin_conductance": 7.5,
            "sleep_duration": 4.0,
            "sleep_quality": 35.0,
            "spo2": 96.0
        }
        turn4_res = self.client.post(
            "/api/conversation/respond",
            data={
                "session_id": session_id,
                "message": "My heart is beating really fast and I could not sleep.",
                "biosignal_data": json.dumps(biosignal_payload)
            },
            files={"file": ("recording.wav", io.BytesIO(wav_bytes), "audio/wav")}
        )
        self.assertEqual(turn4_res.status_code, 200)
        check_ins_turn4 = self.supabase.table("check_ins").select("*").eq("case_id", self.case_id).order("timestamp", desc=False).execute().data
        self.assertEqual(len(check_ins_turn4), 4)
        turn4_fusion = check_ins_turn4[3]["distress_indicators"]["fusion_metrics"]
        self.assertTrue(turn4_fusion.get("biosignal_available", False), "Biosignal modality must be marked as available")
        self.assertTrue(turn4_fusion.get("voice_available", False), "Voice modality must be marked as available")
        self.assertTrue(turn4_fusion.get("text_available", False), "Text modality must be marked as available")

        # Step 19, 20: Trigger crisis/high-risk message and verify Alert creation for ROHAN-CASE-2
        turn5_res = self.client.post("/api/conversation/respond", data={
            "session_id": session_id,
            "message": "I cannot take this anymore, I want to end my life and hurt myself tonight."
        })
        self.assertEqual(turn5_res.status_code, 200)
        turn5_data = turn5_res.json()
        self.assertIn("response_text", turn5_data)

        alerts = self.supabase.table("alerts").select("*").eq("case_id", self.case_id).execute().data
        self.assertGreaterEqual(len(alerts), 1, "At least one alert must be generated for high-risk message")
        latest_alert = alerts[-1]
        self.assertEqual(latest_alert["case_id"], self.case_id)
        self.assertEqual(latest_alert["status"], "active")
        self.assertTrue(len(latest_alert.get("recommendation_text", "")) > 0)

        # Step 21: Verify case history contains every turn
        history_res = self.client.get(f"/api/counsellor/cases/{self.case_id}/history")
        self.assertEqual(history_res.status_code, 200)
        history = history_res.json()
        self.assertEqual(len(history), 5, "All 5 turns must appear in case history")
        for idx, turn in enumerate(history):
            self.assertIn("timestamp", turn)
            self.assertIn("distress_score", turn)
            self.assertIn("user_message", turn)
            self.assertIn("response_text", turn)
            self.assertEqual(turn["turn_number"], idx + 1)

        # Step 22: Verify Today/Yesterday calculations use IST
        case_detail_res = self.client.get(f"/api/counsellor/cases/{self.case_id}")
        self.assertEqual(case_detail_res.status_code, 200)
        case_detail = case_detail_res.json()
        self.assertIn("today_summary", case_detail)
        self.assertIn("yesterday_summary", case_detail)
        self.assertIn("trend_direction", case_detail)
        self.assertEqual(case_detail["today_summary"]["check_in_count"], 5)

        # Step 23: Verify ending the session does NOT deactivate ROHAN-CASE-2
        end_res = self.client.post("/api/conversation/end", data={"session_id": session_id})
        self.assertEqual(end_res.status_code, 200)

        case_in_db = self.supabase.table("cases").select("*").eq("id", self.case_id).execute().data
        self.assertEqual(len(case_in_db), 1)
        self.assertEqual(case_in_db[0]["stage"], "active", "ROHAN-CASE-2 must remain active after session end")

        # Step 24: Verify no TEST-* or Anonymous cases were created in cases table
        all_cases = self.supabase.table("cases").select("id, nhaa_ref").execute().data
        invalid_cases = [c for c in all_cases if "TEST-" in str(c.get("nhaa_ref", "")) or "Anonymous" in str(c.get("nhaa_ref", ""))]
        self.assertEqual(len(invalid_cases), 0, f"Found unexpected test/anonymous cases: {invalid_cases}")

if __name__ == "__main__":
    unittest.main()
