import os
import uuid
import json
import shutil
import logging
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional
from fastapi import UploadFile, HTTPException

from backend.app.utils.supabase_client import supabase
from backend.app.utils.timezone_utils import (
    utc_now,
    utc_now_iso,
    to_ist,
    parse_to_utc,
    format_utc_iso,
    format_ist,
    get_ist_date_key
)
from backend.app.services.conversation_session import conversation_session_manager

logger = logging.getLogger(__name__)

# Data root directory for user uploaded documents
WORKSPACE_ROOT = Path(__file__).resolve().parents[3]
DOCUMENTS_DIR = WORKSPACE_ROOT / "data" / "user_documents"
DOCUMENTS_METADATA_FILE = WORKSPACE_ROOT / "data" / "documents_metadata.json"
APPOINTMENTS_FILE = WORKSPACE_ROOT / "data" / "appointments_store.json"

# Ensure directories exist
DOCUMENTS_DIR.mkdir(parents=True, exist_ok=True)

# Realistic Counsellor Profiles (Production-grade)
COUNSELLORS_DATA = [
    {
        "id": "couns-001",
        "name": "Dr. Radhika Iyer",
        "title": "Senior Counselling Psychologist",
        "qualification": "M.Phil, Ph.D. (Clinical Psychology, NIMHANS)",
        "experience": "12+ years experience",
        "specialization": "Trauma Recovery, Crisis Triage & Psychological First Aid",
        "languages": ["English", "Hindi", "Telugu", "Tamil"],
        "phone": "+91 98450 12384",
        "email": "counsellor@nirbhayamitra.com",
        "availability": "Mon – Sat, 9:00 AM – 6:00 PM IST",
        "location": "Central Mental Health & Trauma Support Hub, Hyderabad / Online",
        "rating": 4.9,
        "is_primary": True,
        "avatar_initials": "RI"
    },
    {
        "id": "couns-002",
        "name": "Dr. Arvind Menon",
        "title": "Clinical Case Officer & Wellness Specialist",
        "qualification": "MD (Psychiatry), AIIMS New Delhi",
        "experience": "9+ years experience",
        "specialization": "Stress Modulation, Longitudinal Well-being & Rehabilitation",
        "languages": ["English", "Hindi", "Malayalam", "Kannada"],
        "phone": "+91 98801 87652",
        "email": "arvind.menon@nirbhayamitra.com",
        "availability": "Tue – Sun, 10:00 AM – 7:00 PM IST",
        "location": "Regional Victim Support & Medical Triage Center, Visakhapatnam / Online",
        "rating": 4.8,
        "is_primary": False,
        "avatar_initials": "AM"
    }
]

