from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from pathlib import Path
import subprocess
import tempfile
import shutil
import uuid 

from backend.pipeline.rag_pipeline import ManimRAG
from backend.db.crud import save_prompt, save_generated_code, save_video
from backend.services.insight_service import stream_insight

router = APIRouter()

# =========================
# MODELS
# =========================

class GenerateRequest(BaseModel):
    prompt: str


class GenerateResponse(BaseModel):
    status: str
    video_url: str | None = None
    error: str | None = None
    code: str | None = None
    attempts: int | None = None
    quality_score: float | None = None


# =========================
# INIT RAG
# =========================

try:
    rag = ManimRAG()
except Exception as exc:
    rag = None
    _startup_error = exc
else:
    _startup_error = None


# =========================
# SECURITY
# =========================

BLOCKED_PATTERNS = [
    "import os",
    "import sys",
    "subprocess",
    "socket",
    "requests",
    "open(",
    "eval(",
    "exec(",
    "__import__",
]


def sanitize_code(code: str):
    for pattern in BLOCKED_PATTERNS:
        if pattern in code:
            raise ValueError(f"Blocked unsafe pattern: {pattern}")

    if not code.strip().startswith("from manim import *"):
        raise ValueError("Code must start with: from manim import *")


# =========================
# ENDPOINT
# =========================

@router.post("/generate", response_model=GenerateResponse)
def generate(req: GenerateRequest):

    if rag is None:
        raise HTTPException(
            status_code=500,
            detail=f"RAG engine failed to initialize: {_startup_error}"
        )

    prompt = req.prompt.strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="prompt cannot be empty")

    # 1 store prompt in DB
    prompt_id = save_prompt(prompt)

    job_id = str(uuid.uuid4())
    work_dir = Path(tempfile.mkdtemp(prefix="manim_job_"))
    output_dir = work_dir / "output"
    output_dir.mkdir()

    try:

        result = rag.generate(prompt)

        code = result.get("code", "")
        success = result.get("success", False)
        attempts = result.get("attempts", 0)
        quality_score = result.get("quality_score", 0.0)

        if not success:
            return {"status": "failure", "error": "code generation failed"}

        # 2 save generated code
        save_generated_code(prompt_id, code)

        sanitize_code(code)

        scene_file = work_dir / "scene.py"
        scene_file.write_text(code, encoding="utf-8")

        # docker_cmd = [
        #     "docker", "run", "--rm",
        #     "--network", "none",
        #     "--cpus", "1",
        #     "--memory", "2g",
        #     "-v", f"{scene_file}:/app/scene.py:ro",
        #     "-v", f"{output_dir}:/output",
        #     "manim-sandbox:latest"
        # ]

        # subprocess.run(
        #     docker_cmd,
        #     timeout=120,
        #     check=False,
        #     capture_output=True,
        #     text=True
        # )
        
        # TEMPORARY: Skip Docker rendering
        video_url = None
        
        # Store generated code in DB
        save_generated_code(prompt_id, code)
        
        return {
            "status": "success",
            "video_url": None,
            "code": code,
            "attempts": attempts,
            "quality_score": quality_score
        }

        video_path = output_dir / "video.mp4"

        if not video_path.exists():
            return {"status": "failure", "error": "render failed"}

        public_dir = Path("rendered_videos")
        public_dir.mkdir(exist_ok=True)

        final_path = public_dir / f"{job_id}.mp4"
        shutil.move(video_path, final_path)

        video_url = f"/rendered_videos/{final_path.name}"

        # 3 save video url
        save_video(prompt_id, video_url)

        shutil.rmtree(work_dir, ignore_errors=True)

        return {
            "status": "success",
            "video_url": video_url,
            "code": code,
            "attempts": attempts,
            "quality_score": quality_score
        }

    except Exception as exc:
        return {
            "status": "failure",
            "error": str(exc)
        }


# =========================
# INSIGHT ENDPOINT
# =========================

@router.get("/insight")
def insight(prompt: str):
    """
    Stream a pedagogical explanation for the given animation prompt.
    Intended to be called in parallel with /generate from the client.
    Returns a plain-text stream via Server-Sent Events (SSE).
    """
    if not prompt.strip():
        raise HTTPException(status_code=400, detail="prompt cannot be empty")

    return StreamingResponse(
        stream_insight(prompt),
        media_type="text/plain"
    )