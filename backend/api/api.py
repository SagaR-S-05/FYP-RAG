from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from pathlib import Path
import subprocess
import tempfile
import shutil
import uuid
import sys

# Add backend to path for imports
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from main import ManimRAG


app = FastAPI(title="Manim RAG API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

Path("rendered_videos").mkdir(exist_ok=True)

app.mount(
    "/rendered_videos",
    StaticFiles(directory="rendered_videos"),
    name="videos"
)


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
# SINGLE ENDPOINT
# =========================

@app.post("/generate", response_model=GenerateResponse)
def generate(req: GenerateRequest):
    if rag is None:
        raise HTTPException(
            status_code=500,
            detail=f"RAG engine failed to initialize: {_startup_error}"
        )

    prompt = req.prompt.strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="prompt cannot be empty")

    job_id = str(uuid.uuid4())
    work_dir = Path(tempfile.mkdtemp(prefix="manim_job_"))
    output_dir = work_dir / "output"
    output_dir.mkdir()

    try:
        # 1. Generate Manim code (returns dict now)
        result = rag.generate(prompt)
        
        # Extract code from result dict
        code = result.get('code', '')
        success = result.get('success', False)
        error_msg = result.get('error')
        attempts = result.get('attempts', 0)
        quality_score = result.get('quality_score', 0.0)

        # If generation failed, return early
        if not success or not code:
            return {
                "status": "failure",
                "video_url": None,
                "error": f"Code generation failed: {error_msg}",
                "code": code,
                "attempts": attempts,
                "quality_score": quality_score
            }

        # 2. Sanitize generated code
        try:
            sanitize_code(code)
        except ValueError as e:
            return {
                "status": "failure",
                "video_url": None,
                "error": f"Security check failed: {str(e)}",
                "code": code,
                "attempts": attempts,
                "quality_score": quality_score
            }

        # 3. Write scene
        scene_file = work_dir / "scene.py"
        scene_file.write_text(code, encoding="utf-8")

        # 4. Run Docker sandbox (DO NOT check exit code)
        docker_cmd = [
            "docker", "run", "--rm",
            "--network", "none",
            "--cpus", "1",
            "--memory", "2g",
            "-v", f"{scene_file}:/app/scene.py:ro",
            "-v", f"{output_dir}:/output",
            "manim-sandbox:latest"
        ]

        result_proc = subprocess.run(
            docker_cmd,
            timeout=120,
            check=False,        # ← IMPORTANT
            capture_output=True,
            text=True
        )

        # 5. Success condition = video exists
        video_path = output_dir / "video.mp4"
        if not video_path.exists():
            return {
                "status": "failure",
                "video_url": None,
                "error": (
                    f"Render failed. Docker exit code: {result_proc.returncode}\n"
                    f"STDERR:\n{result_proc.stderr}\n"
                    f"Logs at: {output_dir}"
                ),
                "code": code,
                "attempts": attempts,
                "quality_score": quality_score
            }

        # 6. Expose video
        public_dir = Path("rendered_videos")
        public_dir.mkdir(exist_ok=True)

        final_path = public_dir / f"{job_id}.mp4"
        shutil.move(video_path, final_path)

        # 7. Cleanup only on success
        shutil.rmtree(work_dir, ignore_errors=True)

        return {
            "status": "success",
            "video_url": f"/rendered_videos/{final_path.name}",
            "error": None,
            "code": code,
            "attempts": attempts,
            "quality_score": quality_score
        }

    except subprocess.TimeoutExpired:
        return {
            "status": "failure",
            "video_url": None,
            "error": (
                "Render timed out. "
                f"Logs preserved at: {output_dir}"
            ),
            "code": result.get('code') if 'result' in locals() else None,
            "attempts": None,
            "quality_score": None
        }

    except Exception as exc:
        return {
            "status": "failure",
            "video_url": None,
            "error": str(exc),
            "code": result.get('code') if 'result' in locals() else None,
            "attempts": None,
            "quality_score": None
        }