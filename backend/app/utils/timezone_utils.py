"""
Centralized timezone utility for Nirbhaya Mitra application.
Handles Asia/Kolkata (IST = UTC+05:30) and UTC representations consistently.
"""
from datetime import datetime, timezone, timedelta
from typing import Optional, Union
import logging

try:
    from zoneinfo import ZoneInfo
    IST_ZONE = ZoneInfo("Asia/Kolkata")
except Exception:
    IST_ZONE = timezone(timedelta(hours=5, minutes=30), name="Asia/Kolkata")

UTC_ZONE = timezone.utc
logger = logging.getLogger(__name__)

def utc_now() -> datetime:
    """Returns the current timezone-aware UTC datetime."""
    return datetime.now(UTC_ZONE)

def utc_now_iso() -> str:
    """Returns the current aware UTC datetime formatted as ISO-8601 string with explicit Z."""
    return datetime.now(UTC_ZONE).isoformat().replace("+00:00", "Z")

def ist_now() -> datetime:
    """Returns the current timezone-aware IST datetime."""
    return datetime.now(IST_ZONE)

def parse_to_utc(ts_input: Union[str, int, float, datetime, None]) -> Optional[datetime]:
    """
    Parses any timestamp (float epoch, naive ISO, aware ISO, datetime) into a timezone-aware UTC datetime.
    Guarantees consistent instant evaluation regardless of input formatting.
    """
    if ts_input is None:
        return None
    if isinstance(ts_input, datetime):
        if ts_input.tzinfo is None:
            return ts_input.replace(tzinfo=UTC_ZONE)
        return ts_input.astimezone(UTC_ZONE)
    if isinstance(ts_input, (int, float)):
        # Handle seconds vs milliseconds
        seconds = ts_input / 1000.0 if ts_input > 1e11 else float(ts_input)
        return datetime.fromtimestamp(seconds, tz=UTC_ZONE)
    if isinstance(ts_input, str):
        clean_str = ts_input.strip()
        if not clean_str:
            return None
        # Handle numeric string
        try:
            val = float(clean_str)
            seconds = val / 1000.0 if val > 1e11 else val
            return datetime.fromtimestamp(seconds, tz=UTC_ZONE)
        except ValueError:
            pass
        # Handle ISO formats
        iso_str = clean_str
        if iso_str.endswith("Z"):
            iso_str = iso_str[:-1] + "+00:00"
        try:
            dt = datetime.fromisoformat(iso_str)
            if dt.tzinfo is None:
                # Naive ISO string (e.g. from Supabase timestamp column) is UTC
                return dt.replace(tzinfo=UTC_ZONE)
            return dt.astimezone(UTC_ZONE)
        except Exception as e:
            logger.warning(f"Failed to parse timestamp string '{ts_input}': {e}")
            return None
    return None

def to_ist(ts_input: Union[str, int, float, datetime, None]) -> Optional[datetime]:
    """
    Converts any timestamp input into a timezone-aware IST (Asia/Kolkata) datetime.
    """
    utc_dt = parse_to_utc(ts_input)
    if utc_dt is None:
        return None
    return utc_dt.astimezone(IST_ZONE)

def format_utc_iso(ts_input: Union[str, int, float, datetime, None]) -> Optional[str]:
    """
    Converts any timestamp input into a clean, explicit ISO-8601 UTC string (e.g. '2026-08-29T06:23:00.540834Z').
    """
    utc_dt = parse_to_utc(ts_input)
    if utc_dt is None:
        return None
    iso_val = utc_dt.isoformat()
    if iso_val.endswith("+00:00"):
        return iso_val[:-6] + "Z"
    return iso_val

def format_ist(ts_input: Union[str, int, float, datetime, None], include_seconds: bool = True) -> str:
    """
    Formats any timestamp into a human-readable India Standard Time representation.
    Example: '29 Aug 2026, 11:53:00 am IST'
    """
    ist_dt = to_ist(ts_input)
    if ist_dt is None:
        return "N/A"
    sec_fmt = ":%S" if include_seconds else ""
    return ist_dt.strftime(f"%d %b %Y, %I:%M{sec_fmt} %p IST")

def get_ist_date_key(ts_input: Union[str, int, float, datetime, None]) -> str:
    """
    Returns the YYYY-MM-DD date key in Asia/Kolkata timezone.
    Crucial for midnight-boundary evaluation of Today vs Yesterday.
    """
    ist_dt = to_ist(ts_input)
    if ist_dt is None:
        return ""
    return ist_dt.strftime("%Y-%m-%d")

# Alias for backwards compatibility
parse_utc_timestamp = parse_to_utc
