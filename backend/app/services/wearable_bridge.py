"""
wearable_bridge.py

Pulls live readings from ThingSpeak (uploaded by the ESP32 every 15s) and
feeds them into the Mann Saathi backend the same way a voice/text check-in
does -- through check_ins + fuse_signals().

MAPPING NOTE:
The ESP32 firmware provides: heart rate (BPM), SpO2, body temperature, a
0/1/2 stress heuristic (thresholded off HR/SpO2/temp), and fall detection.
It does NOT provide HRV, EDA, or sleep data -- don't map this into those
fields.

Fall detection is handled separately from the distress score -- it's a
physical safety event, triggers its own immediate alert, same pattern as
safety_check.py's acute-risk trigger.
"""

import os
import requests
import datetime

from backend.app.utils.timezone_utils import parse_to_utc, utc_now, format_utc_iso

CHANNEL_ID = os.environ.get("THINGSPEAK_CHANNEL_ID", "")
READ_API_KEY = os.environ.get("THINGSPEAK_READ_API_KEY", "")  # empty if channel is public

THINGSPEAK_URL = f"https://api.thingspeak.com/channels/{CHANNEL_ID}/feeds.json"


def _to_number(value):
    if value is None:
        return None
    try:
        value = str(value).strip()
        return float(value) if value != "" else None
    except (ValueError, TypeError):
        return None


def fetch_latest_reading() -> dict | None:
    """
    Returns the most recent valid reading from ThingSpeak, or None if the
    channel is unreachable/empty.
    """
    params = {"results": 10}
    if READ_API_KEY.strip():
        params["api_key"] = READ_API_KEY.strip()

    try:
        r = requests.get(THINGSPEAK_URL, params=params, timeout=10)
        r.raise_for_status()
        data = r.json()
    except requests.RequestException as e:
        print("ThingSpeak fetch error:", e)
        return None

    feeds = data.get("feeds", [])
    if not feeds:
        return None

    def last_valid(field):
        for feed in reversed(feeds):
            v = _to_number(feed.get(field))
            if v is not None:
                return v
        return None

    return {
        "heart_rate": last_valid("field1"),
        "spo2": last_valid("field2"),
        "body_temperature": last_valid("field3"),
        "device_stress_heuristic": last_valid("field4"),
        "fall_detected": last_valid("field5") == 1.0,
        "timestamp": feeds[-1].get("created_at"),
    }


def sync_wearable_reading(case_id: str, supabase_client) -> dict:
    """
    Fetches the latest reading and writes it as a check_in, channel='wearable'.

    Called on every /api/wearable/analysis poll (roughly every 15s from the
    frontend) so the dashboard picks up each new ThingSpeak reading on its
    own. To avoid flooding check_ins with duplicate rows when ThingSpeak
    hasn't produced a new reading yet (e.g. no finger on the sensor), this
    skips the insert if the latest stored wearable check_in already has the
    same ThingSpeak timestamp.
    """
    reading = fetch_latest_reading()
    if reading is None:
        return {"success": False, "reason": "no_thingspeak_data"}

    ts = reading["timestamp"] or datetime.datetime.utcnow().isoformat()

    try:
        last_ci = supabase_client.table("check_ins") \
            .select("timestamp") \
            .eq("case_id", case_id) \
            .eq("channel", "wearable") \
            .order("timestamp", desc=True) \
            .limit(1) \
            .execute()
        if last_ci.data and last_ci.data[0].get("timestamp") == ts:
            return {"success": True, "reading": reading, "fall_alert_created": False, "skipped_duplicate": True}
    except Exception as e:
        print("Failed to check for duplicate wearable reading:", e)

    check_in = {
        "case_id": case_id,
        "timestamp": ts,
        "channel": "wearable",
        "raw_text": None,
        "voice_features": {
            "heart_rate": reading["heart_rate"],
            "spo2": reading["spo2"],
            "body_temperature": reading["body_temperature"],
            "device_stress_heuristic": reading["device_stress_heuristic"],
        },
    }
    ci_row = supabase_client.table("check_ins").insert(check_in).execute()

    result = {
        "success": True,
        "check_in_id": ci_row.data[0]["id"],
        "reading": reading,
        "fall_alert_created": False,
    }

    if reading["fall_detected"]:
        alert = {
            "case_id": case_id,
            "distress_score_id": None,
            "recommendation_text": (
                "Wearable fall-detection triggered. This is a physical "
                "safety signal -- a counsellor or emergency contact "
                "should check on this person directly and promptly."
            ),
            "cited_provisions": [],
            "status": "pending",
        }
        supabase_client.table("alerts").insert(alert).execute()
        result["fall_alert_created"] = True

    return result


NOT_RESPONDING_THRESHOLD_MINUTES = 30

# Marker substring used to identify "wearable not responding" alerts among
# the generic alerts table rows (there's no dedicated alert_type column),
# so we don't create a duplicate for the same silence period on every poll.
NOT_RESPONDING_ALERT_MARKER = "Wearable has not reported data"


