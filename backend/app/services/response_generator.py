import os
import json
import logging
import re
import random
from typing import Dict, Any, List, Optional
from dotenv import load_dotenv
from pathlib import Path

env_path = Path(__file__).resolve().parents[3] / ".env"
load_dotenv(dotenv_path=env_path)

from groq import Groq, APIStatusError, APITimeoutError, APIConnectionError, RateLimitError, APIError

logger = logging.getLogger(__name__)

class ResponseGenerator:
    """
    Context-Aware Multimodal Response Generator.
    Responsible for producing empathetic, natural, and tone-matched conversational responses.
    Integrates Groq LLM with rich multimodal context and an intent-aware fallback system.
    """
    def __init__(self):
        self.api_key = os.environ.get("GROQ_API_KEY")
        self.client = None
        self.model = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
        
        if self.api_key:
            try:
                self.client = Groq(api_key=self.api_key)
                logger.info("Groq API client successfully initialized for response generation.")
            except Exception as e:
                logger.error(f"Failed to initialize Groq client: {e}. Defaulting to rule-based fallback.")

    def generate_response(
        self,
        manager_output: Dict[str, Any],
        analysis_result: Optional[Dict[str, Any]] = None,
        history: Optional[List[Dict[str, Any]]] = None
    ) -> Dict[str, Any]:
        """
        Generates context-aware response using Groq LLM, matching the user's semantic intent
        and emotional tone, with robust rule-based fallback.
        """
        state = manager_output.get("conversation_state", "NORMAL")
        requires_safety = manager_output.get("requires_safety_attention", False)
        
        # Silence/unclear states are handled directly by rule-based logic
        if state in ("NO_SPEECH", "UNCLEAR") or not analysis_result:
            return self._generate_rule_based_response(manager_output, analysis_result, history)

        # Dynamic initialization of client if not already done
        if not self.client:
            self.api_key = os.environ.get("GROQ_API_KEY")
            if self.api_key:
                try:
                    self.client = Groq(api_key=self.api_key)
                except Exception as e:
                    logger.error(f"Failed to dynamically initialize Groq client: {e}")

        if not self.client:
            logger.warning("Groq API client not available. Falling back to rule-based response.")
            return self._generate_rule_based_response(manager_output, analysis_result, history)

        transcript = analysis_result.get("transcript", "").strip()
        text_emotions = analysis_result.get("text_emotions") or {}
        voice_emotions = analysis_result.get("voice_emotions")
        text_analysis_out = analysis_result.get("text_analysis_output") or {}
        fusion_metrics = analysis_result.get("fusion_metrics") or {}
        tier = fusion_metrics.get("tier", "LOW")
        final_distress = fusion_metrics.get("final_distress_score", 0.0)

        try:
            # Format history for LLM (bounded to last 4 turns)
            formatted_history = []
            if history:
                bounded_history = history[-4:]
                for turn in bounded_history:
                    u_msg = turn.get("transcript") or turn.get("user_message") or ""
                    a_msg = turn.get("response_text") or ""
                    if u_msg:
                        formatted_history.append({"role": "user", "content": u_msg})
                    if a_msg:
                        formatted_history.append({"role": "assistant", "content": a_msg})

            user_context = {
                "latest_user_message": transcript,
                "detected_emotions": {
                    "text_emotions_7_class": text_emotions,
                    "voice_emotions_4_class": voice_emotions,
                    "semantic_sentiment": text_analysis_out.get("sentiment_score"),
                    "detected_emotion_category": text_analysis_out.get("emotion_category")
                },
                "multimodal_clinical_context": {
                    "conversation_state": state,
                    "distress_score": final_distress,
                    "risk_tier": tier,
                    "requires_safety_attention": requires_safety
                },
                "conversation_history": formatted_history
            }

            system_prompt = (
                "You are an empathetic, warm, and natural conversational companion in a supportive mental health wellness application.\n"
                "Your objective is to produce a genuine, supportive, and emotionally well-matched response to the user's latest statement.\n\n"
                "CRITICAL CONVERSATIONAL RULES:\n"
                "1. ALWAYS RESPOND TO WHAT THE USER ACTUALLY SAID AND FEELS. Do NOT treat every conversation as a mental-health crisis. Do NOT assume the user is sad when they are happy, neutral, angry, or excited.\n"
                "2. POSITIVE / EXCITED / HAPPY (e.g. happy news, trip plans, achievements, celebrating, feeling good):\n"
                "   - Match their positive energy with warmth and genuine enthusiasm!\n"
                "   - Acknowledge and celebrate their specific plans or good news (e.g. \"That sounds wonderful! I'm so happy to hear that you and your friends have a trip to Goa planned.\").\n"
                "   - NEVER inject unprovoked sadness, heavy warnings, or crisis language when the user is sharing positive moments.\n"
                "3. NEUTRAL / INFORMATIONAL / EVERYDAY (e.g. \"I went to college today\", general statements):\n"
                "   - Respond naturally, conversationally, and warmly like a good friend.\n"
                "   - Do NOT assume distress or ask probing questions about hidden sadness.\n"
                "4. SADNESS / LONELINESS / EXHAUSTION / STRUGGLE:\n"
                "   - Respond with gentle, validating empathy and compassionate warmth (\"I'm sorry you're feeling lonely. You don't have to face everything on your own.\").\n"
                "   - You may include a short, comforting quote or motivational line if appropriate.\n"
                "   - Ask a gentle, caring question.\n"
                "5. ANGER / FRUSTRATION:\n"
                "   - Acknowledge and validate their frustration directly (\"It makes complete sense that you'd feel angry about that.\").\n"
                "   - Do NOT misinterpret anger as pure sadness or minimize their feelings.\n"
                "6. FEAR / ANXIETY:\n"
                "   - Provide calming reassurance and a grounding, soothing check-in.\n"
                "7. ACUTE CRISIS / SELF-HARM / SUICIDAL STATEMENTS:\n"
                "   - Prioritize immediate safety, warmth, presence, and connection to trusted contacts and emergency/helpline resources.\n\n"
                "OUTPUT FORMAT:\n"
                "Output ONLY a valid JSON object with exactly two keys:\n"
                "{\n"
                "  \"response_text\": \"<your natural, human conversational response, 2-4 sentences>\",\n"
                "  \"follow_up_question\": \"<a single relevant follow-up question, or empty string if not needed>\"\n"
                "}\n\n"
                "NEVER mention technical jargon like 'Distress Score', 'Risk Tier', 'Wav2Vec2', 'Algorithm', or 'Model'."
            )

            completion = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": json.dumps(user_context)}
                ],
                response_format={"type": "json_object"},
                temperature=0.7,
                timeout=10.0
            )

            response_content = completion.choices[0].message.content
            parsed_response = json.loads(response_content)

            response_text = parsed_response.get("response_text", "").strip()
            follow_up_question = parsed_response.get("follow_up_question", "").strip()

            if not response_text:
                raise ValueError("Groq returned empty response_text.")

            return {
                "response_text": response_text,
                "conversation_state": state,
                "follow_up_question": follow_up_question,
                "safety_attention": requires_safety
            }

        except Exception as e:
            logger.error(f"Groq API call error or validation failure: {e}. Falling back to rule-based response.", exc_info=True)
            return self._generate_rule_based_response(manager_output, analysis_result, history)

    def _generate_rule_based_response(
        self,
        manager_output: Dict[str, Any],
        analysis_result: Optional[Dict[str, Any]] = None,
        history: Optional[List[Dict[str, Any]]] = None
    ) -> Dict[str, Any]:
        """
        Intent-aware fallback generator that respects user's emotional valence and intent.
        """
        suggested_response = manager_output.get("suggested_response", "")
        follow_up = manager_output.get("follow_up_question", "")
        state = manager_output.get("conversation_state", "NORMAL")
        requires_safety = manager_output.get("requires_safety_attention", False)

        if not analysis_result:
            return {
                "response_text": suggested_response or "I'm here to listen. How are you doing today?",
                "conversation_state": state,
                "follow_up_question": follow_up,
                "safety_attention": requires_safety
            }

        transcript = analysis_result.get("transcript", "").strip()
        text_analysis_out = analysis_result.get("text_analysis_output", {}) or {}
        text_emotions = analysis_result.get("text_emotions", {}) or {}
        
        # Check silence/unclear
        if state in ("NO_SPEECH", "UNCLEAR") or not transcript:
            return {
                "response_text": suggested_response or "I didn't quite catch that. Could you say that again?",
                "conversation_state": state,
                "follow_up_question": follow_up,
                "safety_attention": requires_safety
            }

        # 1. ACUTE CRISIS / SELF-HARM
        if requires_safety or re.search(r"\b(suicide|suicidal|end my life|want to die|self-harm|hurt myself|kill myself)\b", transcript, re.IGNORECASE):
            return {
                "response_text": (
                    "I'm really glad you reached out and told me. What you're experiencing sounds incredibly painful, and you don't have to face this moment alone.\n\n"
                    "Let's take this one minute at a time. Please reach out to someone you trust right now—a friend, family member, or counsellor—and let them know you're having a difficult time. "
                    "If you feel you cannot stay safe or might harm yourself, please contact a local crisis helpline or emergency support immediately."
                ),
                "conversation_state": "SEVERE_DISTRESS",
                "follow_up_question": "Is there someone nearby you can reach out to or be with right now?",
                "safety_attention": True
            }

        # 2. POSITIVE / EXCITED / HAPPY
        joy_val = text_emotions.get("Joy", 0.0) if isinstance(text_emotions, dict) else 0.0
        sentiment_val = text_analysis_out.get("sentiment_score", 0.0) if isinstance(text_analysis_out, dict) else 0.0
        is_positive = (
            joy_val > 0.40 or 
            sentiment_val > 0.20 or 
            re.search(r"\b(happy|trip|goa|vacation|excited|celebrat|great|wonderful|awesome|yay|fun|enjoy)\b", transcript, re.IGNORECASE)
        )
        if is_positive:
            pos_responses = [
                ("That sounds wonderful! It's so great to hear that you're feeling happy and have something exciting to look forward to.", "What are you most excited about?"),
                ("That is such great news! I'm really glad things are going well and you're having a positive moment.", "How are your plans coming along?"),
                ("I love hearing that! Enjoying good times with people you care about is so uplifting.", "What are you looking forward to doing most?")
            ]
            resp_txt, q_txt = random.choice(pos_responses)
            return {
                "response_text": resp_txt,
                "conversation_state": "NORMAL",
                "follow_up_question": q_txt,
                "safety_attention": False
            }

        # 3. ANGER / FRUSTRATION
        anger_val = text_emotions.get("Anger", 0.0) if isinstance(text_emotions, dict) else 0.0
        if anger_val > 0.40 or re.search(r"\b(angry|furious|pissed|mad|annoyed|unfair|frustrated)\b", transcript, re.IGNORECASE):
            return {
                "response_text": "I can completely understand why you'd feel angry and frustrated about that. It's completely valid to feel that way when things happen like this.",
                "conversation_state": "HIGH_DISTRESS",
                "follow_up_question": "Would it help to talk about what happened?",
                "safety_attention": False
            }

        # 4. FEAR / ANXIETY
        fear_val = text_emotions.get("Fear", 0.0) if isinstance(text_emotions, dict) else 0.0
        if fear_val > 0.40 or re.search(r"\b(scared|terrified|afraid|panic|anxious|nervous|worry|worried)\b", transcript, re.IGNORECASE):
            return {
                "response_text": "It's completely natural to feel scared when facing uncertainty. Take a slow, gentle breath—you don't have to face everything all at once.",
                "conversation_state": "HIGH_DISTRESS",
                "follow_up_question": "What feels like the most worrying part right now?",
                "safety_attention": False
            }

        # 5. SADNESS / LONELINESS / LOW MOOD
        sad_val = text_emotions.get("Sadness", 0.0) if isinstance(text_emotions, dict) else 0.0
        if sad_val > 0.40 or re.search(r"\b(sad|lonely|alone|hopeless|crying|depressed|unhappy|tired|exhausted)\b", transcript, re.IGNORECASE):
            return {
                "response_text": (
                    "I'm sorry you're feeling this way. Going through difficult moments can feel really heavy, but you don't have to handle everything alone. "
                    "\"Even the hardest days eventually pass, one moment at a time.\""
                ),
                "conversation_state": "HIGH_DISTRESS",
                "follow_up_question": "Is there someone you feel comfortable reaching out to today?",
                "safety_attention": False
            }

        # 6. NEUTRAL / CASUAL
        return {
            "response_text": suggested_response or "Thanks for sharing that with me. I'm here to listen whenever you'd like to talk.",
            "conversation_state": "NORMAL",
            "follow_up_question": follow_up or "How is the rest of your day looking?",
            "safety_attention": False
        }

response_generator = ResponseGenerator()
