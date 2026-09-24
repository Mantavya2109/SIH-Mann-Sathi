import os
import json
import logging
import math
from typing import List, Dict, Any
from groq import Groq
from dotenv import load_dotenv

# Load env vars
load_dotenv()
logger = logging.getLogger(__name__)

class CasePrioritizationService:
    """
    Service to evaluate and triage multiple user sessions/cases by urgency level.
    Integrates with the Groq API (using openai/gpt-oss-120b) or falls back to
    a robust rule-based model.
    """
    def __init__(self):
        self.api_key = os.environ.get("GROQ_API_KEY")
        self.client = None
        self.model = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
        
        if self.api_key:
            try:
                self.client = Groq(api_key=self.api_key)
                logger.info("Groq API client successfully initialized for Case Prioritization.")
            except Exception as e:
                logger.error(f"Failed to initialize Groq client for Case Prioritization: {e}")
        else:
            logger.warning("GROQ_API_KEY not found. Case prioritization will default to rule-based fallback.")

    def prioritize_cases(self, cases: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Takes case data and determines priority order using Groq or rule-based fallback.
        
        Args:
            cases: List of dictionaries with case information (case_id, distress_score,
                   trend, days_since_last_checkin, risk_level, safety_attention).
                   
        Returns:
            List of prioritized cases sorted in descending order of priority_score.
        """
        if not cases:
            return []

        # Filter out cases with missing case_id
        valid_input_cases = [c for c in cases if c.get("case_id") is not None]
        if not valid_input_cases:
            return []

        if self.client:
            try:
                # Prepare structured inputs for the LLM with safe type conversion helpers
                formatted_cases = []
                for c in valid_input_cases:
                    def to_float(v):
                        if v is None:
                            return 0.0
                        try:
                            return float(v)
                        except (ValueError, TypeError):
                            return 0.0
                            
                    def to_str(v, default=""):
                        if v is None:
                            return default
                        return str(v)
                        
                    def to_bool(v):
                        if v is None:
                            return False
                        return bool(v)

                    formatted_cases.append({
                        "case_id": to_str(c.get("case_id")),
                        "distress_score": to_float(c.get("distress_score")),
                        "trend": to_str(c.get("trend"), "stable"),
                        "days_since_last_checkin": to_float(c.get("days_since_last_checkin")),
                        "risk_level": to_str(c.get("risk_level"), "LOW"),
                        "safety_attention": to_bool(c.get("safety_attention"))
                    })

                system_prompt = (
                    "You are an expert administrative Case Prioritization Agent for a mental health monitoring dashboard.\n"
                    "Your role is to analyze a list of patient check-in cases, rank them by urgency, assign a priority level and a numeric priority score, and provide a short, professional reason for the prioritization.\n\n"
                    "Prioritization Rules:\n"
                    "1. Safety override: If safety_attention is true, the case represents an active crisis (e.g. self-harm risk) and must be ranked at the highest priority level (CRITICAL).\n"
                    "2. Distress score & Risk level: Higher distress scores and higher risk levels (SEVERE, HIGH, MODERATE, LOW) should generally result in higher priority.\n"
                    "3. Trend: A 'rising' trend represents worsening distress and must be treated with significantly higher concern than a 'stable' or 'falling' trend. A rising trend should heavily boost prioritization.\n"
                    "4. Days since last check-in: Longer duration without check-in increases priority due to lack of recent monitoring. Apply a recency/decay concept (i.e. more days increases score, but does not completely dominate safety overrides or current high distress).\n\n"
                    "Strict Constraints:\n"
                    "1. NEVER make any medical or psychiatric diagnosis or claim a patient has a specific condition.\n"
                    "2. Base rankings strictly on the provided quantitative features, not arbitrary assumptions.\n"
                    "3. Assign priority level as exactly one of: CRITICAL, HIGH, MEDIUM, LOW.\n"
                    "4. Assign priority_score as a float between 0.0 and 100.0.\n"
                    "5. Return the prioritized cases sorted in descending order of priority_score.\n"
                    "6. Return JSON format containing exactly the 'prioritized_cases' key:\n"
                    "   {\n"
                    "     \"prioritized_cases\": [\n"
                    "       {\n"
                    "         \"case_id\": \"<case_id>\",\n"
                    "         \"priority\": \"CRITICAL|HIGH|MEDIUM|LOW\",\n"
                    "         \"priority_score\": <float 0.0-100.0>,\n"
                    "         \"reason\": \"<short reason, max 2 sentences>\"\n"
                    "       }\n"
                    "     ]\n"
                    "   }\n"
                )

                user_content = {
                    "cases_to_prioritize": formatted_cases
                }

                # Query Groq API with JSON mode and 5.0s timeout
                completion = self.client.chat.completions.create(
                    model=self.model,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": json.dumps(user_content)}
                    ],
                    response_format={"type": "json_object"},
                    timeout=5.0
                )

                response_text = completion.choices[0].message.content
                parsed = json.loads(response_text)
                
                # Validate response structure
                if isinstance(parsed, list):
                    llm_cases = parsed
                elif isinstance(parsed, dict):
                    llm_cases = parsed.get("prioritized_cases", [])
                    if not isinstance(llm_cases, list):
                        llm_cases = []
                else:
                    llm_cases = []

                validated_cases = []
                input_case_ids = {str(c.get("case_id")) for c in valid_input_cases}
                processed_ids = set()

                for lc in llm_cases:
                    if not isinstance(lc, dict):
                        continue
                    cid = str(lc.get("case_id"))
                    if cid in input_case_ids and cid not in processed_ids:
                        # Extract and validate priority
                        priority = str(lc.get("priority", "LOW")).upper()
                        if priority not in ("CRITICAL", "HIGH", "MEDIUM", "LOW"):
                            priority = "LOW"
                        
                        # Extract and validate score
                        try:
                            score = float(lc.get("priority_score", 0.0))
                            score = min(100.0, max(0.0, round(score, 1)))
                        except (ValueError, TypeError):
                            score = 0.0
                        
                        reason = str(lc.get("reason", "Prioritized by agent analysis.")).strip()
                        if not reason:
                            reason = "Prioritized by agent analysis."

                        orig = next((c for c in valid_input_cases if str(c.get("case_id")) == cid), {})
                        validated_cases.append({
                            "case_id": cid,
                            "priority": priority,
                            "priority_score": score,
                            "reason": reason,
                            "trend": orig.get("trend", "stable"),
                            "days_since_last_checkin": orig.get("days_since_last_checkin", 0.0),
                            "risk_level": orig.get("risk_level", "LOW"),
                            "safety_attention": orig.get("safety_attention", False)
                        })
                        processed_ids.add(cid)

                # If the LLM missed any case IDs, fill them using the fallback model
                missing_cids = input_case_ids - processed_ids
                if missing_cids:
                    logger.warning(f"Groq output missed case IDs: {missing_cids}. Backfilling with fallback logic.")
                    for c in valid_input_cases:
                        cid = str(c.get("case_id"))
                        if cid in missing_cids:
                            validated_cases.append(self._triage_case_fallback(c))

                validated_cases.sort(key=lambda x: x["priority_score"], reverse=True)
                return validated_cases

            except Exception as e:
                logger.error(f"Error calling Groq for prioritization: {e}. Falling back to rule-based logic.", exc_info=True)
                return self._prioritize_cases_fallback(valid_input_cases)
        else:
            return self._prioritize_cases_fallback(valid_input_cases)

    def _triage_case_fallback(self, c: Dict[str, Any]) -> Dict[str, Any]:
        """Triages a single case using deterministic rules."""
        cid = str(c.get("case_id"))
        score = 0.0
        
        # 1. Distress Score contribution (max 50.0 points)
        try:
            distress = float(c.get("distress_score", 0.0))
        except (ValueError, TypeError):
            distress = 0.0
        score += min(1.0, max(0.0, distress)) * 50.0

        # 2. Risk Level weight (max 20.0 points)
        risk = str(c.get("risk_level", "LOW")).upper()
        if risk == "SEVERE":
            score += 20.0
        elif risk == "HIGH":
            score += 15.0
        elif risk == "MODERATE":
            score += 10.0

        # 3. Trend weight (max 20.0 points)
        trend = str(c.get("trend", "stable")).lower()
        if trend == "rising":
            score += 20.0
        elif trend == "stable":
            score += 5.0

        # 4. Days since check-in decay (max 10.0 points)
        try:
            days = float(c.get("days_since_last_checkin", 0.0))
        except (ValueError, TypeError):
            days = 0.0
        days = max(0.0, days)
        # Logarithmic decay: min(10.0, 4.0 * log1p(days))
        recency_weight = min(10.0, 4.0 * math.log1p(days))
        score += recency_weight

        # 5. Safety Override (force CRITICAL priority >= 85)
        safety = bool(c.get("safety_attention", False))
        if safety:
            score = max(85.0, score + 40.0)

        score = min(100.0, max(0.0, round(score, 1)))

        # Assign priority
        if score >= 85.0:
            priority = "CRITICAL"
        elif score >= 70.0:
            priority = "HIGH"
        elif score >= 45.0:
            priority = "MEDIUM"
        else:
            priority = "LOW"

        # Generate custom reasoning string
        reasons = []
        if safety:
            reasons.append("urgent safety override active")
        if trend == "rising":
            reasons.append("rising distress trend")
        elif trend == "stable" and distress > 0.4:
            reasons.append("stable elevated distress")
        if days > 5.0:
            reasons.append("extended check-in gap")
        
        if not reasons:
            reasons.append(f"standard {risk.lower()} risk profile")
            
        reason_text = "Prioritized (fallback): " + ", ".join(reasons) + "."

        return {
            "case_id": cid,
            "priority": priority,
            "priority_score": score,
            "reason": reason_text,
            "trend": trend,
            "days_since_last_checkin": days,
            "risk_level": risk,
            "safety_attention": safety
        }

    def _prioritize_cases_fallback(self, cases: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Fallback list processing using deterministic rules."""
        prioritized = [self._triage_case_fallback(c) for c in cases]
        prioritized.sort(key=lambda x: x["priority_score"], reverse=True)
        return prioritized

# Global singleton instance for reuse
case_prioritization_service = CasePrioritizationService()
