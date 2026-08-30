import os
import sys
import unittest
import json
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient

# Ensure workspace is in sys.path
workspace_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if workspace_path not in sys.path:
    sys.path.insert(0, workspace_path)

from backend.app.services.response_generator import ResponseGenerator
from backend.app.main import app
from groq import APITimeoutError, APIConnectionError, RateLimitError, APIStatusError

class TestGroqIntegration(unittest.TestCase):
    def setUp(self):
        # Mock environment variable for Groq API key
        self.env_patcher = patch.dict(os.environ, {"GROQ_API_KEY": "mock-api-key-12345"})
        self.env_patcher.start()
        
    def tearDown(self):
        self.env_patcher.stop()

    def test_initialization_with_key(self):
        """Test initialization when GROQ_API_KEY is present."""
        with patch('backend.app.services.response_generator.Groq') as mock_groq_class:
            generator = ResponseGenerator()
            self.assertEqual(generator.api_key, "mock-api-key-12345")
            mock_groq_class.assert_called_once_with(api_key="mock-api-key-12345")

    def test_initialization_without_key(self):
        """Test initialization when GROQ_API_KEY is missing."""
        with patch.dict(os.environ, {"GROQ_API_KEY": ""}):
            with patch('backend.app.services.response_generator.Groq') as mock_groq_class:
                generator = ResponseGenerator()
                # If initialized with empty key, client remains None.
                self.assertIsNone(generator.client)
                mock_groq_class.assert_not_called()

    def test_missing_api_key_fallback(self):
        """Test that if the API key is missing, it falls back to rule-based response."""
        with patch.dict(os.environ, {"GROQ_API_KEY": ""}):
            # Initialize with no client
            generator = ResponseGenerator()
            generator.client = None
            
            manager_output = {
                "conversation_state": "NORMAL",
                "requires_safety_attention": False,
                "suggested_response": "Default normal response.",
                "follow_up_question": "Default follow-up?"
            }
            analysis_result = {
                "transcript": "Hello",
                "fusion_metrics": {"tier": "LOW", "s_dissonance": 0.0}
            }
            
            res = generator.generate_response(manager_output, analysis_result, [])
            # Assert fallback response is used
            valid_fallbacks = [
                "That's good to hear. It sounds like things are moving along steadily.",
                "Thanks for sharing that. It sounds like things are going pretty smoothly today.",
                "That is wonderful to hear! I'm glad things are going well for you.",
                "That's great to hear. What's been going well for you today?"
            ]
            self.assertIn(res["response_text"], valid_fallbacks)

    def test_groq_success(self):
        """Test successful Groq response generation with proper JSON format."""
        mock_completion = MagicMock()
        mock_completion.choices = [MagicMock()]
        mock_completion.choices[0].message.content = '{"response_text": "I am glad to hear that.", "follow_up_question": "How has the rest of your day been?"}'
        
        with patch('backend.app.services.response_generator.Groq') as mock_groq_class:
            mock_client = MagicMock()
            mock_client.chat.completions.create.return_value = mock_completion
            mock_groq_class.return_value = mock_client
            
            generator = ResponseGenerator()
            
            manager_output = {
                "conversation_state": "NORMAL",
                "requires_safety_attention": False,
                "response_strategy": "Continue positive flow",
                "response_goal": "Maintain rapport"
            }
            analysis_result = {
                "transcript": "Everything is fine",
                "fusion_metrics": {"tier": "LOW", "s_dissonance": 0.0}
            }
            
            res = generator.generate_response(manager_output, analysis_result, [])
            
            self.assertEqual(res["response_text"], "I am glad to hear that.")
            self.assertEqual(res["follow_up_question"], "How has the rest of your day been?")
            self.assertEqual(res["conversation_state"], "NORMAL")
            self.assertFalse(res["safety_attention"])
            mock_client.chat.completions.create.assert_called_once()

    def test_groq_unavailable_timeout_fallback(self):
        """Test fallback when Groq times out (APITimeoutError)."""
        with patch('backend.app.services.response_generator.Groq') as mock_groq_class:
            mock_client = MagicMock()
            mock_client.chat.completions.create.side_effect = APITimeoutError("Request timed out")
            mock_groq_class.return_value = mock_client
            
            generator = ResponseGenerator()
            
            manager_output = {
                "conversation_state": "NORMAL",
                "requires_safety_attention": False,
                "suggested_response": "Rule-based fallback text",
                "follow_up_question": "Rule-based fallback question"
            }
            analysis_result = {
                "transcript": "Hello",
                "fusion_metrics": {"tier": "LOW", "s_dissonance": 0.0}
            }
            
            res = generator.generate_response(manager_output, analysis_result, [])
            self.assertIn("response_text", res)
            self.assertEqual(res["conversation_state"], "NORMAL")

    def test_groq_unavailable_connection_fallback(self):
        """Test fallback when Groq has connection issues (APIConnectionError)."""
        with patch('backend.app.services.response_generator.Groq') as mock_groq_class:
            mock_client = MagicMock()
            mock_client.chat.completions.create.side_effect = APIConnectionError(request=MagicMock())
            mock_groq_class.return_value = mock_client
            
            generator = ResponseGenerator()
            
            manager_output = {
                "conversation_state": "NORMAL",
                "requires_safety_attention": False,
                "suggested_response": "Rule-based fallback text",
                "follow_up_question": "Rule-based fallback question"
            }
            analysis_result = {
                "transcript": "Hello",
                "fusion_metrics": {"tier": "LOW", "s_dissonance": 0.0}
            }
            
            res = generator.generate_response(manager_output, analysis_result, [])
            self.assertIn("response_text", res)

    def test_malformed_groq_response_fallback(self):
        """Test fallback when Groq returns malformed JSON or empty response_text."""
        mock_completion = MagicMock()
        mock_completion.choices = [MagicMock()]
        
        with patch('backend.app.services.response_generator.Groq') as mock_groq_class:
            mock_client = MagicMock()
            mock_groq_class.return_value = mock_client
            generator = ResponseGenerator()
            
            manager_output = {
                "conversation_state": "NORMAL",
                "requires_safety_attention": False,
                "suggested_response": "Rule-based fallback text",
                "follow_up_question": "Rule-based fallback question"
            }
            analysis_result = {
                "transcript": "Hello",
                "fusion_metrics": {"tier": "LOW", "s_dissonance": 0.0}
            }
            
            # Case 1: Malformed JSON
            mock_completion.choices[0].message.content = '{"response_text": "I am ok", "follow_up_question": ' # missing ending
            mock_client.chat.completions.create.return_value = mock_completion
            res = generator.generate_response(manager_output, analysis_result, [])
            self.assertIn(res["response_text"], [
                "That's good to hear. It sounds like things are moving along steadily.",
                "Thanks for sharing that. It sounds like things are going pretty smoothly today.",
                "That is wonderful to hear! I'm glad things are going well for you.",
                "That's great to hear. What's been going well for you today?"
            ])
            
            # Case 2: Empty response_text
            mock_completion.choices[0].message.content = '{"response_text": "", "follow_up_question": "How are you?"}'
            res = generator.generate_response(manager_output, analysis_result, [])
            self.assertIn(res["response_text"], [
                "That's good to hear. It sounds like things are moving along steadily.",
                "Thanks for sharing that. It sounds like things are going pretty smoothly today.",
                "That is wonderful to hear! I'm glad things are going well for you.",
                "That's great to hear. What's been going well for you today?"
            ])

    def test_normal_conversation_scenario(self):
        """Test that the system prompt & user context are correctly formulated for NORMAL state."""
        mock_completion = MagicMock()
        mock_completion.choices = [MagicMock()]
        mock_completion.choices[0].message.content = '{"response_text": "Sounds good.", "follow_up_question": "What is next?"}'
        
        with patch('backend.app.services.response_generator.Groq') as mock_groq_class:
            mock_client = MagicMock()
            mock_client.chat.completions.create.return_value = mock_completion
            mock_groq_class.return_value = mock_client
            
            generator = ResponseGenerator()
            
            manager_output = {
                "conversation_state": "NORMAL",
                "requires_safety_attention": False,
                "response_strategy": "Be pleasant",
                "response_goal": "Keep chatting"
            }
            analysis_result = {
                "transcript": "I had a great day today!",
                "fusion_metrics": {"tier": "LOW", "s_dissonance": 0.0}
            }
            
            res = generator.generate_response(manager_output, analysis_result, [])
            
            # Verify API call details
            call_args = mock_client.chat.completions.create.call_args[1]
            messages = call_args["messages"]
            system_msg = messages[0]["content"]
            user_msg = json.loads(messages[1]["content"])
            
            self.assertEqual(user_msg["safety_instructions"]["conversation_state"], "NORMAL")
            self.assertFalse(user_msg["safety_instructions"]["requires_safety_attention"])
            self.assertFalse(user_msg["safety_instructions"]["is_recovery_transition"])
            self.assertEqual(user_msg["latest_patient_statement"], "I had a great day today!")
            self.assertIn("NORMAL/positive", system_msg)

    def test_mild_distress_scenario(self):
        """Test user context formulation for MILD_DISTRESS state."""
        mock_completion = MagicMock()
        mock_completion.choices = [MagicMock()]
        mock_completion.choices[0].message.content = '{"response_text": "I hear you.", "follow_up_question": "What is on your mind?"}'
        
        with patch('backend.app.services.response_generator.Groq') as mock_groq_class:
            mock_client = MagicMock()
            mock_client.chat.completions.create.return_value = mock_completion
            mock_groq_class.return_value = mock_client
            
            generator = ResponseGenerator()
            
            manager_output = {
                "conversation_state": "MILD_DISTRESS",
                "requires_safety_attention": False,
                "response_strategy": "Empathize",
                "response_goal": "Help explore"
            }
            analysis_result = {
                "transcript": "I am feeling a bit down",
                "fusion_metrics": {"tier": "MILD", "s_dissonance": 0.1}
            }
            
            res = generator.generate_response(manager_output, analysis_result, [])
            
            call_args = mock_client.chat.completions.create.call_args[1]
            user_msg = json.loads(call_args["messages"][1]["content"])
            self.assertEqual(user_msg["safety_instructions"]["conversation_state"], "MILD_DISTRESS")

    def test_high_distress_scenario(self):
        """Test user context formulation for HIGH_DISTRESS state."""
        mock_completion = MagicMock()
        mock_completion.choices = [MagicMock()]
        mock_completion.choices[0].message.content = '{"response_text": "I am so sorry you are going through this.", "follow_up_question": "How can I support you?"}'
        
        with patch('backend.app.services.response_generator.Groq') as mock_groq_class:
            mock_client = MagicMock()
            mock_client.chat.completions.create.return_value = mock_completion
            mock_groq_class.return_value = mock_client
            
            generator = ResponseGenerator()
            
            manager_output = {
                "conversation_state": "HIGH_DISTRESS",
                "requires_safety_attention": False,
                "response_strategy": "Immediate calm and validate",
                "response_goal": "Keep safe"
            }
            analysis_result = {
                "transcript": "Everything is falling apart",
                "fusion_metrics": {"tier": "HIGH", "s_dissonance": 0.0}
            }
            
            res = generator.generate_response(manager_output, analysis_result, [])
            
            call_args = mock_client.chat.completions.create.call_args[1]
            user_msg = json.loads(call_args["messages"][1]["content"])
            self.assertEqual(user_msg["safety_instructions"]["conversation_state"], "HIGH_DISTRESS")

    def test_safety_scenario(self):
        """Test user context formulation when requires_safety_attention is True."""
        mock_completion = MagicMock()
        mock_completion.choices = [MagicMock()]
        mock_completion.choices[0].message.content = '{"response_text": "Please consider reaching out to a support line.", "follow_up_question": "Would you like some resources?"}'
        
        with patch('backend.app.services.response_generator.Groq') as mock_groq_class:
            mock_client = MagicMock()
            mock_client.chat.completions.create.return_value = mock_completion
            mock_groq_class.return_value = mock_client
            
            generator = ResponseGenerator()
            
            manager_output = {
                "conversation_state": "SEVERE_DISTRESS",
                "requires_safety_attention": True,
                "response_strategy": "Calm safety-oriented language",
                "response_goal": "Provide crisis resources"
            }
            analysis_result = {
                "transcript": "I feel hopeless and suicidal",
                "fusion_metrics": {"tier": "SEVERE", "s_dissonance": 0.0}
            }
            
            res = generator.generate_response(manager_output, analysis_result, [])
            
            call_args = mock_client.chat.completions.create.call_args[1]
            user_msg = json.loads(call_args["messages"][1]["content"])
            self.assertEqual(user_msg["safety_instructions"]["conversation_state"], "SEVERE_DISTRESS")
            self.assertTrue(user_msg["safety_instructions"]["requires_safety_attention"])

    def test_recovery_scenario(self):
        """Test transition from distress back to normal (recovery)."""
        mock_completion = MagicMock()
        mock_completion.choices = [MagicMock()]
        mock_completion.choices[0].message.content = '{"response_text": "I am so glad to hear you are feeling better.", "follow_up_question": ""}'
        
        with patch('backend.app.services.response_generator.Groq') as mock_groq_class:
            mock_client = MagicMock()
            mock_client.chat.completions.create.return_value = mock_completion
            mock_groq_class.return_value = mock_client
            
            generator = ResponseGenerator()
            
            manager_output = {
                "conversation_state": "NORMAL",
                "requires_safety_attention": False,
                "response_strategy": "Maintain normal rapport",
                "response_goal": "Check-in gently"
            }
            analysis_result = {
                "transcript": "I'm feeling much better today actually.",
                "fusion_metrics": {"tier": "LOW", "s_dissonance": 0.0}
            }
            # History indicating previous turn was HIGH_DISTRESS
            history = [
                {
                    "transcript": "I am feeling awful",
                    "response_text": "I am sorry.",
                    "follow_up_question": "What happened?",
                    "conversation_state": "HIGH_DISTRESS"
                }
            ]
            
            res = generator.generate_response(manager_output, analysis_result, history)
            
            call_args = mock_client.chat.completions.create.call_args[1]
            user_msg = json.loads(call_args["messages"][1]["content"])
            self.assertEqual(user_msg["safety_instructions"]["conversation_state"], "NORMAL")
            self.assertTrue(user_msg["safety_instructions"]["is_recovery_transition"])

    def test_multi_turn_context_and_bounding(self):
        """Test that history context is bounded to the last 4 turns."""
        mock_completion = MagicMock()
        mock_completion.choices = [MagicMock()]
        mock_completion.choices[0].message.content = '{"response_text": "Acknowledged.", "follow_up_question": ""}'
        
        with patch('backend.app.services.response_generator.Groq') as mock_groq_class:
            mock_client = MagicMock()
            mock_client.chat.completions.create.return_value = mock_completion
            mock_groq_class.return_value = mock_client
            
            generator = ResponseGenerator()
            
            manager_output = {
                "conversation_state": "NORMAL",
                "requires_safety_attention": False
            }
            analysis_result = {
                "transcript": "Latest statement",
                "fusion_metrics": {"tier": "LOW", "s_dissonance": 0.0}
            }
            # Create a 6-turn history
            history = []
            for i in range(6):
                history.append({
                    "transcript": f"User turn {i}",
                    "response_text": f"Assistant turn {i}",
                    "follow_up_question": f"Question {i}",
                    "conversation_state": "NORMAL"
                })
                
            res = generator.generate_response(manager_output, analysis_result, history)
            
            call_args = mock_client.chat.completions.create.call_args[1]
            user_msg = json.loads(call_args["messages"][1]["content"])
            conv_history = user_msg["conversation_history"]
            
            # Since each turn is represented as user message followed by assistant message:
            # Last 4 turns * 2 = 8 messages
            self.assertEqual(len(conv_history), 8)
            # Verify the first message in the history is indeed from Turn 2 (index 2 of history)
            self.assertEqual(conv_history[0]["content"], "User turn 2")

    def test_existing_api_response_contract_fastapi(self):
        """Test API contract via FastAPI TestClient with mocked Groq to prevent actual API calls."""
        # Setup TestClient with mock response
        mock_completion = MagicMock()
        mock_completion.choices = [MagicMock()]
        mock_completion.choices[0].message.content = '{"response_text": "Mock response from Groq.", "follow_up_question": "Does that make sense?"}'
        
        # Create silent dummy wave file for client post
        import tempfile
        import wave
        import struct
        
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            temp_wav_path = f.name
            with wave.open(temp_wav_path, 'wb') as w:
                w.setnchannels(1)
                w.setsampwidth(2)
                w.setframerate(16000)
                num_frames = int(1.0 * 16000)
                zero_data = struct.pack('<' + 'h' * num_frames, *([0] * num_frames))
                w.writeframes(zero_data)
                
        try:
            # We mock 'response_generator.client' directly and make sure it doesn't try calling real API
            with patch('backend.app.services.response_generator.response_generator.client') as mock_client:
                mock_client.chat.completions.create.return_value = mock_completion
                
                # Mock speech emotion & Whisper STT to avoid slow downloads/heavy model runs in test
                with patch('backend.app.main.speech_emotion_service.predict_emotion') as mock_speech_emotion, \
                     patch('backend.app.main.speech_to_text_service.transcribe') as mock_stt, \
                     patch('backend.app.main.text_emotion_service.predict_emotion') as mock_text_emotion:
                     
                    mock_speech_emotion.return_value = {"Neutral": 0.9, "Happy": 0.1}
                    mock_stt.return_value = {
                        "transcript": "I am feeling good today.",
                        "segments": [{"start": 0.0, "end": 1.0, "text": "I am feeling good today."}],
                        "duration": 1.0
                    }
                    mock_text_emotion.return_value = {"Joy": 0.9}
                    
                    client = TestClient(app)
                    
                    session_id = None
                    try:
                        # 1. Start session
                        res_start = client.post("/api/conversation/start")
                        self.assertEqual(res_start.status_code, 201)
                        session_id = res_start.json()["session_id"]
                        
                        # 2. Call respond
                        with open(temp_wav_path, "rb") as audio_file:
                            res_respond = client.post(
                                "/api/conversation/respond",
                                files={"file": ("recording.wav", audio_file, "audio/wav")},
                                data={"session_id": session_id}
                            )
                            
                        self.assertEqual(res_respond.status_code, 200)
                        resp_json = res_respond.json()
                        
                        # Assert schema and exact keys (excluding restricted metrics)
                        expected_keys = {"session_id", "turn_number", "transcript", "response_text", "follow_up_question"}
                        self.assertEqual(set(resp_json.keys()), expected_keys)
                        self.assertEqual(resp_json["session_id"], session_id)
                        self.assertEqual(resp_json["turn_number"], 1)
                        self.assertEqual(resp_json["transcript"], "I am feeling good today.")
                        self.assertEqual(resp_json["response_text"], "Mock response from Groq.")
                        self.assertEqual(resp_json["follow_up_question"], "Does that make sense?")
                    finally:
                        if session_id:
                            from backend.app.services.conversation_session import conversation_session_manager
                            conversation_session_manager.delete_session_permanently(session_id)
                    
        finally:
            if os.path.exists(temp_wav_path):
                os.remove(temp_wav_path)

if __name__ == '__main__':
    unittest.main()
