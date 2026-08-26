import os
import sys
import re
import pyttsx3
import logging
import wave
import struct

# Ensure workspace is in sys.path
workspace_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if workspace_path not in sys.path:
    sys.path.insert(0, workspace_path)

# Disable excessive logging
logging.getLogger("transformers").setLevel(logging.ERROR)
logging.getLogger("faster_whisper").setLevel(logging.ERROR)

from backend.app.services.speech_emotion import speech_emotion_service
from backend.app.services.speech_to_text import speech_to_text_service
from backend.app.services.text_emotion import text_emotion_service
from backend.app.services.conversation_features import conversation_features_service
from backend.app.services.distress_scorer import distress_scorer_service
from backend.app.services.conversation_manager import conversation_manager
from backend.app.services.response_generator import response_generator

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

# Helper to generate silent audio
def generate_silent_wav(filepath: str, duration_sec: float = 3.0, sr: int = 16000):
    with wave.open(filepath, 'w') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        num_frames = int(duration_sec * sr)
        zero_data = struct.pack('<' + 'h' * num_frames, *([0] * num_frames))
        w.writeframes(zero_data)

def run_scenario(name: str, text: str, is_silence: bool = False):
    temp_wav = os.path.join(workspace_path, f"temp_{name.lower()}.wav")
    try:
        if is_silence:
            generate_silent_wav(temp_wav)
        else:
            text_to_speech(text, temp_wav)
            
        # 1. Speech Emotion
        voice_emotions = speech_emotion_service.predict_emotion(temp_wav)
        
        # 2. Speech to Text
        stt_result = speech_to_text_service.transcribe(temp_wav)
        transcript = stt_result["transcript"]
        segments = stt_result["segments"]
        duration = stt_result["duration"]
        
        # 3. Conversational Features
        text_feats = conversation_features_service.extract_text_features(transcript)
        acoustic_feats = conversation_features_service.extract_acoustic_features(temp_wav)
        vad_metrics = conversation_features_service.extract_vad_metrics(segments, duration)
        speech_state = vad_metrics["speech_state"]
        
        # 4. Text Emotion
        clean_text_check = re.sub(r"[^\w\s]", "", transcript).strip()
        is_text_valid = len(clean_text_check) > 0
        if is_text_valid:
            text_emotions = text_emotion_service.predict_emotion(transcript)
            text_state = "TEXT_EMOTIONS_AVAILABLE"
        else:
            text_emotions = "UNAVAILABLE"
            text_state = "UNAVAILABLE"
            
        # 5. Distress Scorer
        fusion = distress_scorer_service.calculate_score(
            voice_emotions=voice_emotions,
            text_emotions=text_emotions,
            text_features=text_feats,
            acoustic_features=acoustic_feats,
            vad_metrics=vad_metrics,
            speech_state=speech_state
        )
        
        # 6. Conversation Manager
        analysis_result = {
            "transcript": transcript,
            "speech_state": speech_state,
            "text_state": text_state,
            "fusion_metrics": fusion
        }
        manager_decision = conversation_manager.determine_state_and_response(analysis_result)
        
        # 7. Print all intermediate values
        print(f"=== SCENARIO {name} ===")
        print(f"1. transcript: '{transcript}'")
        print(f"2. voice_emotions: {voice_emotions}")
        print(f"3. text_emotions: {text_emotions}")
        print(f"4. filler_count: {text_feats.get('filler_count')}")
        print(f"5. repetition_count: {text_feats.get('repetition_count')}")
        print(f"6. uncertainty_count: {text_feats.get('uncertainty_count')}")
        print(f"7. pause_count: {vad_metrics.get('pause_count')}")
        print(f"8. conversational score: {fusion.get('s_conversational')}")
        print(f"9. D_voice: {fusion.get('d_voice')}")
        print(f"10. D_text: {fusion.get('d_text')}")
        print(f"11. fused emotional score: {fusion.get('s_emotional')}")
        print(f"12. dissonance score: {fusion.get('s_dissonance')}")
        print(f"13. base score: {fusion.get('d_base')}")
        print(f"14. conversational boost: {fusion.get('conversational_boost')}")
        print(f"15. final distress score: {fusion.get('final_distress_score')}")
        print(f"16. final tier: {fusion.get('tier')}")
        print(f"17. ConversationManager state: {manager_decision.get('conversation_state')}")
        print(f"AI Response: '{manager_decision.get('suggested_response')}'")
        print(f"Follow Up: '{manager_decision.get('follow_up_question')}'")
        print("=======================\n")
        
    finally:
        if os.path.exists(temp_wav):
            os.remove(temp_wav)

if __name__ == "__main__":
    # Load all models first
    speech_emotion_service._load_model()
    speech_to_text_service._load_model()
    text_emotion_service._load_model()
    
    run_scenario("A", "I'm feeling good today. Everything is going well.")
    run_scenario("B", "I'm fine... umm... I don't know. I've been worried lately.")
    run_scenario("C", "I'm really scared. I don't feel safe. I don't know what I should do.")
    run_scenario("D", "", is_silence=True)
