import logging
from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone, timedelta
from backend.app.utils.timezone_utils import (
    IST_ZONE,
    UTC_ZONE,
    utc_now,
    utc_now_iso,
    to_ist,
    format_ist,
    format_utc_iso,
    get_ist_date_key
)

logger = logging.getLogger("BiosignalService")

class BiosignalProvider(ABC):
    """
    Abstract interface for Biosignal Data Providers.
    Allows seamlessly switching between demo/simulated feeds and future physical wearable devices.
    """
    @abstractmethod
    def get_telemetry(self, case_id: str) -> Dict[str, Any]:
        pass

    @abstractmethod
    def get_sleep_history(self, case_id: str) -> List[Dict[str, Any]]:
        pass

    @abstractmethod
    def get_holistic_assessment(
        self,
        case_id: str,
        text_score: Optional[float] = None,
        voice_score: Optional[float] = None,
        fusion_score: Optional[float] = None,
        risk_tier: Optional[str] = None,
        safety_flag: bool = False,
    ) -> Dict[str, Any]:
        pass


class DemoBiosignalProvider(BiosignalProvider):
    """
    Deterministic Prototype / Demo Provider for Biosignal Telemetry.
    Provides case-isolated data for Rohan Case 1, Rohan Case 2, and Ananya Case 1.
    """

    # Deterministic datasets keyed strictly by case_id
    CASE_DATA: Dict[str, Dict[str, Any]] = {
        # Rohan Case 2 (Active High-Distress Case)
        "a0a0a0a0-b0b0-c0c0-d0d0-e0e0e0e0e0e0": {
            "case_name": "ROHAN-CASE-2",
            "patient_name": "Rohan",
            "device_name": "Sahaaya Biosignal Prototype",
            "is_demo": True,
            "connection_status": "Connected",
            "sleep": {
                "duration_formatted": "6h 42m",
                "duration_minutes": 402,
                "quality": "Moderate",
                "consistency": 72,
                "disturbances": 3,
                "recovery": "Moderate",
                "status": "Below Baseline"
            },
            "heart_rate": {
                "resting_bpm": 74,
                "average_bpm": 78,
                "min_bpm": 62,
                "max_bpm": 101,
                "range_formatted": "62–101 BPM",
                "status": "Normal"
            },
            "skin_conductance": {
                "average_us": 2.8,
                "peak_us": 5.1,
                "stress_events": 4,
                "status": "Elevated"
            },
            "blood_oxygen": {
                "average_spo2": 98,
                "min_spo2": 96,
                "status": "Normal"
            },
            "respiratory_rate": {
                "average_bpm": 15,
                "status": "Normal"
            },
            "sleep_history": [
                {"date": "Aug 29", "duration": "6h 42m", "quality": "Moderate", "recovery": "Moderate", "disturbances": 3, "efficiency": "78%"},
                {"date": "Aug 28", "duration": "7h 18m", "quality": "Good", "recovery": "Good", "disturbances": 1, "efficiency": "88%"},
                {"date": "Aug 27", "duration": "5h 51m", "quality": "Poor", "recovery": "Low", "disturbances": 5, "efficiency": "65%"},
                {"date": "Aug 26", "duration": "7h 04m", "quality": "Good", "recovery": "Good", "disturbances": 2, "efficiency": "84%"}
            ]
        },
        # Rohan Case 1 (Historical / Resolved Case)
        "60895178-7a8b-4392-961b-ac82d4b7ec0c": {
            "case_name": "ROHAN-CASE-1",
            "patient_name": "Rohan",
            "device_name": "Sahaaya Biosignal Prototype",
            "is_demo": True,
            "connection_status": "Connected",
            "sleep": {
                "duration_formatted": "7h 35m",
                "duration_minutes": 455,
                "quality": "Good",
                "consistency": 88,
                "disturbances": 1,
                "recovery": "Optimal",
                "status": "Normal"
            },
            "heart_rate": {
                "resting_bpm": 68,
                "average_bpm": 72,
                "min_bpm": 58,
                "max_bpm": 89,
                "range_formatted": "58–89 BPM",
                "status": "Normal"
            },
            "skin_conductance": {
                "average_us": 2.1,
                "peak_us": 3.4,
                "stress_events": 1,
                "status": "Stable"
            },
            "blood_oxygen": {
                "average_spo2": 99,
                "min_spo2": 98,
                "status": "Normal"
            },
            "respiratory_rate": {
                "average_bpm": 14,
                "status": "Normal"
            },
            "sleep_history": [
                {"date": "Aug 29", "duration": "7h 35m", "quality": "Good", "recovery": "Optimal", "disturbances": 1, "efficiency": "91%"},
                {"date": "Aug 28", "duration": "7h 40m", "quality": "Good", "recovery": "Good", "disturbances": 1, "efficiency": "89%"},
                {"date": "Aug 27", "duration": "7h 15m", "quality": "Good", "recovery": "Good", "disturbances": 2, "efficiency": "86%"},
                {"date": "Aug 26", "duration": "7h 50m", "quality": "Good", "recovery": "Optimal", "disturbances": 0, "efficiency": "93%"}
            ]
        },
        # Ananya Case 1
        "11111111-2222-3333-4444-555555555555": {
            "case_name": "ANANYA-CASE-1",
            "patient_name": "Ananya Patel",
            "device_name": "Sahaaya Biosignal Prototype",
            "is_demo": True,
            "connection_status": "Connected",
            "sleep": {
                "duration_formatted": "7h 12m",
                "duration_minutes": 432,
                "quality": "Good",
                "consistency": 82,
                "disturbances": 2,
                "recovery": "Good",
                "status": "Normal"
            },
            "heart_rate": {
                "resting_bpm": 71,
                "average_bpm": 75,
                "min_bpm": 60,
                "max_bpm": 94,
                "range_formatted": "60–94 BPM",
                "status": "Normal"
            },
            "skin_conductance": {
                "average_us": 2.4,
                "peak_us": 4.0,
                "stress_events": 2,
                "status": "Stable"
            },
            "blood_oxygen": {
                "average_spo2": 98,
                "min_spo2": 97,
                "status": "Normal"
            },
            "respiratory_rate": {
                "average_bpm": 15,
                "status": "Normal"
            },
            "sleep_history": [
                {"date": "Aug 29", "duration": "7h 12m", "quality": "Good", "recovery": "Good", "disturbances": 2, "efficiency": "86%"},
                {"date": "Aug 28", "duration": "6h 55m", "quality": "Moderate", "recovery": "Moderate", "disturbances": 3, "efficiency": "79%"},
                {"date": "Aug 27", "duration": "7h 20m", "quality": "Good", "recovery": "Good", "disturbances": 1, "efficiency": "88%"},
                {"date": "Aug 26", "duration": "7h 05m", "quality": "Good", "recovery": "Good", "disturbances": 2, "efficiency": "85%"}
            ]
        }
    }

    def _get_default_case_data(self, case_id: str) -> Dict[str, Any]:
        return {
            "case_name": f"CASE-{case_id[:8]}",
            "patient_name": "Patient",
            "device_name": "Sahaaya Biosignal Prototype",
            "is_demo": True,
            "connection_status": "Connected",
            "sleep": {
                "duration_formatted": "7h 00m",
                "duration_minutes": 420,
                "quality": "Good",
                "consistency": 75,
                "disturbances": 2,
                "recovery": "Moderate",
                "status": "Normal"
            },
            "heart_rate": {
                "resting_bpm": 72,
                "average_bpm": 76,
                "min_bpm": 60,
                "max_bpm": 95,
                "range_formatted": "60–95 BPM",
                "status": "Normal"
            },
            "skin_conductance": {
                "average_us": 2.5,
                "peak_us": 4.2,
                "stress_events": 2,
                "status": "Stable"
            },
            "blood_oxygen": {
                "average_spo2": 98,
                "min_spo2": 96,
                "status": "Normal"
            },
            "respiratory_rate": {
                "average_bpm": 15,
                "status": "Normal"
            },
            "sleep_history": [
                {"date": "Aug 29", "duration": "7h 00m", "quality": "Good", "recovery": "Moderate", "disturbances": 2, "efficiency": "82%"},
                {"date": "Aug 28", "duration": "6h 45m", "quality": "Moderate", "recovery": "Moderate", "disturbances": 3, "efficiency": "78%"},
                {"date": "Aug 27", "duration": "7h 10m", "quality": "Good", "recovery": "Good", "disturbances": 1, "efficiency": "85%"}
            ]
        }

    def get_telemetry(self, case_id: str) -> Dict[str, Any]:
        case_data = self.CASE_DATA.get(case_id, self._get_default_case_data(case_id))
        
        return {
            "case_id": case_id,
            "case_name": case_data["case_name"],
            "patient_name": case_data["patient_name"],
            "device_name": case_data["device_name"],
            "device_status": case_data["connection_status"],
            "is_demo": True,
            "last_sync_ist": format_ist(utc_now()),
            "sleep": case_data["sleep"],
            "heart_rate": case_data["heart_rate"],
            "skin_conductance": case_data["skin_conductance"],
            "blood_oxygen": case_data["blood_oxygen"],
            "respiratory_rate": case_data["respiratory_rate"],
        }

    def get_sleep_history(self, case_id: str) -> List[Dict[str, Any]]:
        case_data = self.CASE_DATA.get(case_id, self._get_default_case_data(case_id))
        return case_data.get("sleep_history", [])

    def get_holistic_assessment(
        self,
        case_id: str,
        text_score: Optional[float] = None,
        voice_score: Optional[float] = None,
        fusion_score: Optional[float] = None,
        risk_tier: Optional[str] = None,
        safety_flag: bool = False,
    ) -> Dict[str, Any]:
        """
        Synthesizes multimodal conversational signals (Text + Voice + Fusion) with
        prototype biosignal observations to generate a high-level holistic decision-support view.
        """
        telemetry = self.get_telemetry(case_id)
        sleep_info = telemetry["sleep"]
        hr_info = telemetry["heart_rate"]
        gsr_info = telemetry["skin_conductance"]
        spo2_info = telemetry["blood_oxygen"]

        # Default fallbacks if scores are None
        f_score = fusion_score if fusion_score is not None else (text_score if text_score is not None else 0.40)
        t_tier = risk_tier or ("SEVERE" if f_score > 0.75 else "HIGH" if f_score > 0.50 else "MODERATE" if f_score > 0.25 else "LOW")

        # Determine Overall Mental Status
        if safety_flag or t_tier in ("SEVERE", "CRITICAL"):
            current_status = "High Concern"
            status_color = "red"
        elif t_tier == "HIGH" or f_score >= 0.55 or gsr_info["status"] == "Elevated":
            current_status = "Moderate Concern"
            status_color = "orange"
        elif t_tier == "MODERATE" or f_score >= 0.30:
            current_status = "Mild Concern"
            status_color = "amber"
        else:
            current_status = "Stable"
            status_color = "green"

        # Determine Trend (Combining Multimodal Distress & Sleep/Bio trends)
        sleep_quality = sleep_info.get("quality", "Good")
        if t_tier in ("SEVERE", "CRITICAL") or (f_score > 0.60 and sleep_quality == "Poor"):
            trend = "Worsening"
        elif f_score < 0.40 and sleep_quality in ("Good", "Optimal"):
            trend = "Improving"
        else:
            trend = "Stable"

        # Dynamic Contributing Indicators List
        contributing_indicators = []
        if sleep_info.get("status") == "Below Baseline" or sleep_info.get("disturbances", 0) >= 3:
            contributing_indicators.append("Reduced sleep duration and increased disturbances compared with baseline")
        elif sleep_info.get("quality") in ("Good", "Optimal"):
            contributing_indicators.append("Sleep duration and recovery metrics are consistent with rest baseline")

        if gsr_info.get("status") == "Elevated" or gsr_info.get("stress_events", 0) >= 3:
            contributing_indicators.append(f"Elevated demo skin conductance with {gsr_info.get('stress_events', 0)} physiological stress response markers")
        else:
            contributing_indicators.append("Skin conductance patterns within stable prototype range")

        if hr_info.get("resting_bpm", 70) > 78:
            contributing_indicators.append("Slightly elevated resting heart rate observed during evening hours")
        else:
            contributing_indicators.append(f"Resting heart rate remains within expected baseline ({hr_info.get('resting_bpm')} BPM)")

        if spo2_info.get("average_spo2", 98) >= 95:
            contributing_indicators.append("Stable blood oxygen saturation (SpO2 ≥ 96%)")

        if f_score >= 0.50:
            contributing_indicators.append(f"Conversational distress rating ({int(f_score * 100)}%) reinforces monitored emotional strain")

        # Dynamic Interpretation (Non-diagnostic clinical decision support)
        distress_desc = "elevated" if f_score >= 0.60 else "moderate" if f_score >= 0.35 else "low"
        sleep_desc = "below baseline" if sleep_info.get("quality") in ("Moderate", "Poor") else "restful"
        hr_desc = "normal demo range" if hr_info.get("status") == "Normal" else "elevated"

        interpretation = (
            f"Current multimodal analysis indicates {distress_desc} distress. "
            f"Sleep quality is observed as {sleep_desc} while resting heart rate remains within the {hr_desc}. "
            f"{'Proactive counsellor check-in and safety monitoring are recommended.' if current_status in ('High Concern', 'Moderate Concern') else 'Routine periodic follow-up advised.'}"
        )

        return {
            "case_id": case_id,
            "current_status": current_status,
            "status_color": status_color,
            "trend": trend,
            "confidence": "Demo / Prototype",
            "signals": {
                "text_score": f"{int((text_score or 0) * 100)}%" if text_score is not None else "N/A",
                "voice_score": f"{int((voice_score or 0) * 100)}%" if voice_score is not None else "Text-only",
                "fusion_score": f"{int(f_score * 100)}%",
                "risk_tier": t_tier,
                "sleep_quality": sleep_info["quality"],
                "heart_rate_status": hr_info["status"],
                "skin_conductance_status": gsr_info["status"],
                "spo2_status": spo2_info["status"]
            },
            "overall_interpretation": interpretation,
            "contributing_indicators": contributing_indicators,
            "is_demo": True
        }


# Singleton instance
biosignal_provider: BiosignalProvider = DemoBiosignalProvider()
