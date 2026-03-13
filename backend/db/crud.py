from backend.db.supabase_client import supabase
from typing import Any

def save_prompt(prompt: str) -> str:
    try:
        data = {
            "prompt_text": prompt,
            "status": "processing"
        }

        res = supabase.table("prompts").insert(data).execute()

        # ensure response exists
        if not res or not res.data:
            raise Exception("Prompt insert failed")

        # Use type: ignore to bypass the type checker
        inserted_row = res.data[0]  # type: ignore
        return str(inserted_row["id"])  # type: ignore

    except Exception as e:
        raise Exception(f"Database error while saving prompt: {str(e)}")


def save_generated_code(prompt_id: str, code: str) -> None:
    try:
        data = {
            "prompt_id": prompt_id,
            "manim_code": code
        }

        res = supabase.table("generated_code").insert(data).execute()

        if not res or res.data is None:
            raise Exception("Generated code insert failed")
        
        # Check if data exists (optional)
        if hasattr(res, 'data') and res.data:
            pass  # Success

    except Exception as e:
        raise Exception(f"Database error while saving generated code: {str(e)}")


def save_video(prompt_id: str, video_url: str) -> None:
    try:
        data = {
            "prompt_id": prompt_id,
            "video_url": video_url
        }

        res = supabase.table("videos").insert(data).execute()

        if not res or res.data is None:
            raise Exception("Video insert failed")

    except Exception as e:
        raise Exception(f"Database error while saving video: {str(e)}")