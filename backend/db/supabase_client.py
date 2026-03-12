import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_KEY")

if url is None or key is None:
    raise ValueError("Supabase environment variables are missing")

supabase = create_client(url, key)

        