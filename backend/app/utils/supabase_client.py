import os
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client, Client

# Load environment configuration from workspace root
for p in [Path(__file__).resolve().parents[3] / ".env", Path(__file__).resolve().parents[2] / ".env", Path(".env")]:
    if p.exists():
        load_dotenv(dotenv_path=p)
        break
load_dotenv()

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_KEY")

if not url or not key:
    raise ValueError("Missing SUPABASE_URL or SUPABASE_KEY in environment configuration.")

supabase: Client = create_client(url, key)

def get_supabase_client() -> Client:
    return supabase
