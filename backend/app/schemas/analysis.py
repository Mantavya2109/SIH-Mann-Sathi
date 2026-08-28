from pydantic import BaseModel
from typing import Dict, List, Union, Optional

class VoiceEmotions(BaseModel):
    Neutral: float
    Happy: float
    Sad: float
    Angry: float

class TextEmotions(BaseModel):
    Joy: float
    Sadness: float
    Fear: float
    Anger: float
    Surprise: float
    Disgust: float
    Neutral: float

class ConversationalFeatures(BaseModel):
    filler_count: int
    fillers_found: List[str]
    repetition_count: int
    repetitions_found: List[str]
    uncertainty_count: int
    uncertainties_found: List[str]
    token_count: int
    energy_variability: float
    pitch_mean_hz: float
    pitch_variability_hz: float
    total_duration: float
    speech_duration: float
    silence_duration: float
    pause_duration: float
    pause_count: int
    speech_silence_ratio: float

class FusionMetrics(BaseModel):
    final_distress_score: Union[float, str]
    d_voice: Union[float, str]
    d_text: Union[float, str]
    s_emotional: Union[float, str]
    diss_a: Union[float, str]
    diss_b: Union[float, str]
    s_dissonance: Union[float, str]
    s_conversational: Union[float, str]
    d_base: Union[float, str]
    conversational_boost: Union[float, str]
    tier: str
    text_available: bool
    voice_available: bool

class DistressAnalysisResponse(BaseModel):
    transcript: str
    speech_state: str
    text_state: str
    voice_emotions: Union[VoiceEmotions, Dict[str, float]]
    text_emotions: Union[TextEmotions, str, Dict[str, float]]
    conversational_features: ConversationalFeatures
    fusion_metrics: FusionMetrics

class ConversationResponse(BaseModel):
    session_id: Optional[str] = None
    turn_number: Optional[int] = None
    transcript: str
    response_text: str
    follow_up_question: str

class SessionStartResponse(BaseModel):
    session_id: str
    message: str

class SessionEndResponse(BaseModel):
    session_id: str
    message: str

class CaseInput(BaseModel):
    case_id: str
    distress_score: Optional[float] = None
    trend: Optional[str] = None  # "rising", "stable", "falling"
    days_since_last_checkin: Optional[float] = None
    risk_level: Optional[str] = None  # "LOW", "MODERATE", "HIGH", "SEVERE"
    safety_attention: Optional[bool] = None

class PrioritizedCase(BaseModel):
    case_id: str
    priority: str  # "CRITICAL", "HIGH", "MEDIUM", "LOW"
    priority_score: float
    reason: str
    trend: Optional[str] = None
    days_since_last_checkin: Optional[float] = None
    risk_level: Optional[str] = None
    safety_attention: Optional[bool] = None

class PrioritizationResponse(BaseModel):
    prioritized_cases: List[PrioritizedCase]

class PrioritizeRequest(BaseModel):
    cases: Optional[List[CaseInput]] = None


