import os
import json
import logging
import re
import random
from typing import Dict, Any, List, Optional
from dotenv import load_dotenv
from groq import Groq, APIStatusError, APITimeoutError, APIConnectionError, RateLimitError, APIError

# Load environment variables
load_dotenv()

logger = logging.getLogger(__name__)

class ResponseGenerator:
    """
    Production-ready Response Generator.
    Responsible for generating the final response text and follow-up question.
    Now integrates with Groq API, with a robust rule-based fallback mechanism.
    """
    def __init__(self):
        # Retrieve the API key
        self.api_key = os.environ.get("GROQ_API_KEY")
        self.client = None
        self.model = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
        
        if self.api_key:
            try:
                self.client = Groq(api_key=self.api_key)
                logger.info("Groq API client successfully initialized.")
            except Exception as e:
                logger.error(f"Failed to initialize Groq client: {e}. Defaulting to rule-based fallback.")
        else:
            logger.warning("GROQ_API_KEY environment variable not found. Defaulting to rule-based response generation.")

    def generate_response(self, manager_output: Dict[str, Any], analysis_result: Optional[Dict[str, Any]] = None, history: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
        """
        Generates response using Groq API if available, otherwise falls back to rule-based logic.
        """
        state = manager_output.get("conversation_state", "NORMAL")
        
        # Silence/unclear states or missing analysis result are handled directly by rule-based logic
        if state in ("NO_SPEECH", "UNCLEAR") or not analysis_result:
            return self._generate_rule_based_response(manager_output, analysis_result, history)

        # Dynamic initialization of client if not already done (e.g. environment variable was set later)
        if not self.client:
            self.api_key = os.environ.get("GROQ_API_KEY")
            if self.api_key:
                try:
                    self.client = Groq(api_key=self.api_key)
                    logger.info("Groq API client dynamically initialized.")
                except Exception as e:
                    logger.error(f"Failed to dynamically initialize Groq client: {e}")

        if not self.client:
            logger.warning("Groq API client is not initialized due to missing GROQ_API_KEY. Falling back to rule-based response.")
            return self._generate_rule_based_response(manager_output, analysis_result, history)

        # Formulate Groq prompt and call the API
        response_content = ""
        try:
            # Determine if this is a recovery transition
            last_state = "NORMAL"
            if history:
                for turn in reversed(history):
                    prev_state = turn.get("conversation_state", "NORMAL")
                    if prev_state not in ("NO_SPEECH", "UNCLEAR"):
                        last_state = prev_state
                        break
            
            is_recovery_transition = (
                last_state in ("SEVERE_DISTRESS", "HIGH_DISTRESS", "MODERATE_DISTRESS") 
                and state == "NORMAL"
            )

            # Format history for LLM (bounded to last 4 turns)
            formatted_history = []
            if history:
                bounded_history = history[-4:]
                for turn in bounded_history:
                    formatted_history.append({
                        "role": "user",
                        "content": turn.get("transcript", "")
                    })
                    formatted_history.append({
                        "role": "assistant",
                        "content": f"{turn.get('response_text', '')} {turn.get('follow_up_question', '')}".strip()
                    })

            # Extract current session state details
            transcript = analysis_result.get("transcript", "").strip()
            requires_safety = manager_output.get("requires_safety_attention", False)
            strategy = manager_output.get("response_strategy", "")
            goal = manager_output.get("response_goal", "")

            # Formulate user context dictionary (excluding raw ML details to protect privacy)
            user_context = {
                "safety_instructions": {
                    "conversation_state": state,
                    "requires_safety_attention": requires_safety,
                    "is_recovery_transition": is_recovery_transition,
                    "strategy_guideline": strategy,
                    "response_goal": goal
                },
                "conversation_history": formatted_history,
                "latest_patient_statement": transcript
            }

            system_prompt = (
                "You are an empathetic, warm, and comforting first-line conversational companion for a mental health wellness application.\n"
                "Your role is to respond naturally, supportively, and humanely to the user's latest statement, using the conversation context and safety instructions.\n\n"
                "CORE PERSONA & CONSTRAINTS:\n"
                "1. Speak like a caring, authentic human companion—warm, calm, non-judgmental, and encouraging.\n"
                "2. NEVER sound like a cold medical report, an automated warning system, or a repetitive chatbot.\n"
                "3. NEVER diagnose, prescribe, or use clinical/technical jargon (never say 'distress score', 'risk tier', 'assessment', 'symptoms', 'baseline', 'algorithm', or 'protocol').\n"
                "4. Do NOT claim to be a doctor, psychiatrist, or emergency operator.\n"
                "5. Never promise absolute certainties you cannot know (avoid 'Everything will definitely be okay' or 'I know exactly how you feel'). Instead use grounding reassurance ('Things can change', 'You don't have to carry this all at once', 'I'm right here with you').\n"
                "6. Always respond directly to the actual situation/content the user describes (e.g., fight with parents, exam pressure, exhaustion, loneliness).\n"
                "7. Ask at most ONE gentle follow-up question across the entire turn (or leave follow_up_question empty if not needed).\n"
                "8. Output valid JSON with exactly two keys:\n"
                "   {\n"
                "     \"response_text\": \"<your warm main response, split into natural paragraphs>\",\n"
                "     \"follow_up_question\": \"<your single gentle question or empty string>\"\n"
                "   }\n\n"
                "SITUATION-SPECIFIC GUIDELINES:\n\n"
                "A. HIGH OR SEVERE DISTRESS (User feels overwhelmed, hopeless, exhausted, or unable to cope):\n"
                "Follow this 5-Step Empathetic Architecture across 2-3 readable paragraphs (5-8 short sentences total):\n"
                "• Step 1 (Acknowledge): Validate their specific emotional pain with deep, genuine empathy ('That sounds really heavy, and I'm glad you told me about it.').\n"
                "• Step 2 (Emotional Reassurance): Relieve immediate pressure and ground them in the moment ('You don't have to figure everything out tonight. Let's take this one small moment at a time.').\n"
                "• Step 3 (Short Encouraging Line/Quote): Include a meaningful, gentle motivational line or quote (e.g., '\"Even the darkest night will end and the sun will rise.\"', '\"Storms don't last forever.\"', '\"One small step is still progress.\"', or '\"This moment is difficult, but it is not your entire story.\"').\n"
                "• Step 4 (Keep Conversation Open): Provide calm accompaniment and invite them to share more gently ('I'm here with you. What's been weighing on you the most?').\n"
                "• Step 5 (Encourage Human Connection): Warmly recommend reaching out to a trusted loved one or counsellor as additional support, so they don't carry this alone ('And because you're going through such a heavy moment, please consider reaching out to someone you trust and letting them be with you through this.').\n\n"
                "B. VERY SERIOUS CRISIS / IMMEDIATE HARM (requires_safety_attention is True or explicit self-harm/suicidal thoughts):\n"
                "Prioritize safety with deep human warmth and connection (Empathy + Immediate Grounding + Safety Guidance):\n"
                "• Validate their immense pain with warmth ('I'm really glad you told me. What you're experiencing sounds incredibly painful, and you don't have to face this alone.').\n"
                "• Ground them in the present minute ('Let's take this one minute at a time.').\n"
                "• Provide clear, gentle safety guidance ('Please move closer to or reach out to someone you trust right now and let them know you're struggling. If you feel that you cannot stay safe or might harm yourself, please contact a local crisis helpline or emergency support immediately.').\n"
                "• Offer continued presence ('I am here to keep talking with you while you take that step.').\n"
                "• Do not use empty inspirational quotes in acute crisis; focus purely on safety, presence, and immediate human connection.\n\n"
                "C. MODERATE OR MILD DISTRESS (Stress, anxiety, feeling tired or pressured):\n"
                "• Acknowledge what they shared with active listening.\n"
                "• Offer small encouragement and a gentle, practical coping suggestion (e.g., taking a slow breath, stepping away for two minutes, giving themselves some space).\n"
                "• You may include a short comforting thought ('\"Small steps still move you forward.\"').\n"
                "• Ask ONE open question to help them process their thoughts.\n"
                "• Do NOT tell every moderately stressed person to contact emergency services.\n"
                "• Length: 3-5 sentences.\n\n"
                "D. POSITIVE RECOVERY / USER SAYS 'I'M GOOD' OR 'FEELING BETTER' (is_recovery_transition is True or user feels relieved):\n"
                "• Acknowledge the positive shift with warmth and relief ('I'm really glad to hear you're feeling a little better. Sometimes even a small shift can make a heavy day feel lighter.').\n"
                "• Encourage them to enjoy this lighter moment, while letting them know you're here if things ever feel heavy again.\n"
                "• Ask a natural question about what helped ('What helped you feel a little better?').\n"
                "• Do NOT act suspicious or give unwanted warnings.\n\n"
                "E. NORMAL / GENERAL CONVERSATION:\n"
                "• Respond conversationally, warmly, and engagingly (2-4 sentences).\n"
                "• Ask an upbeat or curious question (e.g., 'What has been the highlight of your day so far?').\n"
            )

            # Query Groq API with timeout and JSON mode
            completion = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": json.dumps(user_context)}
                ],
                response_format={"type": "json_object"},
                timeout=5.0
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

        except APITimeoutError as e:
            logger.error(f"Groq API timeout error (5s limit reached): {e}. Falling back to rule-based response.")
            return self._generate_rule_based_response(manager_output, analysis_result, history)
        except APIConnectionError as e:
            logger.error(f"Groq API connection/network error: {e}. Falling back to rule-based response.")
            return self._generate_rule_based_response(manager_output, analysis_result, history)
        except RateLimitError as e:
            logger.error(f"Groq API rate limit error: {e}. Falling back to rule-based response.")
            return self._generate_rule_based_response(manager_output, analysis_result, history)
        except APIStatusError as e:
            logger.error(f"Groq API status error (status_code={e.status_code}): {e}. Falling back to rule-based response.")
            return self._generate_rule_based_response(manager_output, analysis_result, history)
        except APIError as e:
            logger.error(f"Groq API general error: {e}. Falling back to rule-based response.")
            return self._generate_rule_based_response(manager_output, analysis_result, history)
        except json.JSONDecodeError as e:
            logger.error(f"Groq returned malformed JSON: {e}. Output was: {response_content}. Falling back to rule-based response.")
            return self._generate_rule_based_response(manager_output, analysis_result, history)
        except ValueError as e:
            logger.error(f"Groq response validation error: {e}. Falling back to rule-based response.")
            return self._generate_rule_based_response(manager_output, analysis_result, history)
        except Exception as e:
            logger.error(f"Unexpected error during Groq API call or response handling: {e}. Falling back to rule-based response.", exc_info=True)
            return self._generate_rule_based_response(manager_output, analysis_result, history)

    def _generate_rule_based_response(self, manager_output: Dict[str, Any], analysis_result: Optional[Dict[str, Any]] = None, history: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
        """
        Empathetic rule-based fallback adhering to the 5-step conversational support framework.
        """
        suggested_response = manager_output.get("suggested_response", "")
        follow_up = manager_output.get("follow_up_question", "")
        state = manager_output.get("conversation_state", "NORMAL")
        requires_safety = manager_output.get("requires_safety_attention", False)
        
        if not analysis_result:
            return {
                "response_text": suggested_response,
                "conversation_state": state,
                "follow_up_question": follow_up,
                "safety_attention": requires_safety
            }
            
        transcript = analysis_result.get("transcript", "").strip()
        fusion = analysis_result.get("fusion_metrics", {})
        dissonance = fusion.get("s_dissonance", 0.0)
        
        # Retrieve last active state from history
        last_state = "NORMAL"
        if history:
            for turn in reversed(history):
                prev_state = turn.get("conversation_state", "NORMAL")
                if prev_state not in ("NO_SPEECH", "UNCLEAR"):
                    last_state = prev_state
                    break

        # Handle silence or unclear inputs directly
        if state in ("NO_SPEECH", "UNCLEAR"):
            return {
                "response_text": suggested_response,
                "conversation_state": state,
                "follow_up_question": follow_up,
                "safety_attention": requires_safety
            }

        # 1. ACUTE CRISIS / SEVERE DISTRESS / EXPLICIT SAFETY
        is_high_safety = (state == "HIGH_DISTRESS" and re.search(r"\b(hopeless|give up|can't go on|cannot go on)\b", transcript, re.IGNORECASE))
        if state == "SEVERE_DISTRESS" or requires_safety or is_high_safety:
            if re.search(r"\b(suicide|suicidal|end my life|want to die|self-harm|hurt myself)\b", transcript, re.IGNORECASE):
                response_text = (
                    "I'm really glad you told me. What you're going through sounds incredibly painful, and you don't have to face this moment alone.\n\n"
                    "Let's take this one minute at a time. Please move closer to or contact someone you trust right now and let them know you're having a difficult time. "
                    "If you feel that you cannot stay safe or might harm yourself, please reach out to a local crisis helpline or emergency support immediately.\n\n"
                    "I'm here to keep talking with you while you take that step."
                )
                follow_up_question = "Is there someone nearby you can reach out to or stay with right now?"
            else:
                response_text = (
                    "I can hear how overwhelmed and exhausted you are, and I'm really glad you reached out.\n\n"
                    "You don't have to solve everything tonight. Let's focus only on getting through this moment together. "
                    "\"This moment is difficult, but it is not your entire story.\"\n\n"
                    "Please consider reaching out to someone you trust—a friend, family member, or counsellor—so they can be with you through this."
                )
                follow_up_question = "I'm right here with you. What has been weighing on you the most?"

        # 2. HIGH DISTRESS (5-Step Empathetic Architecture)
        elif state == "HIGH_DISTRESS":
            high_responses = [
                (
                    "That sounds really heavy, and I'm so glad you shared this with me.\n\n"
                    "You don't have to figure everything out at once. Let's take this one small step at a time. "
                    "\"Storms don't last forever.\"\n\n"
                    "And because you're carrying such a heavy load right now, please consider letting someone you trust know how you're feeling so you have their support too.",
                    "What's the hardest part of this moment for you right now?"
                ),
                (
                    "I can hear how much pain and pressure you're dealing with right now.\n\n"
                    "You've been carrying a tremendous amount, but one difficult moment doesn't define your whole path. "
                    "\"Even the darkest night will end and the sun will rise.\"\n\n"
                    "Take a gentle, slow breath with me. If you can, reach out to a close friend or your counsellor so you don't have to face this alone.",
                    "What happened today that made things feel so overwhelming?"
                ),
                (
                    "I'm really sorry you're carrying this much right now, but you made a good choice by talking about it instead of keeping it all inside.\n\n"
                    "You don't have to fix everything today. Let's just focus on getting through right now. "
                    "\"One step at a time is still forward.\"\n\n"
                    "Please remember that having a trusted person beside you can make a big difference.",
                    "Would you like to tell me more about what's feeling most challenging?"
                )
            ]
            last_resp = history[-1].get("response_text", "") if history else ""
            valid_options = [r for r in high_responses if r[0] != last_resp]
            response_text, follow_up_question = random.choice(valid_options if valid_options else high_responses)

        # 3. MODERATE DISTRESS
        elif state == "MODERATE_DISTRESS":
            has_fine = re.search(r"\b(fine|okay|ok|good|well)\b", transcript, re.IGNORECASE)
            has_worry = re.search(r"\b(worry|worried|stress|stressed|anxious|tired|struggle|struggling|exhausted)\b", transcript, re.IGNORECASE)
            
            if has_fine and has_worry:
                response_text = (
                    "It sounds like you're trying really hard to stay strong, even while carrying a lot underneath.\n\n"
                    "Give yourself permission to pause and breathe. \"Small steps still move you forward.\""
                )
                follow_up_question = "What's been worrying you the most lately?"
            elif isinstance(dissonance, float) and dissonance >= 0.20:
                response_text = (
                    "You mentioned you're doing okay, but it sounds like there might be some heavy thoughts on your mind. "
                    "I'm here to listen without any pressure."
                )
                follow_up_question = "Would you like to share what is on your mind?"
            else:
                mod_responses = [
                    (
                        "It sounds like things have been pretty overwhelming lately.\n\n"
                        "You don't have to fix everything at once. Try stepping away for a couple of minutes, take a few slow breaths, and give yourself a little space. "
                        "\"One small step is still progress.\"",
                        "What has been bothering you the most today?"
                    ),
                    (
                        "It makes complete sense that you'd feel stressed when dealing with so much.\n\n"
                        "Remember to be gentle with yourself today. Even taking a brief pause to rest can help reset your thoughts. "
                        "\"You deserve a little kindness from yourself today.\"",
                        "Would you like to talk a bit more about what's been on your mind?"
                    )
                ]
                last_resp = history[-1].get("response_text", "") if history else ""
                valid_options = [r for r in mod_responses if r[0] != last_resp]
                response_text, follow_up_question = random.choice(valid_options if valid_options else mod_responses)

        # 4. MILD DISTRESS
        elif state == "MILD_DISTRESS":
            mild_responses = [
                (
                    "It sounds like things have been a little tense or uncertain recently. It's completely natural to have days like this.\n\n"
                    "Taking a short walk or a quiet moment for yourself can help bring back a little calm.",
                    "What has been on your mind the most today?"
                ),
                (
                    "I hear that you're feeling a bit drained or out of rhythm today. It's completely okay not to be at one hundred percent all the time.",
                    "Is there something small and relaxing you can do for yourself today?"
                )
            ]
            last_resp = history[-1].get("response_text", "") if history else ""
            valid_options = [r for r in mild_responses if r[0] != last_resp]
            response_text, follow_up_question = random.choice(valid_options if valid_options else mild_responses)

        # 5. NORMAL / POSITIVE / RECOVERY TRANSITION
        else:
            if last_state in ("SEVERE_DISTRESS", "HIGH_DISTRESS", "MODERATE_DISTRESS"):
                recovery_responses = [
                    (
                        "I'm really glad to hear you're feeling better.\n\n"
                        "Sometimes even a small shift can make a difficult day feel a little lighter. Enjoy this moment, and remember that you don't have to handle everything alone if things become heavy again.",
                        "What helped you feel better?"
                    ),
                    (
                        "That is so heartening to hear. I'm really glad things are feeling more peaceful for you right now.\n\n"
                        "Hold on to that feeling, and take things at your own pace.",
                        "What are you looking forward to doing with the rest of your day?"
                    )
                ]
                last_resp = history[-1].get("response_text", "") if history else ""
                valid_options = [r for r in recovery_responses if r[0] != last_resp]
                response_text, follow_up_question = random.choice(valid_options if valid_options else recovery_responses)
            else:
                if re.search(r"\b(good|great|well|fine|happy|perfect|normal|nice|wonderful)\b", transcript, re.IGNORECASE):
                    normal_responses = [
                        (
                            "That's really nice to hear! 😊 Hold on to that feeling for a little while.",
                            "What made today better for you?"
                        ),
                        (
                            "I'm glad to hear you're doing well! It's always great when a day goes smoothly.",
                            "What has been the highlight of your day so far?"
                        )
                    ]
                else:
                    normal_responses = [
                        (
                            "Thanks for sharing that with me. It sounds like things are moving along steadily.",
                            "What's on your mind or on your schedule for the rest of the day?"
                        ),
                        (
                            "I'm glad we're checking in today. It's nice to take a moment to reflect.",
                            "How are you feeling about the rest of your week?"
                        )
                    ]
                last_resp = history[-1].get("response_text", "") if history else ""
                valid_options = [r for r in normal_responses if r[0] != last_resp]
                response_text, follow_up_question = random.choice(valid_options if valid_options else normal_responses)

        return {
            "response_text": response_text,
            "conversation_state": state,
            "follow_up_question": follow_up_question,
            "safety_attention": requires_safety
        }

# Singleton instance for application reuse
response_generator = ResponseGenerator()
