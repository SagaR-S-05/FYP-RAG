from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pathlib import Path
import subprocess
import tempfile
import shutil
import uuid
import os
import time

from backend.main import ManimRAG


app = FastAPI(title="Manim RAG API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================
# MODELS
# =========================

class GenerateRequest(BaseModel):
    prompt: str


class GenerateResponse(BaseModel):
    code: str


class RenderRequest(BaseModel):
    code: str


class RenderResponse(BaseModel):
    status: str
    video_url: str | None = None
    error: str | None = None


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
# ENDPOINTS
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

    try:
        code = rag.generate(prompt)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    return {"code": code}


@app.post("/render", response_model=RenderResponse)
def render(req: RenderRequest):
    code = req.code.strip()
    if not code:
        raise HTTPException(status_code=400, detail="code cannot be empty")

    try:
        sanitize_code(code)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    job_id = str(uuid.uuid4())
    work_dir = Path(tempfile.mkdtemp(prefix="manim_job_"))
    output_dir = work_dir / "output"
    output_dir.mkdir()

    scene_file = work_dir / "scene.py"
    scene_file.write_text(code, encoding="utf-8")

    docker_cmd = [
        "docker", "run", "--rm",
        "--network", "none",
        "--cpus", "1",
        "--memory", "2g",
        "-v", f"{scene_file}:/app/scene.py:ro",
        "-v", f"{output_dir}:/output",
        "manim-sandbox:latest"
    ]

    try:
        start = time.time()

        proc = subprocess.run(
            docker_cmd,
            timeout=120,
            capture_output=True,
            text=True
        )

        duration = time.time() - start

        video_path = output_dir / "video.mp4"
        if not video_path.exists():
            raise RuntimeError(
                f"Render failed.\nSTDOUT:\n{proc.stdout}\nSTDERR:\n{proc.stderr}"
            )

        # --- TEMPORARY LOCAL URL (NO STORAGE LAYER) ---
        public_dir = Path("rendered_videos")
        public_dir.mkdir(exist_ok=True)

        final_path = public_dir / f"{job_id}.mp4"
        shutil.move(video_path, final_path)

        video_url = f"/rendered_videos/{final_path.name}"

        return {
            "status": "success",
            "video_url": video_url,
            "error": None
        }

    except subprocess.TimeoutExpired:
        return {
            "status": "failure",
            "video_url": None,
            "error": "Render timed out"
        }

    except Exception as exc:
        return {
            "status": "failure",
            "video_url": None,
            "error": str(exc)
        }

    finally:
        shutil.rmtree(work_dir, ignore_errors=True)