# Educational & Practical Mental Health Resources (WHO & Trauma-Informed Aligned)
RESOURCES_DATA = [
    {
        "category": "Understanding Stress",
        "icon": "brain",
        "description": "Evidence-informed insights into how psychological distress and nervous system activation occur.",
        "articles": [
            {
                "id": "res-stress-01",
                "title": "The Autonomic Nervous System & Trauma Response",
                "read_time": "3 min read",
                "summary": "Understanding why your body reacts with hypervigilance, racing thoughts, or emotional numbing after distress.",
                "content": """When you encounter overwhelming stress or trauma, your autonomic nervous system activates survival circuits—commonly known as Fight, Flight, or Freeze.

Key physiological markers:
1. Sympathetic Arousal: Elevated heart rate, shallow breathing, heightened muscle tension.
2. Emotional Masking: Expressing 'I'm fine' verbally while the body remains in high arousal.
3. Cognitive Fog: Difficulty focusing or feeling mentally drained.

Recovery begins with physical safety cues: lengthening your exhale, unclenching your jaw, and acknowledging your feelings without self-judgment."""
            },
            {
                "id": "res-stress-02",
                "title": "Recognizing Emotional Overload Early",
                "read_time": "4 min read",
                "summary": "Practical warning signals that indicate when your coping capacity is reaching its threshold.",
                "content": """Emotional overload happens gradually before feeling unmanageable.

Early warning signs:
• Sleep fragmentation or frequent early morning awakenings.
• Irritability over minor daily disruptions.
• Reluctance to engage with supportive friends or family.
• Physical fatigue despite resting.

Taking micro-pauses throughout the day and checking in with your breath helps interrupt cumulative stress cycles."""
            }
        ]
    },
    {
        "category": "Managing Anxiety",
        "icon": "shield",
        "description": "Techniques for de-escalating racing thoughts, emotional panic, and somatic tension.",
        "articles": [
            {
                "id": "res-anx-01",
                "title": "Decoupling Racing Thoughts from Reality",
                "read_time": "3 min read",
                "summary": "How to create space between catastrophic internal narratives and present-moment safety.",
                "content": """Anxiety often projects past distress into future possibilities.

Practical protocol:
1. Name the thought: Tell yourself 'I am noticing a worried thought right now.'
2. Anchor in the present: Feel the physical weight of your feet firmly on the floor.
3. Breathe with an extended exhale: Inhale for 4 seconds, exhale for 6 seconds."""
            }
        ]
    },
    {
        "category": "Grounding Techniques",
        "icon": "compass",
        "description": "Immediate sensory grounding protocols to regain calm when experiencing acute distress.",
        "articles": [
            {
                "id": "res-ground-01",
                "title": "The 5-4-3-2-1 Sensory Grounding Method",
                "read_time": "2 min read",
                "summary": "A structured sensory orientation technique widely recommended in psychological first aid.",
                "content": """Sensory grounding shifts cognitive focus from internal distress to external sensory data.

Engage your senses step-by-step:
• 5 things you can SEE around you (shapes, colors, textures).
• 4 things you can physically TOUCH or FEEL (your clothes, chair, table).
• 3 things you can HEAR (ambient room sounds, distant voices, fan).
• 2 things you can SMELL (coffee, fresh air, paper).
• 1 thing you can TASTE or a sip of cool water."""
            },
            {
                "id": "res-ground-02",
                "title": "Progressive Muscle Relaxation (PMR)",
                "read_time": "4 min read",
                "summary": "Systematic tension-and-release to signal safety directly to your muscular system.",
                "content": """Muscle tension is a direct somatic consequence of distress. PMR involves tensing specific muscle groups for 5 seconds and releasing for 15 seconds.

Steps:
1. Clench both hands into gentle fists, hold for 5s, then release completely.
2. Shrug your shoulders up toward your ears, hold for 5s, then let them drop heavily.
3. Notice the warmth and relaxation flowing into the released muscles."""
            }
        ]
    },
    {
        "category": "Healthy Sleep",
        "icon": "moon",
        "description": "Trauma-informed sleep hygiene and nighttime relaxation practices.",
        "articles": [
            {
                "id": "res-sleep-01",
                "title": "Sleep Hygiene for Restorative Recovery",
                "read_time": "3 min read",
                "summary": "Creating a low-stress evening routine to facilitate deep, restorative slow-wave sleep.",
                "content": """Trauma significantly affects nocturnal heart rate variability and REM cycles.

Healthy sleep guidelines:
• Keep a consistent wake-up time regardless of when you fell asleep.
• Dim ambient lighting 45 minutes before resting.
• If unable to sleep after 25 minutes, get up and do a quiet, low-light activity."""
            }
        ]
    },
    {
        "category": "Building Support",
        "icon": "users",
        "description": "How to establish safe interpersonal boundaries and connect with support circles.",
        "articles": [
            {
                "id": "res-support-01",
                "title": "Communicating Boundaries with Safe People",
                "read_time": "3 min read",
                "summary": "Expressing your emotional boundaries clearly while maintaining meaningful social connection.",
                "content": """You do not have to explain everything to everyone.

Helpful boundary phrases:
• 'I value our conversation, but I don't have the emotional capacity to discuss this topic today.'
• 'What would help me most right now is just having quiet company.'"""
            }
        ]
    },
    {
        "category": "When to Seek Help",
        "icon": "heart",
        "description": "Guidance on recognizing when professional support and emergency outreach are recommended.",
        "articles": [
            {
                "id": "res-help-01",
                "title": "Navigating Confidential Care & Professional Triage",
                "read_time": "3 min read",
                "summary": "Understanding your rights, confidentiality protections, and counsellor assistance channels.",
                "content": """Seeking support is an act of courage and proactive self-care.

Your assigned counsellor is available to discuss:
• Emotional distress management and trauma coping strategies.
• Legal relief provisions and witness protection welfare schemes.
• Referrals to specialized medical or psychological healthcare."""
            }
        ]
    }
]

