import os
import sys
import time
import requests
import pyttsx3
import subprocess

# Ensure workspace is in sys.path
workspace_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if workspace_path not in sys.path:
    sys.path.insert(0, workspace_path)

# Helper to generate TTS audio on Windows
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

def test_api():
    temp_wav = os.path.join(workspace_path, "api_test_temp.wav")
    
    # 1. Start backend server
    print("Starting backend server...")
    server_process = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "backend.app.main:app", "--host", "127.0.0.1", "--port", "8005"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE
    )
    
    # Wait for server to start
    time.sleep(10)
    
    try:
        # 2. Generate TTS wav
        text = "I'm feeling good today. Everything is going well."
        print(f"Generating TTS for: '{text}'")
        text_to_speech(text, temp_wav)
        
        # 3. Call start conversation
        print("Starting conversation session...")
        res_start = requests.post("http://127.0.0.1:8005/api/conversation/start")
        print("Start conversation response:", res_start.json())
        session_id = res_start.json()["session_id"]
        
        # 4. Call respond
        print("Sending audio to respond endpoint...")
        with open(temp_wav, "rb") as f:
            files = {"file": ("recording.wav", f, "audio/wav")}
            data = {"session_id": session_id}
            res_respond = requests.post("http://127.0.0.1:8005/api/conversation/respond", files=files, data=data)
            
        print("\n=== API RESPOND RESPONSE ===")
        print(res_respond.json())
        print("============================\n")
        
    finally:
        # Kill server
        server_process.terminate()
        server_process.wait()
        print("Backend server terminated.")
        
        # Clean up temp file
        if os.path.exists(temp_wav):
            os.remove(temp_wav)

if __name__ == "__main__":
    test_api()
