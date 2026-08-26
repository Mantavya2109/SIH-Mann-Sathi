import os
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(dotenv_path=Path(__file__).resolve().parents[2] / ".env")

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_KEY")

print("URL loaded:", url)
print("Key loaded:", key[:20] + "..." if key else None)

supabase = create_client(url, key)
print("Client created successfully")
