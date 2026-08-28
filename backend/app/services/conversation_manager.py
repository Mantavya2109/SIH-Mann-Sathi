import re
import logging
from typing import Dict, Any

logger = logging.getLogger(__name__)

class ConversationManager:
    """
    Production-ready Conversation Manager.
    Decides the AI's conversation state and response strategy based on multimodal analysis.
    Does NOT run emotion models itself.
    """
    def __init__(self):
        # Safety keyword patterns for urgent attention
        self.safety_patterns = [
            r"\bsuicide\b",
            r"\bsuicidal\b",
            r"\bhurt\s+myself\b",
            r"\bend\s+my\s+life\b",
            r"\bwant\s+to\s+die\b",
            r"\bself-harm\b"
        ]

    def determine_state_and_response(self, analysis_result: Dict[str, Any], history: list = None) -> Dict[str, Any]:
        """
        Determines the state, strategy, goal, and suggested response text based on API analysis.
        
        Args:
            analysis_result: Structured result from POST /api/analyze.
            history: Optional list of previous turn dictionaries.
            
        Returns:
            Dictionary containing:
                - conversation_state: NORMAL | MILD_DISTRESS | MODERATE_DISTRESS | HIGH_DISTRESS | SEVERE_DISTRESS | NO_SPEECH | UNCLEAR
                - response_strategy: String describing response guidelines
                - response_goal: String describing what we want to achieve
                - suggested_response: Verbatim suggested starting response
                - follow_up_question: Verbatim follow-up question
                - requires_safety_attention: Boolean indicating urgent safety attention
        """
        transcript = analysis_result.get("transcript", "").strip()
        speech_state = analysis_result.get("speech_state", "SPEECH_DETECTED")
        text_state = analysis_result.get("text_state", "TEXT_EMOTIONS_AVAILABLE")
        
        # Extract fusion scorer metrics
        fusion = analysis_result.get("fusion_metrics", {})
        final_score = fusion.get("final_distress_score", 0.0)
        tier = fusion.get("tier", "LOW")
        dissonance = fusion.get("s_dissonance", 0.0)
        text_available = fusion.get("text_available", True)

        # 1. Check Safety Keywords in Transcript first
        requires_safety = False
        if text_available and transcript:
            for pattern in self.safety_patterns:
                if re.search(pattern, transcript, re.IGNORECASE):
                    requires_safety = True
                    break

        # Get verbal distress score from fusion metrics
        d_text_val = fusion.get("d_text")
        if d_text_val is None:
            # If not in fusion (e.g. mock), default to 1.0 to prevent override unless explicitly low
            d_text_val = 1.0 if text_available else 0.0
        elif isinstance(d_text_val, str):  # Handle "UNAVAILABLE"
            d_text_val = 0.0

        # Retrieve last active state from history
        last_state = "NORMAL"
        if history:
            for turn in reversed(history):
                prev_state = turn.get("conversation_state", "NORMAL")
                if prev_state not in ("NO_SPEECH", "UNCLEAR"):
                    last_state = prev_state
                    break

        # Initialize defaults
        conversation_state = "NORMAL"
        response_strategy = ""
        response_goal = ""
        suggested_response = ""
        follow_up_question = ""

        # 2. State Decision Tree
        voice_available = fusion.get("voice_available", True)
        if speech_state == "NO_SPEECH_DETECTED" and voice_available:
            conversation_state = "NO_SPEECH"
            response_strategy = "Acknowledge silence or lack of speech signal. Prompt gently."
            response_goal = "Encourage the person to try speaking again when ready."
            suggested_response = "I didn't catch anything there. Take your time and tell me how you're feeling."
            follow_up_question = "Would you like to try speaking again?"

        elif transcript == "" or len(re.sub(r"[^\w\s]", "", transcript).strip()) == 0:
            conversation_state = "UNCLEAR"
            response_strategy = "Handle unclear/empty/punctuation-only voice inputs without assuming distress."
            response_goal = "Prompt for a natural clarification."
            suggested_response = "I heard some sound, but I couldn't make out the words clearly."
            follow_up_question = "Could you repeat that, or tell me a bit more about what's on your mind?"

        elif requires_safety or tier == "SEVERE":
            # Override vocal distress false-positives when verbal content is healthy
            if text_available and d_text_val < 0.15 and not requires_safety:
                if last_state in ("SEVERE_DISTRESS", "HIGH_DISTRESS", "MODERATE_DISTRESS"):
                    # Transition / Recovery flow
                    conversation_state = "NORMAL"
                    response_strategy = "Acknowledge the transition from elevated distress to a calmer state. Validate progress gently."
                    response_goal = "Encourage the person's positive state shift while maintaining safety awareness."
                    suggested_response = "I'm glad to hear things feel a bit better or more normal right now. How are you holding up since we last spoke?"
                    follow_up_question = "Is there anything specific that helped you feel a bit calmer?"
                else:
                    conversation_state = "NORMAL"
                    response_strategy = "Continue friendly, natural conversation. Do not mention mental health or distress."
                    response_goal = "Build natural rapport and maintain a positive, conversational flow."
                    if re.search(r"\b(good|great|fine|happy|perfect|normal|normally|okay|ok)\b", transcript, re.IGNORECASE):
                        suggested_response = "That is wonderful to hear! I'm glad things are going well for you."
                    else:
                        suggested_response = "That's good to hear. It sounds like things are moving along steadily."
                    follow_up_question = "What has been the highlight of your day so far?"
            else:
                conversation_state = "SEVERE_DISTRESS"
                response_strategy = "Use calm, supportive, safety-oriented language. Encourage human or professional support. Do not diagnose."
                response_goal = "Validate feelings and promote safety and outreach."
                suggested_response = "I hear how incredibly heavy things are for you right now, and I want to support you. You don't have to carry this all by yourself."
                follow_up_question = "Is there a trusted friend, family member, or a support helpline you can reach out to right now?"
                requires_safety = True # Upgrade safety flag

        elif tier == "HIGH":
            # Override vocal distress false-positives when verbal content is healthy
            if text_available and d_text_val < 0.15 and not requires_safety:
                if last_state in ("SEVERE_DISTRESS", "HIGH_DISTRESS", "MODERATE_DISTRESS"):
                    # Transition / Recovery flow
                    conversation_state = "NORMAL"
                    response_strategy = "Acknowledge the transition from elevated distress to a calmer state. Validate progress gently."
                    response_goal = "Encourage the person's positive state shift while maintaining safety awareness."
                    suggested_response = "I'm glad to hear things feel a bit better or more normal right now. How are you holding up since we last spoke?"
                    follow_up_question = "Is there anything specific that helped you feel a bit calmer?"
                else:
                    conversation_state = "NORMAL"
                    response_strategy = "Continue friendly, natural conversation. Do not mention mental health or distress."
                    response_goal = "Build natural rapport and maintain a positive, conversational flow."
                    if re.search(r"\b(good|great|fine|happy|perfect|normal|normally|okay|ok)\b", transcript, re.IGNORECASE):
                        suggested_response = "That is wonderful to hear! I'm glad things are going well for you."
                    else:
                        suggested_response = "That's good to hear. It sounds like things are moving along steadily."
                    follow_up_question = "What has been the highlight of your day so far?"
            else:
                conversation_state = "HIGH_DISTRESS"
                response_strategy = "Use calm, validating language. Focus on immediate feelings and support. Avoid judgment or toxic positivity."
                response_goal = "Validate distress and help the person feel safe and heard."
                suggested_response = "It sounds like you are going through a really difficult moment right now. Your feelings make complete sense, and it is okay to feel this way."
                follow_up_question = "What is one small thing that would help you feel a bit more supported right now?"

        elif tier == "MODERATE" or (tier == "LOW" and isinstance(dissonance, float) and dissonance >= 0.20):
            # Override moderate vocal distress false-positives when verbal content is healthy
            if text_available and d_text_val < 0.15 and not requires_safety:
                if last_state in ("SEVERE_DISTRESS", "HIGH_DISTRESS", "MODERATE_DISTRESS"):
                    conversation_state = "NORMAL"
                    response_strategy = "Acknowledge the transition from elevated distress to a calmer state. Validate progress gently."
                    response_goal = "Encourage the person's positive state shift while maintaining safety awareness."
                    suggested_response = "I'm glad to hear things feel a bit better or more normal right now. How are you holding up since we last spoke?"
                    follow_up_question = "Is there anything specific that helped you feel a bit calmer?"
                else:
                    if isinstance(dissonance, float) and dissonance >= 0.20:
                        conversation_state = "MODERATE_DISTRESS"
                        response_strategy = "Address voice-text mismatch. Acknowledge the positive statement but gently validate vocal signs of distress."
                        response_goal = "Create a safe space to explore underlying concerns."
                        suggested_response = "You mentioned you're doing okay, but it sounds like there might be a lot going on underneath. I'm here to listen if you want to talk about it."
                        follow_up_question = "Would you like to tell me more about what has been bothering you?"
                    else:
                        conversation_state = "NORMAL"
                        response_strategy = "Continue friendly, natural conversation. Do not mention mental health or distress."
                        response_goal = "Build natural rapport and maintain a positive, conversational flow."
                        if re.search(r"\b(good|great|fine|happy|perfect|normal|normally|okay|ok)\b", transcript, re.IGNORECASE):
                            suggested_response = "That is wonderful to hear! I'm glad things are going well for you."
                        else:
                            suggested_response = "That's good to hear. It sounds like things are moving along steadily."
                        follow_up_question = "What has been the highlight of your day so far?"
            else:
                conversation_state = "MODERATE_DISTRESS"
                # Check for masking (high dissonance)
                if isinstance(dissonance, float) and dissonance >= 0.20:
                    response_strategy = "Address voice-text mismatch. Acknowledge the positive statement but gently validate vocal signs of distress."
                    response_goal = "Create a safe space to explore underlying concerns."
                    suggested_response = "You mentioned you're doing okay, but it sounds like there might be a lot going on underneath. I'm here to listen if you want to talk about it."
                else:
                    response_strategy = "Prioritize listening and emotional validation. Avoid simple motivational clichés."
                    response_goal = "Encourage the person to explain what is troubling them."
                    suggested_response = "It sounds like you've been carrying a lot lately. I want to make sure I understand—thank you for sharing this with me."
                follow_up_question = "Would you like to tell me more about what has been bothering you?"

        elif tier == "LOW" and isinstance(final_score, float) and final_score > 0.12:
            conversation_state = "MILD_DISTRESS"
            response_strategy = "Respond with empathy and gentle encouragement. Ask an open-ended question."
            response_goal = "Offer support and gently keep the dialogue moving."
            suggested_response = "It sounds like things have been a little stressful or uncertain for you recently. It is completely natural to have days like this."
            follow_up_question = "What has been on your mind the most today?"

        else:
            # NORMAL State
            conversation_state = "NORMAL"
            
            if last_state in ("SEVERE_DISTRESS", "HIGH_DISTRESS", "MODERATE_DISTRESS"):
                response_strategy = "Acknowledge the transition from elevated distress to a calmer state. Validate progress gently."
                response_goal = "Encourage the person's positive state shift while maintaining safety awareness."
                suggested_response = "I'm glad to hear things feel a bit better or more normal right now. How are you holding up since we last spoke?"
                follow_up_question = "Is there anything specific that helped you feel a bit calmer?"
            else:
                response_strategy = "Continue friendly, natural conversation. Do not mention mental health or distress."
                response_goal = "Build natural rapport and maintain a positive, conversational flow."
                
                # Contextualize suggested response to positive transcript keywords
                if re.search(r"\b(good|great|fine|happy|perfect|normal|normally|okay|ok)\b", transcript, re.IGNORECASE):
                    suggested_response = "That is wonderful to hear! I'm glad things are going well for you."
                else:
                    suggested_response = "That's good to hear. It sounds like things are moving along steadily."
                    
                follow_up_question = "What has been the highlight of your day so far?"

        return {
            "conversation_state": conversation_state,
            "response_strategy": response_strategy,
            "response_goal": response_goal,
            "suggested_response": suggested_response,
            "follow_up_question": follow_up_question,
            "requires_safety_attention": requires_safety
        }

# Singleton instance for application reuse
conversation_manager = ConversationManager()