# Guided Interactive Exercises
QUICK_EXERCISES_DATA = [
    {
        "id": "ex-breathing",
        "title": "2-Minute Box Breathing",
        "duration": "2 mins",
        "type": "breathing",
        "tag": "Calming & Vagus Nerve Stimulation",
        "description": "Regulate autonomic heart rate through a balanced 4-4-4-4 second breath cycle.",
        "steps": [
            {"phase": "Inhale", "seconds": 4, "guidance": "Inhale smoothly through your nose, filling your lower lungs."},
            {"phase": "Hold", "seconds": 4, "guidance": "Hold gently without straining. Notice stillness."},
            {"phase": "Exhale", "seconds": 4, "guidance": "Release slowly through your mouth, relaxing your shoulders."},
            {"phase": "Pause", "seconds": 4, "guidance": "Rest empty before the next breath."}
        ]
    },
    {
        "id": "ex-grounding",
        "title": "5-4-3-2-1 Sensory Grounding",
        "duration": "3 mins",
        "type": "grounding",
        "tag": "Panic & Overwhelm Reset",
        "description": "Anchor your awareness into your immediate environment step-by-step.",
        "steps": [
            {"phase": "Sight (5 items)", "guidance": "Identify 5 distinct objects in your visual field (colors, shapes)."},
            {"phase": "Touch (4 items)", "guidance": "Feel 4 textures around you (your sleeves, chair back, desk surface)."},
            {"phase": "Sound (3 items)", "guidance": "Listen for 3 background sounds (air flow, distant traffic, quiet hum)."},
            {"phase": "Smell (2 items)", "guidance": "Notice 2 scents or take a breath of fresh air."},
            {"phase": "Taste (1 item)", "guidance": "Notice 1 lingering taste or take a slow sip of room-temperature water."}
        ]
    },
    {
        "id": "ex-body-scan",
        "title": "Brief Somatic Reset",
        "duration": "2 mins",
        "type": "relaxation",
        "tag": "Muscle Tension Release",
        "description": "Release physical strain stored across your facial muscles, jaw, neck, and shoulders.",
        "steps": [
            {"phase": "Forehead & Eyes", "guidance": "Smooth your forehead and soften the space between your eyebrows."},
            {"phase": "Jaw & Teeth", "guidance": "Unclench your jaw and let your tongue rest gently on the floor of your mouth."},
            {"phase": "Neck & Shoulders", "guidance": "Inhale gently, and on the exhale let your shoulders drop 1 inch downward."}
        ]
    }
]


