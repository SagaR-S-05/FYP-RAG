from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from pathlib import Path
import subprocess
import tempfile
import shutil
import uuid
import re

from backend.pipeline.rag_pipeline import ManimRAG
from backend.db.crud import save_prompt, save_generated_code, save_video
from backend.services.insight_service import stream_insight

router = APIRouter()
MAX_RENDER_FIX_ATTEMPTS = 3

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


def extract_render_error(output_dir: Path, result_proc: subprocess.CompletedProcess) -> str:
    log_file = output_dir / "render.log"

    if log_file.exists():
        logs = log_file.read_text(encoding="utf-8", errors="replace").strip()
    else:
        logs = ((result_proc.stdout or "") + "\n" + (result_proc.stderr or "")).strip()

    if not logs:
        return "Unknown render error"

    error_lines = [
        line.strip()
        for line in logs.splitlines()
        if re.search(r"(error|exception|traceback|latex)", line, re.IGNORECASE)
    ]

    if error_lines:
        return "\n".join(error_lines[-12:])

    return logs[-4000:]


def render_manim_scene(scene_file: Path, output_dir: Path) -> tuple[bool, str | None]:
    docker_cmd = [
        "docker", "run", "--rm",
        "--network", "none",
        "--cpus", "1",
        "--memory", "2g",
        "-v", f"{scene_file}:/app/scene.py:ro",
        "-v", f"{output_dir}:/output",
        "manim-sandbox"
    ]

    result_proc = subprocess.run(
        docker_cmd,
        timeout=120,
        check=False,
        capture_output=True,
        text=True
    )

    video_path = output_dir / "video.mp4"

    if result_proc.returncode != 0:
        return False, extract_render_error(output_dir, result_proc)

    if not video_path.exists():
        return False, extract_render_error(output_dir, result_proc)

    return True, None


# =========================
# GENERATE ENDPOINT
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

    # Store prompt in DB
    prompt_id = save_prompt(prompt)

    job_id = str(uuid.uuid4())

    work_dir = Path(tempfile.mkdtemp(prefix="manim_job_"))
    output_dir = work_dir / "output"
    output_dir.mkdir()

    try:

        # =========================
        # 1 Generate Manim Code
        # =========================

        result = rag.generate(prompt)

        code = result.get("code", "")
        success = result.get("success", False)
        attempts = result.get("attempts", 0)
        quality_score = result.get("quality_score", 0.0)

        if not success or not code:
            return {
                "status": "failure",
                "error": "code generation failed"
            }

        render_error = None
        total_attempts = attempts
        scene_file = work_dir / "scene.py"
        video_path = output_dir / "video.mp4"

        for render_attempt in range(1, MAX_RENDER_FIX_ATTEMPTS + 1):
            sanitize_code(code)
            scene_file.write_text(code, encoding="utf-8")

            if video_path.exists():
                video_path.unlink()

            render_ok, render_error = render_manim_scene(scene_file, output_dir)
            if render_ok:
                break

            if render_attempt == MAX_RENDER_FIX_ATTEMPTS:
                return {
                    "status": "failure",
                    "error": render_error,
                    "code": code,
                    "attempts": total_attempts,
                    "quality_score": quality_score
                }

            refinement_request = (
                "The previous Manim code failed at render time. "
                "Fix only runtime issues and preserve the intended animation."
            )
            result = rag.repair_runtime_error(prompt, code, render_error or refinement_request)
            code = result.get("code", "")
            success = result.get("success", False)
            total_attempts += result.get("attempts", 0)
            quality_score = result.get("quality_score", quality_score)

            if not success or not code:
                return {
                    "status": "failure",
                    "error": render_error or "render fix failed"
                }

        # =========================
        # 2 Save Generated Code
        # =========================

        save_generated_code(prompt_id, code)

        # =========================
        # 3 Move Video to Public Dir
        # =========================

        public_dir = Path("rendered_videos")
        public_dir.mkdir(exist_ok=True)

        final_path = public_dir / f"{job_id}.mp4"

        shutil.move(video_path, final_path)

        video_url = f"/rendered_videos/{final_path.name}"

        # =========================
        # 4 Save Video URL in DB
        # =========================

        save_video(prompt_id, video_url)

        # =========================
        # 5 Cleanup Temp Folder
        # =========================

        shutil.rmtree(work_dir, ignore_errors=True)

        return {
            "status": "success",
            "video_url": video_url,
            "code": code,
            "attempts": total_attempts,
            "quality_score": quality_score
        }

    except subprocess.TimeoutExpired:

        return {
            "status": "failure",
            "error": "Rendering timed out"
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

    if not prompt.strip():
        raise HTTPException(status_code=400, detail="prompt cannot be empty")

    return StreamingResponse(
        stream_insight(prompt),
        media_type="text/plain"
    )
