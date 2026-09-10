import os
import sys
import unittest

project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from backend.app.services.distress_scorer import (
    distress_scorer_service,
    apply_distress_reduction_cap,
    get_tier_for_score
)
from backend.app.services.conversation_session import ConversationSession

class TestDistressReductionCap(unittest.TestCase):
    def test_required_user_scenarios(self):
        scenarios = [
            (87.0, 46.0),
            (86.0, 20.0),
            (60.0, 20.0),
            (87.0, 82.0),
            (87.0, 95.0),
        ]
        
        print("\n" + "="*70)
        print("REQUIRED USER SCENARIO TEST RESULTS")
        print("="*70)
        print(f"{'Previous Score':<16} {'Model Score':<14} {'Final Stored Score':<20} {'Change':<12}")
        print("-" * 70)
        
        for prev, model in scenarios:
            final = apply_distress_reduction_cap(prev, model, max_reduction_ratio=0.08)
            change = round(final - prev, 2)
            change_str = f"+{change}" if change > 0 else f"{change}"
            print(f"{prev:<16.2f} {model:<14.2f} {final:<20.2f} {change_str:<12}")
            
            if model < prev:
                max_allowed_drop = prev * 0.08
                expected = max(model, prev - max_allowed_drop)
                self.assertAlmostEqual(final, expected, places=2)
            else:
                self.assertEqual(final, model)

        print("="*70 + "\n")

    def test_unit_scale_support(self):
        # 0.87 -> 0.46
        final = apply_distress_reduction_cap(0.87, 0.46, max_reduction_ratio=0.08)
        self.assertAlmostEqual(final, 0.8004, places=4)
        
        # 0.87 -> 0.95 (increase)
        final_inc = apply_distress_reduction_cap(0.87, 0.95, max_reduction_ratio=0.08)
        self.assertEqual(final_inc, 0.95)

    def test_edge_cases(self):
        # First turn with no previous score
        self.assertEqual(apply_distress_reduction_cap(None, 46.0), 46.0)
        
        # Score at 100 dropping to 20
        self.assertEqual(apply_distress_reduction_cap(100.0, 20.0), 92.0)
        
        # Score at 0
        self.assertEqual(apply_distress_reduction_cap(0.0, 0.0), 0.0)
        
        # Equal scores
        self.assertEqual(apply_distress_reduction_cap(75.0, 75.0), 75.0)

    def test_conversation_session_smoothing_in_memory(self):
        import uuid
        test_session_id = str(uuid.uuid4())
        test_case_id = str(uuid.uuid4())
        session = ConversationSession(session_id=test_session_id, case_id=test_case_id)
        
        # Turn 1: High distress (0.87)
        session.add_turn(
            transcript="I am feeling very bad and depressed.",
            response_text="I am here for you.",
            conversation_state="NORMAL",
            distress_score=0.87,
            safety_attention=False,
            internal_analysis={"fusion_metrics": {"final_distress_score": 0.87, "tier": "SEVERE"}}
        )
        self.assertEqual(len(session.history), 1)
        self.assertAlmostEqual(session.history[0]["distress_score"], 0.87, places=2)
        
        # Turn 2: User says "I feel better" (raw model predicts 0.46)
        session.add_turn(
            transcript="I feel better now.",
            response_text="Glad to hear.",
            conversation_state="NORMAL",
            distress_score=0.46,
            safety_attention=False,
            internal_analysis={"fusion_metrics": {"final_distress_score": 0.46, "tier": "MODERATE"}}
        )
        self.assertEqual(len(session.history), 2)
        # Final smoothed score should be ~0.8004 (80.04 on 0-100 scale), NOT 0.46
        turn2_score = session.history[1]["distress_score"]
        self.assertAlmostEqual(turn2_score, 0.8004, places=3)
        self.assertEqual(session.history[1]["internal_analysis"]["fusion_metrics"]["tier"], "SEVERE")

if __name__ == "__main__":
    unittest.main()
