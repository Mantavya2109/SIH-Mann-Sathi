import os
import sys
import unittest
from fastapi.testclient import TestClient

project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from backend.app.main import app
from backend.app.utils.supabase_client import supabase

class TestCounsellorLocation(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.rohan_case1_id = "7d64f81f-8108-467a-ae43-36986d04766f"
        self.rohan_case2_id = "a0a0a0a0-b0b0-c0c0-d0d0-e0e0e0e0e0e0"
        self.ananya_case_id = "60895178-7a8b-4392-961b-ac82d4b7ec0c"

    def test_rohan_case2_critical_location(self):
        # Insert temporary critical distress score to verify location exposure
        res_score = supabase.table("distress_scores").insert({
            "case_id": self.rohan_case2_id,
            "total_score": 78.5,
            "trend": "rising"
        }).execute()
        score_id = res_score.data[0]["id"]
        try:
            res = self.client.get(f"/api/counsellor/cases/{self.rohan_case2_id}/location")
            self.assertEqual(res.status_code, 200)
            data = res.json()
            
            self.assertTrue(data["is_critical"])
            self.assertTrue(data["location_available"])
            self.assertIn("VIT-AP", data["location"]["place_name"])
            self.assertAlmostEqual(data["location"]["latitude"], 16.4971, places=3)
            self.assertAlmostEqual(data["location"]["longitude"], 80.4992, places=3)
        finally:
            supabase.table("distress_scores").delete().eq("id", score_id).execute()

    def test_rohan_case1_non_critical_location_gating(self):
        # Rohan Case 1 has score 0.0 (<= 60), so location must be hidden/gated
        res = self.client.get(f"/api/counsellor/cases/{self.rohan_case1_id}/location")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        
        self.assertFalse(data["is_critical"])
        self.assertFalse(data["location_available"])
        self.assertIn("Location unavailable", data["message"])
        self.assertNotIn("location", data)

    def test_ananya_non_critical_and_critical_location_parity(self):
        # Ananya currently <= 60 (score 25.37)
        res = self.client.get(f"/api/counsellor/cases/{self.ananya_case_id}/location")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertFalse(data["is_critical"])
        self.assertFalse(data["location_available"])
        self.assertIn("Location unavailable", data["message"])

    def test_location_coordinates_differentiation(self):
        # Verify coordinates for both Rohan and Ananya
        temp_score_ids = []
        try:
            # Score for Rohan Case 1
            res1 = supabase.table("distress_scores").insert({
                "case_id": self.rohan_case1_id,
                "total_score": 75.0,
                "trend": "rising"
            }).execute()
            temp_score_ids.append(res1.data[0]["id"])
            
            # Score for Rohan Case 2
            res_r2_score = supabase.table("distress_scores").insert({
                "case_id": self.rohan_case2_id,
                "total_score": 79.0,
                "trend": "rising"
            }).execute()
            temp_score_ids.append(res_r2_score.data[0]["id"])

            # Score for Ananya
            res2 = supabase.table("distress_scores").insert({
                "case_id": self.ananya_case_id,
                "total_score": 82.0,
                "trend": "rising"
            }).execute()
            temp_score_ids.append(res2.data[0]["id"])

            # 1. Fetch Rohan Case 1 Location
            loc_r1 = self.client.get(f"/api/counsellor/cases/{self.rohan_case1_id}/location").json()
            # 2. Fetch Rohan Case 2 Location
            loc_r2 = self.client.get(f"/api/counsellor/cases/{self.rohan_case2_id}/location").json()
            # 3. Fetch Ananya Location
            loc_an = self.client.get(f"/api/counsellor/cases/{self.ananya_case_id}/location").json()

            # Both Rohan cases must point to exact same VIT-AP coordinates
            self.assertEqual(loc_r1["location"]["latitude"], loc_r2["location"]["latitude"])
            self.assertEqual(loc_r1["location"]["longitude"], loc_r2["location"]["longitude"])
            self.assertIn("VIT-AP", loc_r1["location"]["place_name"])
            self.assertIn("VIT-AP", loc_r2["location"]["place_name"])

            # Ananya must point to Visakhapatnam and NOT VIT-AP
            self.assertNotEqual(loc_an["location"]["latitude"], loc_r1["location"]["latitude"])
            self.assertNotEqual(loc_an["location"]["longitude"], loc_r1["location"]["longitude"])
            self.assertIn("Visakhapatnam", loc_an["location"]["place_name"])
            self.assertAlmostEqual(loc_an["location"]["latitude"], 17.6868, places=3)
            self.assertAlmostEqual(loc_an["location"]["longitude"], 83.2185, places=3)

        finally:
            # Clean up temporary test scores
            for sid in temp_score_ids:
                try:
                    supabase.table("distress_scores").delete().eq("id", sid).execute()
                except Exception:
                    pass

if __name__ == "__main__":
    unittest.main()
