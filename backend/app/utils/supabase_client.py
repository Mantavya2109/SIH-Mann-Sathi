import os
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client, Client

# Load environment configuration from workspace root

env_path = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(dotenv_path=env_path)

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_KEY")

if not url or not key:
    raise ValueError("Missing SUPABASE_URL or SUPABASE_KEY in environment configuration.")

supabase: Client = create_client(url, key)
