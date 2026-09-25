import os
import logging
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client, Client
from typing import Optional

logger = logging.getLogger(__name__)

# Load environment configuration from workspace root
for p in [Path(__file__).resolve().parents[3] / ".env", Path(__file__).resolve().parents[2] / ".env", Path(".env")]:
    if p.exists():
        load_dotenv(dotenv_path=p)
        break
load_dotenv()

_supabase_client: Optional[Client] = None

def get_supabase_client() -> Client:
    global _supabase_client
    if _supabase_client is not None:
        return _supabase_client
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_KEY")
    if not url or not key:
        logger.error("Missing SUPABASE_URL or SUPABASE_KEY in environment configuration.")
        raise ValueError("Missing SUPABASE_URL or SUPABASE_KEY in environment configuration. Please configure them in Vercel / environment variables.")
    _supabase_client = create_client(url, key)
    return _supabase_client

class _LazySupabaseProxy:
    def __getattr__(self, name):
        client = get_supabase_client()
        return getattr(client, name)

supabase: Client = _LazySupabaseProxy()  # type: ignore

