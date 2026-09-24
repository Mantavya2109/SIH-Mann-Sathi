import sys, os
sys.path.insert(0, os.getcwd())
from backend.app.utils.supabase_client import supabase
from backend.app.utils.timezone_utils import format_ist, format_utc_iso

case_id = 'a0a0a0a0-b0b0-c0c0-d0d0-e0e0e0e0e0e0'

print('=== ALL CHECK_INS FOR ROHAN CASE 2 ===')
ci_res = supabase.table('check_ins').select('*').eq('case_id', case_id).order('timestamp', desc=False).execute()
checkins = ci_res.data or []
print(f'Total check_ins: {len(checkins)}')
for i, ci in enumerate(checkins):
    raw_text = ci.get('raw_text') or ci.get('transcript') or ''
    vf = ci.get('voice_features')
    channel = ci.get('channel')
    ts = ci.get('timestamp')
    print(f"[{i}] ID: {ci.get('id')} | TS: {ts} ({format_ist(ts)}) | Chan: {channel} | Text: {repr(raw_text[:30])} | Voice: {bool(vf)}")

print('\n=== ALL DISTRESS_SCORES FOR ROHAN CASE 2 ===')
ds_res = supabase.table('distress_scores').select('*').eq('case_id', case_id).order('timestamp', desc=False).execute()
scores = ds_res.data or []
print(f'Total distress_scores: {len(scores)}')
for i, ds in enumerate(scores):
    sub = ds.get('sub_scores') or {}
    raw_an = sub.get('raw_analysis') or {}
    fm = raw_an.get('fusion_metrics') or {}
    ts = ds.get('timestamp')
    print(f"[{i}] ID: {ds.get('id')} | TS: {ts} ({format_ist(ts)}) | Total: {ds.get('total_score')} | Tier: {ds.get('risk_tier')} | FM: {fm}")

print('\n=== ALL ALERTS FOR ROHAN CASE 2 ===')
al_res = supabase.table('alerts').select('*').eq('case_id', case_id).order('created_at', desc=False).execute()
alerts = al_res.data or []
print(f'Total alerts: {len(alerts)}')
for i, al in enumerate(alerts):
    ts = al.get('created_at')
    print(f"[{i}] ID: {al.get('id')} | Created: {ts} ({format_ist(ts)}) | Status: {al.get('status')}")
