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
        self.model = "openai/gpt-oss-120b"
        
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
                "You are an empathetic, supportive, and non-judgmental conversational assistant for a mental health voice application.\n"
                "Your role is to generate a natural, supportive response to the user's latest statement, using the provided conversation history and safety instructions.\n\n"
                "Strict Constraints:\n"
                "1. NEVER diagnose the user or offer clinical/medical advice.\n"
                "2. Do NOT claim to be a doctor, therapist, counselor, or emergency service.\n"
                "3. Do NOT mention any internal scores, distress tiers, probabilities, or safety categories/flags.\n"
                "4. Keep your response concise (1-3 sentences).\n"
                "5. Always ask at most ONE question in the entire response, or leave the follow_up_question empty if not appropriate.\n"
                "6. Avoid clinical or technical phrases such as 'comfortable baseline', 'distress level', 'emotional state', 'risk', 'assessment', or 'symptoms'. Speak naturally like a human, not a clinician.\n"
                "7. Do not repeat the same question structure across turns.\n"
                "8. Return your response in JSON format containing exactly these two keys:\n"
                "   {\n"
                "     \"response_text\": \"<your response text>\",\n"
                "     \"follow_up_question\": \"<your single follow-up question or empty string>\"\n"
                "   }\n\n"
                "Tone & Response Guidelines based on the current context:\n"
                "- If the user's state is NORMAL/positive (and they are not in recovery):\n"
                "  Respond naturally and positively without unnecessarily mentioning mental health, distress, or copy-pasted clichés.\n"
                "- If the user's state is MILD_DISTRESS or MODERATE_DISTRESS:\n"
                "  Prioritize empathy, active listening, and exploration. Avoid forced positivity or generic motivational cliches.\n"
                "- If the user's state is HIGH_DISTRESS or SEVERE_DISTRESS:\n"
                "  Use calm, validating language and focus on immediate support.\n"
                "- If the user is transitioning/recovering (is_recovery_transition is True or reports feeling better):\n"
                "  Acknowledge the improvement naturally. For example: 'I'm glad you're feeling a little better. It sounds like talking about it helped.' and ask a natural question like 'What would you like to do now?' rather than continuing to treat them as distressed.\n"
                "- If safety attention is required (requires_safety_attention is True):\n"
                "  Generate calm, safety-oriented language. Encourage reaching out to trusted people or appropriate crisis resources (e.g. helplines) when appropriate. Do not diagnose or pretend to be an emergency service.\n"
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
        Processes ConversationManager output and structures the final response.
        
        Args:
            manager_output: Output dictionary from ConversationManager.
            analysis_result: Current turn pipeline analysis result dict.
            history: List of previous turn dictionaries.
            
        Returns:
            Dictionary containing:
                - response_text: The main supportive statement
                - conversation_state: The current conversation state
                - follow_up_question: The follow-up query to explore feelings
                - safety_attention: Safety warning flag
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
 
        # Handle silence or unclear inputs directly using ConversationManager suggested templates
        if state in ("NO_SPEECH", "UNCLEAR"):
            return {
                "response_text": suggested_response,
                "conversation_state": state,
                "follow_up_question": follow_up,
                "safety_attention": requires_safety
            }
 
        # Acknowledge user's words and select context-relevant variations
        # 1. SEVERE_DISTRESS or explicit safety
        is_high_safety = (state == "HIGH_DISTRESS" and re.search(r"\b(hopeless|keep going|give up)\b", transcript, re.IGNORECASE))
        if state == "SEVERE_DISTRESS" or requires_safety or is_high_safety:
            if re.search(r"\b(suicide|suicidal|end my life|want to die|self-harm)\b", transcript, re.IGNORECASE):
                response_text = "I'm really concerned to hear that you're feeling this way, and I want to make sure you're safe. Please know that you are not alone and there is support available."
                follow_up_question = "Would you be open to reaching out to a professional or a support helpline right now?"
            elif re.search(r"\b(hurt myself|hurting myself)\b", transcript, re.IGNORECASE):
                response_text = "I'm so sorry you're going through this pain, and I want to support you. Let's prioritize keeping you safe right now."
                follow_up_question = "Is there a trusted friend, family member, or helper nearby who you could call or stay with right now?"
            elif re.search(r"\b(scared|unsafe|not safe|frightened)\b", transcript, re.IGNORECASE):
                response_text = "That sounds incredibly frightening, and I'm really glad you told me. Let's focus on keeping you safe in this moment."
                follow_up_question = "Is there someone nearby you trust who you could stay with or talk to right now?"
            else:
                response_text = "I hear how incredibly heavy things are for you right now, and I want to support you. You don't have to carry this all by yourself."
                follow_up_question = "Is there a trusted friend, family member, or a support helpline you can reach out to right now?"
 
        # 2. HIGH_DISTRESS or 3. MODERATE_DISTRESS (checked for contradictions)
        elif state in ("HIGH_DISTRESS", "MODERATE_DISTRESS"):
            # Check for contradiction/masking
            has_fine = re.search(r"\b(fine|okay|ok|good|well)\b", transcript, re.IGNORECASE)
            has_worry = re.search(r"\b(worry|worried|stress|stressed|anxious|tired|struggle|struggling|exhausted)\b", transcript, re.IGNORECASE)
            
            if has_fine and has_worry:
                response_text = "You sound like you've been carrying quite a bit, even if you're trying to stay strong."
                follow_up_question = "What's been worrying you the most lately?"
            elif state == "HIGH_DISTRESS":
                if re.search(r"\b(scared|unsafe|not safe|frightened)\b", transcript, re.IGNORECASE):
                    response_text = "That sounds frightening, and I'm glad you told me. Let's focus on getting you through this moment."
                    follow_up_question = "Is there someone nearby you trust who you could stay with or talk to right now?"
                else:
                    high_responses = [
                        (
                            "It sounds like you are going through a really difficult moment right now. Your feelings make complete sense, and it is okay to feel this way.",
                            "What is one small thing that would help you feel a bit more supported right now?"
                        ),
                        (
                            "I'm so sorry you're feeling this way. It is completely understandable to feel overwhelmed when things pile up like this.",
                            "Would it help to talk a little more about what's feeling the most challenging right now?"
                        ),
                        (
                            "I can hear how much you're carrying right now. I'm here to listen, and we can take this one step at a time.",
                            "If you're comfortable sharing, what is on your mind the most right now?"
                        )
                    ]
                    last_resp = history[-1].get("response_text", "") if history else ""
                    valid_options = [r for r in high_responses if r[0] != last_resp]
                    response_text, follow_up_question = random.choice(valid_options if valid_options else high_responses)
            else: # MODERATE_DISTRESS
                if isinstance(dissonance, float) and dissonance >= 0.20:
                    response_text = "You mentioned you're doing okay, but it sounds like there might be a lot going on underneath. I'm here to listen if you want to talk about it."
                    follow_up_question = "Would you like to share what is on your mind?"
                else:
                    mod_responses = [
                        (
                            "It sounds like you've been carrying a lot lately. I want to make sure I understand—thank you for sharing this with me.",
                            "Would you like to tell me more about what has been bothering you?"
                        ),
                        (
                            "It makes complete sense that you'd feel stressed right now. Thank you for opening up to me.",
                            "How has this been affecting your daily routine lately?"
                        )
                    ]
                    last_resp = history[-1].get("response_text", "") if history else ""
                    valid_options = [r for r in mod_responses if r[0] != last_resp]
                    response_text, follow_up_question = random.choice(valid_options if valid_options else mod_responses)
 
        # 4. MILD_DISTRESS
        elif state == "MILD_DISTRESS":
            mild_responses = [
                (
                    "It sounds like things have been a little stressful or uncertain for you recently. It is completely natural to have days like this.",
                    "What has been on your mind the most today?"
                ),
                (
                    "I hear that you're feeling a bit tired or out of sync today. It's completely okay to not be at one hundred percent.",
                    "Is there anything small you can do for yourself today to take a gentle break?"
                )
            ]
            last_resp = history[-1].get("response_text", "") if history else ""
            valid_options = [r for r in mild_responses if r[0] != last_resp]
            response_text, follow_up_question = random.choice(valid_options if valid_options else mild_responses)
 
        # 5. NORMAL / Recovery
        else:
            # Check for recovery transition
            if last_state in ("SEVERE_DISTRESS", "HIGH_DISTRESS", "MODERATE_DISTRESS"):
                recovery_responses = [
                    (
                        "I'm glad you're feeling a little better. It sounds like talking about it helped.",
                        "What would you like to do now?"
                    ),
                    (
                        "That is really heartening to hear. I'm glad things are feeling a bit lighter since we last spoke.",
                        "What do you think helped things feel a little better?"
                    )
                ]
                last_resp = history[-1].get("response_text", "") if history else ""
                valid_options = [r for r in recovery_responses if r[0] != last_resp]
                response_text, follow_up_question = random.choice(valid_options if valid_options else recovery_responses)
            else:
                # Standard normal variations
                if re.search(r"\b(good|great|well|fine|happy|perfect|normal|normally|okay|ok)\b", transcript, re.IGNORECASE):
                    normal_responses = [
                        (
                            "That is wonderful to hear! I'm glad things are going well for you.",
                            "What has been the highlight of your day so far?"
                        ),
                        (
                            "That's great to hear. What's been going well for you today?",
                            "What are you looking forward to doing today?"
                        )
                    ]
                else:
                    normal_responses = [
                        (
                            "That's good to hear. It sounds like things are moving along steadily.",
                            "What has been the highlight of your day so far?"
                        ),
                        (
                            "Thanks for sharing that. It sounds like things are going pretty smoothly today.",
                            "What's on your mind or on your schedule for the rest of the day?"
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
