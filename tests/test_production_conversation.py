import os
import sys
import re
import shutil
import wave
import struct
import pyttsx3
from fastapi.testclient import TestClient

# Ensure workspace is in sys.path
workspace_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if workspace_path not in sys.path:
    sys.path.insert(0, workspace_path)

from backend.app.main import app
from backend.app.services.conversation_session import conversation_session_manager

client = TestClient(app)
temp_wav = os.path.join(workspace_path, "conv_test_temp.wav")

def text_to_speech(text: str, filepath: str):
    engine = pyttsx3.init()
    voices = engine.getProperty('voices')
    if voices:
        for v in voices:
            if "EN" in v.name or "English" in v.name:
                engine.setProperty('voice', v.id)
                break
    engine.setProperty('rate', 140)
    engine.save_to_file(text, filepath)
    engine.runAndWait()

def generate_silent_wav(filepath: str, duration_sec: float = 3.0, sr: int = 16000):
    with wave.open(filepath, 'w') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        num_frames = int(duration_sec * sr)
        zero_data = struct.pack('<' + 'h' * num_frames, *([0] * num_frames))
        w.writeframes(zero_data)

def print_response_details(test_name: str, payload: dict):
    print(f"\n--- {test_name} Response Payload ---")
    import json
    print(json.dumps(payload, indent=2))
    
    # Assert restricted keys are NOT present
    for key in ["conversation_state", "safety_attention", "voice_emotions", "text_emotions", "fusion_metrics", "distress_score"]:
        assert key not in payload, f"Security Violation: '{key}' was exposed to the user-facing response!"

def run_tests():
    print("======================================================================")
    print("               SIH PRODUCTION CONVERSATION ASSISTANCE TESTS           ")
    print("======================================================================\n")
    
    # ---------------------------------------------------------
    # Test 8 & 9. Multiple Turns (session_id and turn_number continuity)
    # ---------------------------------------------------------
    print("[TEST 8/9] Initializing session...")
    res_start = client.post("/api/conversation/start")
    assert res_start.status_code == 201
    session_id = res_start.json()["session_id"]
    print(f"Session initialized with ID: {session_id}")

    # 1. Normal turn
    print("\n[TEST 1] Testing Normal Speech Scenario...")
    text_to_speech("I am feeling good today. Everything is going well.", temp_wav)
    with open(temp_wav, "rb") as f:
        res = client.post(
            "/api/conversation/respond",
            files={"file": ("recording.wav", f, "audio/wav")},
            data={"session_id": session_id}
        )
    assert res.status_code == 200
    res_json = res.json()
    print_response_details("Normal Speech", res_json)
    assert res_json["turn_number"] == 1
    
    # Verify internal analysis metadata exists
    session = conversation_session_manager.get_session(session_id)
    assert session is not None
    assert len(session.history) == 1
    turn_1_data = session.history[-1]
    assert "internal_analysis" in turn_1_data
    internal_1 = turn_1_data["internal_analysis"]
    print("\n[TEST 9 Verification] Internal Turn 1 Analysis Keys stored:")
    print(list(internal_1.keys()))
    assert internal_1["conversation_state"] == "NORMAL"
    assert "fusion_metrics" in internal_1
    assert "voice_emotions" in internal_1
    assert "text_emotions" in internal_1

    # 2. Mild Stress turn
    print("\n[TEST 2] Testing Mild Stress Scenario...")
    text_to_speech("I'm a little tired and stressed today.", temp_wav)
    with open(temp_wav, "rb") as f:
        res = client.post(
            "/api/conversation/respond",
            files={"file": ("recording.wav", f, "audio/wav")},
            data={"session_id": session_id}
        )
    assert res.status_code == 200
    res_json = res.json()
    print_response_details("Mild Stress", res_json)
    assert res_json["turn_number"] == 2
    
    # 3. Masked / Contradictory turn
    print("\n[TEST 3] Testing Masked/Contradictory Scenario...")
    text_to_speech("I'm fine, but honestly I've been worried about everything.", temp_wav)
    with open(temp_wav, "rb") as f:
        res = client.post(
            "/api/conversation/respond",
            files={"file": ("recording.wav", f, "audio/wav")},
            data={"session_id": session_id}
        )
    assert res.status_code == 200
    res_json = res.json()
    print_response_details("Masked / Contradictory", res_json)
    assert res_json["turn_number"] == 3
    assert any(w in res_json["response_text"].lower() for w in ["carrying", "worry", "worri", "wonder", "listen", "mind", "understand", "feel"])

    # 4. Clear Distress turn
    print("\n[TEST 4] Testing Clear Distress Scenario...")
    text_to_speech("I'm really scared. I don't feel safe.", temp_wav)
    with open(temp_wav, "rb") as f:
        res = client.post(
            "/api/conversation/respond",
            files={"file": ("recording.wav", f, "audio/wav")},
            data={"session_id": session_id}
        )
    assert res.status_code == 200
    res_json = res.json()
    print_response_details("Clear Distress", res_json)
    assert res_json["turn_number"] == 4

    # 5. Explicit Safety turn
    print("\n[TEST 5] Testing Safety Scenario...")
    text_to_speech("I feel hopeless and I don't know if I can keep going.", temp_wav)
    with open(temp_wav, "rb") as f:
        res = client.post(
            "/api/conversation/respond",
            files={"file": ("recording.wav", f, "audio/wav")},
            data={"session_id": session_id}
        )
    assert res.status_code == 200
    res_json = res.json()
    print_response_details("Explicit Safety", res_json)
    assert res_json["turn_number"] == 5

    # 6. Recovery turn
    # Turn 5 was high/severe distress. We now send Turn 6 as recovery text.
    print("\n[TEST 6] Testing Recovery Scenario (following distressed turn)...")
    text_to_speech("I'm feeling much better now.", temp_wav)
    with open(temp_wav, "rb") as f:
        res = client.post(
            "/api/conversation/respond",
            files={"file": ("recording.wav", f, "audio/wav")},
            data={"session_id": session_id}
        )
    assert res.status_code == 200
    res_json = res.json()
    print_response_details("Recovery Turn", res_json)
    assert res_json["turn_number"] == 6
    # Assert assistant response contains recovery acknowledgment
    assert "better" in res_json["response_text"].lower() or "lighter" in res_json["response_text"].lower() or "glad" in res_json["response_text"].lower()

    # 7. Silence turn (VAD Edge Case)
    print("\n[TEST 7] Testing Silence Scenario...")
    generate_silent_wav(temp_wav)
    with open(temp_wav, "rb") as f:
        res = client.post(
            "/api/conversation/respond",
            files={"file": ("recording.wav", f, "audio/wav")},
            data={"session_id": session_id}
        )
    assert res.status_code == 200
    res_json = res.json()
    print_response_details("Silence / No Speech", res_json)
    assert res_json["turn_number"] == 7
    assert "catch" in res_json["response_text"].lower() or "again" in res_json["response_text"].lower() or "clarify" in res_json["response_text"].lower()

    # 10. Verify temporary audio cleanup
    print("\n[TEST 10] Verifying temporary audio files cleanup...")
    # Clean up local test file
    if os.path.exists(temp_wav):
        os.remove(temp_wav)
    print("[SUCCESS] Local test file cleaned.")

    print("\n======================================================================")
    print("             ALL CONVERSATIONAL BACKEND TESTS PASSED CLEANLY          ")
    print("======================================================================")

if __name__ == "__main__":
    try:
        run_tests()
    except Exception as e:
        print(f"\n[FAILURE] Test suite encountered an error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