class UserPortalService:
    def __init__(self):
        self._init_local_stores()

    def _init_local_stores(self):
        if not APPOINTMENTS_FILE.exists():
            default_appointments = self._generate_default_appointments()
            with open(APPOINTMENTS_FILE, "w", encoding="utf-8") as f:
                json.dump(default_appointments, f, indent=2)

        if not DOCUMENTS_METADATA_FILE.exists():
            default_docs = self._generate_default_documents()
            with open(DOCUMENTS_METADATA_FILE, "w", encoding="utf-8") as f:
                json.dump(default_docs, f, indent=2)

    def _generate_default_appointments(self) -> Dict[str, List[Dict[str, Any]]]:
        """Seeds realistic initial appointments for Rohan and Ananya."""
        # Rohan Case 1 ID, Rohan Case 2 ID, Rohan Auth ID
        rohan_auth_id = "79fdd39b-4ccf-4778-a1c7-82712f08f051"
        rohan_case2_id = "a0a0a0a0-b0b0-c0c0-d0d0-e0e0e0e0e0e0"
        rohan_case1_id = "7d64f81f-8108-467a-ae43-36986d04766f"
        ananya_id = "60895178-7a8b-4392-961b-ac82d4b7ec0c"

        rohan_appts = [
            {
                "id": "appt-roh-01",
                "counsellor_id": "couns-001",
                "counsellor_name": "Dr. Radhika Iyer",
                "counsellor_title": "Senior Counselling Psychologist",
                "service": "Trauma & Stress De-escalation Session",
                "date": "2026-09-12",
                "time": "04:00 PM IST",
                "datetime_iso": "2026-09-12T10:30:00Z",
                "mode": "Secure Video Consultation",
                "location": "Mann Sathi Telehealth Room #104",
                "duration": "45 mins",
                "status": "Confirmed",
                "is_upcoming": True,
                "notes": "Follow-up discussion on distress management and weekly progress."
            },
            {
                "id": "appt-roh-02",
                "counsellor_id": "couns-002",
                "counsellor_name": "Dr. Arvind Menon",
                "counsellor_title": "Clinical Case Officer",
                "service": "Longitudinal Well-being Check & Routine Review",
                "date": "2026-09-19",
                "time": "11:30 AM IST",
                "datetime_iso": "2026-09-19T06:00:00Z",
                "mode": "In-Person Consultation",
                "location": "Wellness Center, Room 204, Amaravati Support Hub",
                "duration": "30 mins",
                "status": "Scheduled",
                "is_upcoming": True,
                "notes": "Evaluation of physiological resting baseline and sleep wellness."
            },
            {
                "id": "appt-roh-03",
                "counsellor_id": "couns-001",
                "counsellor_name": "Dr. Radhika Iyer",
                "counsellor_title": "Senior Counselling Psychologist",
                "service": "Initial Case Intake & Baseline Assessment",
                "date": "2026-08-28",
                "time": "03:00 PM IST",
                "datetime_iso": "2026-08-28T09:30:00Z",
                "mode": "Secure Video Consultation",
                "location": "Telehealth Room #101",
                "duration": "50 mins",
                "status": "Completed",
                "is_upcoming": False,
                "notes": "Baseline intake completed. Patient enrolled into trauma-informed monitoring."
            }
        ]

        ananya_appts = [
            {
                "id": "appt-ana-01",
                "counsellor_id": "couns-001",
                "counsellor_name": "Dr. Radhika Iyer",
                "counsellor_title": "Senior Counselling Psychologist",
                "service": "Weekly Emotional Support & Grounding Review",
                "date": "2026-09-13",
                "time": "02:30 PM IST",
                "datetime_iso": "2026-09-13T09:00:00Z",
                "mode": "Secure Video Consultation",
                "location": "Mann Sathi Telehealth Room #102",
                "duration": "45 mins",
                "status": "Confirmed",
                "is_upcoming": True,
                "notes": "Review of daily stress coping techniques and relaxation consistency."
            },
            {
                "id": "appt-ana-02",
                "counsellor_id": "couns-002",
                "counsellor_name": "Dr. Arvind Menon",
                "counsellor_title": "Clinical Case Officer",
                "service": "Legal Relief & Victim Assistance Guidance",
                "date": "2026-09-20",
                "time": "05:00 PM IST",
                "datetime_iso": "2026-09-20T11:30:00Z",
                "mode": "Secure Phone Consultation",
                "location": "Confidential Helpline Channel",
                "duration": "30 mins",
                "status": "Scheduled",
                "is_upcoming": True,
                "notes": "Discussion on support provisions under Section 15A."
            },
            {
                "id": "appt-ana-03",
                "counsellor_id": "couns-001",
                "counsellor_name": "Dr. Radhika Iyer",
                "counsellor_title": "Senior Counselling Psychologist",
                "service": "Initial Case Intake & Orientation",
                "date": "2026-08-30",
                "time": "10:00 AM IST",
                "datetime_iso": "2026-08-30T04:30:00Z",
                "mode": "Secure Video Consultation",
                "location": "Telehealth Room #104",
                "duration": "45 mins",
                "status": "Completed",
                "is_upcoming": False,
                "notes": "Initial consultation completed. Check-in protocols explained."
            }
        ]

        return {
            rohan_auth_id: rohan_appts,
            rohan_case1_id: rohan_appts,
            rohan_case2_id: rohan_appts,
            ananya_id: ananya_appts
        }

    def _generate_default_documents(self) -> Dict[str, List[Dict[str, Any]]]:
        """Seeds realistic initial case documents."""
        rohan_auth_id = "79fdd39b-4ccf-4778-a1c7-82712f08f051"
        rohan_case2_id = "a0a0a0a0-b0b0-c0c0-d0d0-e0e0e0e0e0e0"
        rohan_case1_id = "7d64f81f-8108-467a-ae43-36986d04766f"
        ananya_id = "60895178-7a8b-4392-961b-ac82d4b7ec0c"

        rohan_docs = [
            {
                "id": "doc-roh-01",
                "file_name": "Case_Enrollment_Summary.pdf",
                "file_size": "245 KB",
                "file_type": "PDF",
                "uploaded_at": "2026-08-28T14:30:00Z",
                "uploaded_at_formatted": "28 August 2026",
                "description": "Official confirmation of intake and support enrollment.",
                "category": "Official Records",
                "is_seeded": True
            },
            {
                "id": "doc-roh-02",
                "file_name": "Consent_and_Welfare_Form.pdf",
                "file_size": "180 KB",
                "file_type": "PDF",
                "uploaded_at": "2026-08-28T14:35:00Z",
                "uploaded_at_formatted": "28 August 2026",
                "description": "Signed data protection and counseling consent document.",
                "category": "Consent Forms",
                "is_seeded": True
            }
        ]

        ananya_docs = [
            {
                "id": "doc-ana-01",
                "file_name": "Intake_Orientation_Summary.pdf",
                "file_size": "230 KB",
                "file_type": "PDF",
                "uploaded_at": "2026-08-30T10:15:00Z",
                "uploaded_at_formatted": "30 August 2026",
                "description": "Initial case assessment and safety plan overview.",
                "category": "Official Records",
                "is_seeded": True
            }
        ]

        return {
            rohan_auth_id: rohan_docs,
            rohan_case1_id: rohan_docs,
            rohan_case2_id: rohan_docs,
            ananya_id: ananya_docs
        }

    def _get_appointments_map(self) -> Dict[str, List[Dict[str, Any]]]:
        if not APPOINTMENTS_FILE.exists():
            self._init_local_stores()
        try:
            with open(APPOINTMENTS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Error reading appointments file: {e}")
            return self._generate_default_appointments()

    def _save_appointments_map(self, data: Dict[str, List[Dict[str, Any]]]):
        with open(APPOINTMENTS_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)

    def _get_documents_map(self) -> Dict[str, List[Dict[str, Any]]]:
        if not DOCUMENTS_METADATA_FILE.exists():
            self._init_local_stores()
        try:
            with open(DOCUMENTS_METADATA_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Error reading documents metadata file: {e}")
            return self._generate_default_documents()

    def _save_documents_map(self, data: Dict[str, List[Dict[str, Any]]]):
        with open(DOCUMENTS_METADATA_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)

    def get_home_snapshot(self, user_id: str) -> Dict[str, Any]:
        """
        Builds a simple, personalized daily wellness Home snapshot:
        1. Welcome greeting ("Welcome back, Rohan")
        2. Today's Activity (Steps & progress toward daily goal)
        3. A Place Nearby (Relaxing outdoor spot matching user's location)
        4. Sleep cycle (Duration & timing from last night)
        """
        case_id = conversation_session_manager.get_active_case_id_for_user(user_id)
        
        user_name = "User"
        try:
            users_list = supabase.auth.admin.list_users()
            auth_users = users_list if isinstance(users_list, list) else getattr(users_list, "users", [])
            for u in auth_users:
                if str(u.id) == str(user_id):
                    meta = getattr(u, "user_metadata", {}) or {}
                    user_name = meta.get("name", "User")
                    break
        except Exception as e:
            logger.warning(f"Error resolving user name for home snapshot: {e}")

        first_name = user_name.split()[0] if user_name else "there"
        is_ananya = "ananya" in user_name.lower() or "60895178" in str(user_id)

        # 1. Activity / Steps Data (Seeded realistically per user)
        if is_ananya:
            steps_data = {
                "steps_today": 7210,
                "goal": 8000,
                "progress_pct": 90.1,
                "distance_km": "5.2 km",
                "active_time": "58 mins",
                "summary": "7,210 of 8,000 daily goal"
            }
        else:
            steps_data = {
                "steps_today": 6842,
                "goal": 8000,
                "progress_pct": 85.5,
                "distance_km": "4.9 km",
                "active_time": "52 mins",
                "summary": "6,842 of 8,000 daily goal"
            }

        # 2. A Place Nearby (Matched to existing case locations: VIT-AP/Amaravati vs Visakhapatnam)
        if is_ananya:
            nearby_place = {
                "name": "Tenneti Beach Park & Coastal Promenade",
                "location_area": "Beach Road, Visakhapatnam",
                "approx_distance": "10 mins away",
                "tag": "Sea Breeze & Scenic Walkway",
                "description": "A nearby coastal park along the sea cliffs you could visit for a short walk or some fresh air.",
                "map_query": "Tenneti Park, Visakhapatnam, Andhra Pradesh",
                "google_maps_url": "https://www.google.com/maps/search/?api=1&query=Tenneti+Park+Visakhapatnam"
            }
        else:
            nearby_place = {
                "name": "Bhavani Island & Krishna Riverfront Walkway",
                "location_area": "Amaravati / Krishna Riverfront",
                "approx_distance": "12 mins away",
                "tag": "Riverside Greenery & Fresh Air",
                "description": "A nearby peaceful riverfront promenade you could visit for a short walk or some fresh air.",
                "map_query": "Bhavani Island, Vijayawada, Andhra Pradesh",
                "google_maps_url": "https://www.google.com/maps/search/?api=1&query=Bhavani+Island+Vijayawada"
            }

        # 3. Sleep Data (Seeded realistically per user)
        if is_ananya:
            sleep_data = {
                "duration_formatted": "7h 48m",
                "label": "Last night",
                "bedtime": "10:45 PM",
                "wake_time": "6:33 AM",
                "time_range": "10:45 PM — 6:33 AM",
                "quality": "Restful"
            }
        else:
            sleep_data = {
                "duration_formatted": "7h 24m",
                "label": "Last night",
                "bedtime": "11:08 PM",
                "wake_time": "6:32 AM",
                "time_range": "11:08 PM — 6:32 AM",
                "quality": "Restful"
            }

        return {
            "user_id": user_id,
            "case_id": case_id,
            "user_name": user_name,
            "first_name": first_name,
            "subtitle": "Here's a quick look at your day.",
            "activity": steps_data,
            "nearby_place": nearby_place,
            "sleep": sleep_data
        }


    def get_counsellors(self) -> List[Dict[str, Any]]:
        """Returns verified, assigned counsellor profiles."""
        return COUNSELLORS_DATA

    def get_user_appointments(self, user_id: str) -> Dict[str, Any]:
        """Returns personalized appointments for user."""
        appts_map = self._get_appointments_map()
        case_id = conversation_session_manager.get_active_case_id_for_user(user_id)

        user_appts = appts_map.get(str(user_id)) or appts_map.get(str(case_id))
        if not user_appts:
            # Fallback to Rohan / Ananya match
            for k in appts_map:
                if "79fdd39b" in str(user_id) or "7d64f81f" in str(user_id) or "a0a0a0a0" in str(user_id):
                    user_appts = appts_map.get("79fdd39b-4ccf-4778-a1c7-82712f08f051")
                    break
                elif "60895178" in str(user_id):
                    user_appts = appts_map.get("60895178-7a8b-4392-961b-ac82d4b7ec0c")
                    break

        if not user_appts:
            user_appts = appts_map.get("79fdd39b-4ccf-4778-a1c7-82712f08f051", [])

        upcoming = [a for a in user_appts if a.get("is_upcoming", True)]
        past = [a for a in user_appts if not a.get("is_upcoming", True)]

        return {
            "user_id": user_id,
            "upcoming": upcoming,
            "past": past,
            "total_count": len(user_appts)
        }

    def reschedule_appointment(self, user_id: str, appointment_id: str, new_date: str, new_time: str) -> Dict[str, Any]:
        """Reschedules an appointment with persistent update."""
        appts_map = self._get_appointments_map()
        case_id = conversation_session_manager.get_active_case_id_for_user(user_id)

        target_key = None
        for k in [str(user_id), str(case_id), "79fdd39b-4ccf-4778-a1c7-82712f08f051", "60895178-7a8b-4392-961b-ac82d4b7ec0c"]:
            if k in appts_map:
                for appt in appts_map[k]:
                    if appt["id"] == appointment_id:
                        target_key = k
                        break
            if target_key:
                break

        if not target_key:
            raise HTTPException(status_code=404, detail="Appointment not found")

        for appt in appts_map[target_key]:
            if appt["id"] == appointment_id:
                appt["date"] = new_date
                appt["time"] = new_time
                appt["status"] = "Rescheduled & Confirmed"
                self._save_appointments_map(appts_map)
                return {
                    "success": True,
                    "message": f"Appointment successfully rescheduled to {new_date} at {new_time}.",
                    "appointment": appt
                }

        raise HTTPException(status_code=404, detail="Appointment not found")

    def get_case_updates(self, user_id: str) -> Dict[str, Any]:
        """Returns user-facing neutral case updates and timeline."""
        case_id = conversation_session_manager.get_active_case_id_for_user(user_id)

        case_ref = "CASE-RECORD"
        enrollment_date_formatted = "August 2026"
        stage_label = "Active Support & Periodic Monitoring"

        try:
            case_res = supabase.table("cases").select("*").eq("id", case_id).execute()
            if case_res.data:
                c = case_res.data[0]
                case_ref = c.get("nhaa_ref", case_ref)
                enrollment_date = c.get("enrollment_date", "")
                if enrollment_date:
                    enrollment_date_formatted = format_ist(enrollment_date).split("at")[0].strip()
        except Exception as e:
            logger.warning(f"Error fetching case info for case updates: {e}")

        # Neutral timeline milestones
        milestones = [
            {
                "id": "ms-01",
                "title": "Case Support Review Completed",
                "date": "10 September 2026",
                "description": "Your support team reviewed your check-in progress and confirmed regular monitoring schedule.",
                "status": "completed",
                "badge": "Reviewed"
            },
            {
                "id": "ms-02",
                "title": "Consent & Privacy Protocol Confirmed",
                "date": enrollment_date_formatted,
                "description": "Active consent logged for confidential check-in companionship and counsellor care.",
                "status": "completed",
                "badge": "Active"
            },
            {
                "id": "ms-03",
                "title": "Intake & Companion Enrollment",
                "date": enrollment_date_formatted,
                "description": "Profile registered under statutory mental wellness and survivor support framework.",
                "status": "completed",
                "badge": "Enrolled"
            }
        ]

        notes = [
            "Your confidential check-in records have been safely synchronized.",
            "Your designated psychological care team is active for scheduled sessions.",
            "You can upload case documents or verification forms below whenever convenient."
        ]

        return {
            "case_id": case_id,
            "case_ref": case_ref,
            "stage_label": stage_label,
            "last_review_date": "10 September 2026",
            "support_team_notes": notes,
            "milestones": milestones
        }

    def get_user_documents(self, user_id: str) -> List[Dict[str, Any]]:
        """Returns list of uploaded documents for user."""
        docs_map = self._get_documents_map()
        case_id = conversation_session_manager.get_active_case_id_for_user(user_id)

        user_docs = docs_map.get(str(user_id)) or docs_map.get(str(case_id))
        if not user_docs:
            for k in docs_map:
                if "79fdd39b" in str(user_id) or "7d64f81f" in str(user_id) or "a0a0a0a0" in str(user_id):
                    user_docs = docs_map.get("79fdd39b-4ccf-4778-a1c7-82712f08f051")
                    break
                elif "60895178" in str(user_id):
                    user_docs = docs_map.get("60895178-7a8b-4392-961b-ac82d4b7ec0c")
                    break

        return user_docs or []

    def save_uploaded_document(self, user_id: str, filename: str, file_bytes: bytes) -> Dict[str, Any]:
        """
        Validates file type (PDF, DOC, DOCX) and size (<= 15MB), saves file, and updates metadata.
        """
        filename = filename or "uploaded_document.pdf"
        ext = Path(filename).suffix.lower()

        allowed_extensions = {".pdf", ".doc", ".docx"}
        if ext not in allowed_extensions:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file format '{ext}'. Only PDF, DOC, and DOCX files are permitted."
            )

        # Create user documents folder
        user_folder = DOCUMENTS_DIR / str(user_id)
        user_folder.mkdir(parents=True, exist_ok=True)

        doc_id = f"doc-{uuid.uuid4().hex[:8]}"
        safe_filename = f"{doc_id}_{filename}"
        dest_path = user_folder / safe_filename

        size_bytes = len(file_bytes)
        max_bytes = 15 * 1024 * 1024

        if size_bytes > max_bytes:
            raise HTTPException(
                status_code=400,
                detail="File size exceeds the 15 MB maximum limit."
            )

        with open(dest_path, "wb") as f:
            f.write(file_bytes)

        # Format size
        if size_bytes >= 1024 * 1024:
            size_formatted = f"{size_bytes / (1024 * 1024):.1f} MB"
        else:
            size_formatted = f"{max(1, size_bytes // 1024)} KB"

        file_type_label = "PDF" if ext == ".pdf" else "DOCX" if ext == ".docx" else "DOC"
        upload_time_str = datetime.now(timezone.utc).isoformat()
        date_formatted = datetime.now().strftime("%d %B %Y")

        new_doc = {
            "id": doc_id,
            "file_name": filename,
            "file_size": size_formatted,
            "file_type": file_type_label,
            "uploaded_at": upload_time_str,
            "uploaded_at_formatted": date_formatted,
            "description": "User uploaded supporting case document.",
            "category": "User Upload",
            "is_seeded": False,
            "saved_file_name": safe_filename
        }

        # Update metadata store
        docs_map = self._get_documents_map()
        if str(user_id) not in docs_map:
            docs_map[str(user_id)] = []
        docs_map[str(user_id)].insert(0, new_doc)
        self._save_documents_map(docs_map)

        return new_doc

    def get_document_file_path(self, user_id: str, doc_id: str) -> tuple[str, str]:
        """
        Returns (file_path, original_filename) for a document.
        Generates synthetic file if it was seeded and not present on disk.
        """
        docs_map = self._get_documents_map()
        user_docs = docs_map.get(str(user_id)) or []
        if not user_docs:
            for k in docs_map:
                if str(user_id) in k or k in str(user_id):
                    user_docs = docs_map[k]
                    break
        if not user_docs:
            user_docs = self.get_user_documents(user_id)

        target_doc = None
        for doc in user_docs:
            if doc["id"] == doc_id:
                target_doc = doc
                break

        if not target_doc:
            raise HTTPException(status_code=404, detail="Document metadata not found.")

        original_filename = target_doc["file_name"]
        user_folder = DOCUMENTS_DIR / str(user_id)
        user_folder.mkdir(parents=True, exist_ok=True)

        saved_name = target_doc.get("saved_file_name") or f"{doc_id}_{original_filename}"
        dest_path = user_folder / saved_name

        if not dest_path.exists():
            # Create a placeholder file with meaningful header
            content = f"Official Case Document: {original_filename}\nIssued for User ID: {user_id}\nClassification: Confidential Psychological Care Record\n".encode("utf-8")
            with open(dest_path, "wb") as f:
                f.write(content)

        return str(dest_path), original_filename

    def get_resources(self) -> Dict[str, Any]:
        """Returns structured mental wellbeing education and quick self-help exercises."""
        return {
            "categories": RESOURCES_DATA,
            "quick_exercises": QUICK_EXERCISES_DATA
        }


user_portal_service = UserPortalService()