def _build_analysis_text(recent_readings: list[dict]) -> str | None:
    """
    Builds a short plain-English trend summary from the last 5-10 wearable
    readings' voice_features. Pure numeric comparison, no LLM call.

    `recent_readings` is expected newest-first (as returned by the
    check_ins query, ordered by timestamp desc).
    """
    features_newest_first = [
        (row.get("voice_features") or {}) for row in recent_readings[:10]
    ]
    if not features_newest_first:
        return None

    # Work in chronological order (oldest -> newest) for trend comparison.
    features_chrono = list(reversed(features_newest_first))

    def numeric_series(key):
        return [f[key] for f in features_chrono if isinstance(f.get(key), (int, float))]

    hr_series = numeric_series("heart_rate")
    stress_series = numeric_series("device_stress_heuristic")
    spo2_series = numeric_series("spo2")
    temp_series = numeric_series("body_temperature")

    def trend_note(series, label, unit="", rising_delta=5.0):
        if len(series) < 2:
            return None
        first_half = series[: max(1, len(series) // 2)]
        second_half = series[max(1, len(series) // 2):]
        avg_first = sum(first_half) / len(first_half)
        avg_second = sum(second_half) / len(second_half)
        delta = avg_second - avg_first
        latest = series[-1]
        if delta >= rising_delta:
            return f"{label} has been trending up (now ~{latest:.0f}{unit})"
        elif delta <= -rising_delta:
            return f"{label} has been trending down (now ~{latest:.0f}{unit})"
        else:
            return f"{label} looks stable (~{latest:.0f}{unit})"

    notes = []

    hr_note = trend_note(hr_series, "Heart rate", " bpm", rising_delta=8.0)
    if hr_note:
        notes.append(hr_note)

    stress_note = trend_note(stress_series, "Stress heuristic", "", rising_delta=0.5)
    if stress_note:
        notes.append(stress_note)

    if spo2_series and spo2_series[-1] < 94:
        notes.append(f"SpO2 is low (~{spo2_series[-1]:.0f}%)")

    if temp_series and temp_series[-1] >= 38.0:
        notes.append(f"body temperature is elevated (~{temp_series[-1]:.1f}°C)")

    if not notes:
        return "Recent wearable readings look normal, no significant trend detected."

    return "; ".join(notes) + "."


def _has_open_not_responding_alert(case_id: str, supabase_client) -> bool:
    """
    Returns True if there's already an unresolved (status='pending') "not
    responding" alert for this case, so we don't spam a new one on every
    poll during the same silence period.
    """
    try:
        existing = supabase_client.table("alerts") \
            .select("id, recommendation_text, status") \
            .eq("case_id", case_id) \
            .eq("status", "pending") \
            .execute()
    except Exception as e:
        print("Failed to check existing wearable alerts:", e)
        # Fail safe: assume one might already exist rather than risk spamming.
        return True

    for row in existing.data or []:
        if NOT_RESPONDING_ALERT_MARKER in (row.get("recommendation_text") or ""):
            return True
    return False


def analyze_wearable_status(case_id: str, supabase_client) -> dict:
    """
    Looks at the most recent wearable check_ins for this case and reports
    whether the wearable is actively reporting, has gone quiet, or has
    never sent data -- plus a short numeric trend summary when active.
    """
    resp = supabase_client.table("check_ins") \
        .select("*") \
        .eq("case_id", case_id) \
        .eq("channel", "wearable") \
        .order("timestamp", desc=True) \
        .limit(10) \
        .execute()

    readings = resp.data or []

    if not readings:
        return {
            "status": "no_data",
            "message": "No wearable data received yet for this case.",
            "last_reading_time": None,
            "minutes_since_last_reading": None,
            "current_reading": None,
            "recent_readings": [],
            "analysis_text": None,
        }

    latest = readings[0]
    last_ts_raw = latest.get("timestamp")
    last_dt = parse_to_utc(last_ts_raw)

    minutes_since_last_reading = None
    if last_dt is not None:
        minutes_since_last_reading = (utc_now() - last_dt).total_seconds() / 60.0

    current_reading = latest.get("voice_features") or None

    # If we can't even parse the timestamp, treat it as stale/unreliable
    # rather than silently reporting "active".
    if minutes_since_last_reading is None or minutes_since_last_reading > NOT_RESPONDING_THRESHOLD_MINUTES:
        status_value = "not_responding"
        analysis_text = None
    else:
        status_value = "active"
        analysis_text = _build_analysis_text(readings)

    result = {
        "status": status_value,
        "last_reading_time": format_utc_iso(last_ts_raw),
        "minutes_since_last_reading": (
            round(minutes_since_last_reading, 1) if minutes_since_last_reading is not None else None
        ),
        "current_reading": current_reading,
        "recent_readings": readings,
        "analysis_text": analysis_text,
    }

    if status_value == "not_responding" and not _has_open_not_responding_alert(case_id, supabase_client):
        alert = {
            "case_id": case_id,
            "distress_score_id": None,
            "recommendation_text": (
                f"{NOT_RESPONDING_ALERT_MARKER} in over 30 minutes -- this may "
                "indicate the device was removed or the person is unreachable. "
                "A counsellor should check in directly."
            ),
            "cited_provisions": [],
            "status": "pending",
        }
        supabase_client.table("alerts").insert(alert).execute()
        result["not_responding_alert_created"] = True
    else:
        result["not_responding_alert_created"] = False

    return result


if __name__ == "__main__":
    latest = fetch_latest_reading()
    print(latest)