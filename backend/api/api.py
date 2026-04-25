from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from pathlib import Path
import subprocess
import tempfile
import shutil
import uuid
import re
import os
import json

from backend.pipeline.rag_pipeline import ManimRAG
from backend.db.crud import save_prompt, save_generated_code, save_video
from backend.services.insight_service import stream_insight

router = APIRouter()
MAX_RENDER_FIX_ATTEMPTS = 3
MANIM_SANDBOX_IMAGE = os.getenv("MANIM_SANDBOX_IMAGE", "sahajbhatt/manim-sandbox")
PROJECT_ROOT = Path(__file__).resolve().parents[2]
RENDERED_VIDEOS_DIR = PROJECT_ROOT / "rendered_videos"
GALLERY_METADATA_PATH = RENDERED_VIDEOS_DIR / ".gallery.json"

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


class GalleryFolderRequest(BaseModel):
    name: str


class GalleryRenameRequest(BaseModel):
    name: str


class GalleryMoveRequest(BaseModel):
    folder: str


class GallerySaveRequest(BaseModel):
    video_id: str
    name: str | None = None
    folder: str | None = None


class GalleryVideoItem(BaseModel):
    id: str
    file_name: str
    name: str
    folder: str
    video_url: str
    size: int
    created_at: float
    modified_at: float


class GalleryResponse(BaseModel):
    folders: list[str]
    videos: list[GalleryVideoItem]


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
        MANIM_SANDBOX_IMAGE
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
# GALLERY HELPERS
# =========================

def _ensure_gallery_root() -> None:
    RENDERED_VIDEOS_DIR.mkdir(exist_ok=True)


def _normalize_folder(folder: str | None) -> str:
    value = (folder or "Unsorted").strip().replace("\\", "/")
    value = re.sub(r"/+", "/", value).strip("/")
    if not value:
        return "Unsorted"
    if any(part in {"", ".", ".."} for part in value.split("/")):
        raise HTTPException(status_code=400, detail="Invalid folder name")
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9 _.-]{0,63}", value):
        raise HTTPException(status_code=400, detail="Folder can only contain letters, numbers, spaces, dots, dashes, and underscores")
    return value


def _normalize_display_name(name: str | None) -> str:
    value = (name or "").strip()
    if not value:
        raise HTTPException(status_code=400, detail="Name cannot be empty")
    if len(value) > 100:
        raise HTTPException(status_code=400, detail="Name is too long")
    return value


def _load_gallery_metadata() -> dict:
    _ensure_gallery_root()
    if not GALLERY_METADATA_PATH.exists():
        return {"folders": ["Unsorted"], "videos": {}}
    try:
        data = json.loads(GALLERY_METADATA_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"folders": ["Unsorted"], "videos": {}}
    folders = data.get("folders") if isinstance(data.get("folders"), list) else []
    videos = data.get("videos") if isinstance(data.get("videos"), dict) else {}
    return {
        "folders": sorted({"Unsorted", *[str(folder) for folder in folders if str(folder).strip()]}),
        "videos": videos,
    }


def _save_gallery_metadata(metadata: dict) -> None:
    _ensure_gallery_root()
    folders = sorted({"Unsorted", *metadata.get("folders", [])})
    payload = {
        "folders": folders,
        "videos": metadata.get("videos", {}),
    }
    GALLERY_METADATA_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def _relative_video_path(path: Path) -> str:
    return path.relative_to(RENDERED_VIDEOS_DIR).as_posix()


def _resolve_video_path(video_id: str) -> Path:
    _ensure_gallery_root()
    normalized = str(video_id).replace("\\", "/").strip("/")
    if not normalized.lower().endswith(".mp4"):
        normalized = f"{normalized}.mp4"
    candidate = (RENDERED_VIDEOS_DIR / normalized).resolve()
    root = RENDERED_VIDEOS_DIR.resolve()
    if candidate == root or root not in candidate.parents:
        raise HTTPException(status_code=400, detail="Invalid video path")
    if not candidate.exists() or not candidate.is_file() or candidate.suffix.lower() != ".mp4":
        raise HTTPException(status_code=404, detail="Video not found")
    return candidate


def _list_gallery() -> GalleryResponse:
    _ensure_gallery_root()
    metadata = _load_gallery_metadata()
    folders = set(metadata["folders"])
    video_metadata = metadata["videos"]
    items: list[GalleryVideoItem] = []

    for video_path in RENDERED_VIDEOS_DIR.rglob("*.mp4"):
        if not video_path.is_file():
            continue
        rel_path = _relative_video_path(video_path)
        stat = video_path.stat()
        stored = video_metadata.get(rel_path, {})
        if not stored.get("saved", False):
            continue
        filesystem_folder = video_path.parent.relative_to(RENDERED_VIDEOS_DIR).as_posix()
        if filesystem_folder == ".":
            filesystem_folder = "Unsorted"
        folder = _normalize_folder(stored.get("folder") or filesystem_folder)
        folders.add(folder)
        name = stored.get("name") or video_path.stem
        items.append(
            GalleryVideoItem(
                id=rel_path,
                file_name=video_path.name,
                name=name,
                folder=folder,
                video_url=f"/rendered_videos/{rel_path}",
                size=stat.st_size,
                created_at=stat.st_ctime,
                modified_at=stat.st_mtime,
            )
        )

    known_files = {item.id for item in items}
    if set(video_metadata) - known_files:
        metadata["videos"] = {
            key: value for key, value in video_metadata.items() if key in known_files
        }
        _save_gallery_metadata(metadata)

    return GalleryResponse(
        folders=sorted(folders),
        videos=sorted(items, key=lambda item: item.modified_at, reverse=True),
    )


def _unique_destination(folder: str, file_name: str) -> Path:
    destination_dir = RENDERED_VIDEOS_DIR / folder
    destination_dir.mkdir(parents=True, exist_ok=True)
    stem = Path(file_name).stem
    suffix = Path(file_name).suffix or ".mp4"
    candidate = destination_dir / f"{stem}{suffix}"
    counter = 2
    while candidate.exists():
        candidate = destination_dir / f"{stem}-{counter}{suffix}"
        counter += 1
    return candidate


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

        public_dir = RENDERED_VIDEOS_DIR
        public_dir.mkdir(exist_ok=True)

        final_path = public_dir / f"{job_id}.mp4"

        shutil.move(video_path, final_path)

        video_url = f"/rendered_videos/{final_path.name}"

        gallery_metadata = _load_gallery_metadata()
        gallery_metadata["videos"][final_path.name] = {
            "name": prompt[:80] or final_path.stem,
            "folder": "Unsorted",
            "saved": False,
        }
        _save_gallery_metadata(gallery_metadata)

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


@router.post("/generate-stream")
def generate_stream(req: GenerateRequest):
    def event(payload: dict) -> str:
        return json.dumps(payload) + "\n"

    def run():
        if rag is None:
            yield event({
                "type": "error",
                "error": f"RAG engine failed to initialize: {_startup_error}",
            })
            return

        prompt = req.prompt.strip()
        if not prompt:
            yield event({"type": "error", "error": "prompt cannot be empty"})
            return

        work_dir = None

        try:
            yield event({
                "type": "progress",
                "stage": "Analyzing Prompt",
                "progress": 35,
                "message": "Saving prompt",
            })
            prompt_id = save_prompt(prompt)
            job_id = str(uuid.uuid4())

            work_dir = Path(tempfile.mkdtemp(prefix="manim_job_"))
            output_dir = work_dir / "output"
            output_dir.mkdir()

            yield event({
                "type": "progress",
                "stage": "Generating Code",
                "progress": 10,
                "message": "Generating Manim code",
            })
            result = rag.generate(prompt)

            code = result.get("code", "")
            success = result.get("success", False)
            attempts = result.get("attempts", 0)
            quality_score = result.get("quality_score", 0.0)

            if not success or not code:
                yield event({"type": "error", "error": "code generation failed"})
                return

            yield event({
                "type": "progress",
                "stage": "Code Ready",
                "progress": 100,
                "message": "Code validated",
            })

            render_error = None
            total_attempts = attempts
            scene_file = work_dir / "scene.py"
            video_path = output_dir / "video.mp4"

            for render_attempt in range(1, MAX_RENDER_FIX_ATTEMPTS + 1):
                yield event({
                    "type": "progress",
                    "stage": "Rendering Frames",
                    "progress": int((render_attempt - 1) / MAX_RENDER_FIX_ATTEMPTS * 85) + 5,
                    "message": f"Rendering attempt {render_attempt}",
                })

                sanitize_code(code)
                scene_file.write_text(code, encoding="utf-8")

                if video_path.exists():
                    video_path.unlink()

                render_ok, render_error = render_manim_scene(scene_file, output_dir)
                if render_ok:
                    break

                if render_attempt == MAX_RENDER_FIX_ATTEMPTS:
                    yield event({
                        "type": "error",
                        "error": render_error,
                        "code": code,
                        "attempts": total_attempts,
                        "quality_score": quality_score,
                    })
                    return

                yield event({
                    "type": "progress",
                    "stage": "Rendering Frames",
                    "progress": int(render_attempt / MAX_RENDER_FIX_ATTEMPTS * 85),
                    "message": "Repairing render issue",
                })

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
                    yield event({"type": "error", "error": render_error or "render fix failed"})
                    return

            yield event({
                "type": "progress",
                "stage": "Finalizing Video",
                "progress": 25,
                "message": "Saving generated code",
            })
            save_generated_code(prompt_id, code)

            public_dir = RENDERED_VIDEOS_DIR
            public_dir.mkdir(exist_ok=True)
            final_path = public_dir / f"{job_id}.mp4"
            shutil.move(video_path, final_path)
            video_url = f"/rendered_videos/{final_path.name}"

            gallery_metadata = _load_gallery_metadata()
            gallery_metadata["videos"][final_path.name] = {
                "name": prompt[:80] or final_path.stem,
                "folder": "Unsorted",
                "saved": False,
            }
            _save_gallery_metadata(gallery_metadata)

            yield event({
                "type": "progress",
                "stage": "Finalizing Video",
                "progress": 70,
                "message": "Saving video record",
            })
            save_video(prompt_id, video_url)

            yield event({
                "type": "progress",
                "stage": "Complete",
                "progress": 100,
                "message": "Video ready",
            })

            yield event({
                "type": "complete",
                "data": {
                    "status": "success",
                    "video_url": video_url,
                    "code": code,
                    "attempts": total_attempts,
                    "quality_score": quality_score,
                },
            })
        except subprocess.TimeoutExpired:
            yield event({"type": "error", "error": "Rendering timed out"})
        except Exception as exc:
            yield event({"type": "error", "error": str(exc)})
        finally:
            if work_dir is not None:
                shutil.rmtree(work_dir, ignore_errors=True)

    return StreamingResponse(run(), media_type="application/x-ndjson")


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


# =========================
# GALLERY ENDPOINTS
# =========================

@router.get("/gallery", response_model=GalleryResponse)
def list_gallery():
    return _list_gallery()


@router.post("/gallery/folders", response_model=GalleryResponse)
def create_gallery_folder(req: GalleryFolderRequest):
    folder = _normalize_folder(req.name)
    metadata = _load_gallery_metadata()
    metadata["folders"] = sorted({*metadata["folders"], folder})
    (RENDERED_VIDEOS_DIR / folder).mkdir(parents=True, exist_ok=True)
    _save_gallery_metadata(metadata)
    return _list_gallery()


@router.post("/gallery/save", response_model=GalleryResponse)
def save_gallery_video(req: GallerySaveRequest):
    video_path = _resolve_video_path(req.video_id)
    rel_path = _relative_video_path(video_path)
    folder = _normalize_folder(req.folder)
    metadata = _load_gallery_metadata()
    metadata["folders"] = sorted({*metadata["folders"], folder})

    current = metadata["videos"].get(rel_path, {})
    current["name"] = _normalize_display_name(req.name or current.get("name") or video_path.stem)
    current["folder"] = folder
    current["saved"] = True
    metadata["videos"][rel_path] = current
    _save_gallery_metadata(metadata)
    return _list_gallery()


@router.patch("/gallery/videos/{video_id:path}/rename", response_model=GalleryResponse)
def rename_gallery_video(video_id: str, req: GalleryRenameRequest):
    video_path = _resolve_video_path(video_id)
    rel_path = _relative_video_path(video_path)
    metadata = _load_gallery_metadata()
    current = metadata["videos"].get(rel_path, {})
    current["name"] = _normalize_display_name(req.name)
    current.setdefault("folder", _normalize_folder(video_path.parent.relative_to(RENDERED_VIDEOS_DIR).as_posix() if video_path.parent != RENDERED_VIDEOS_DIR else "Unsorted"))
    metadata["videos"][rel_path] = current
    _save_gallery_metadata(metadata)
    return _list_gallery()


@router.patch("/gallery/videos/{video_id:path}/move", response_model=GalleryResponse)
def move_gallery_video(video_id: str, req: GalleryMoveRequest):
    video_path = _resolve_video_path(video_id)
    old_rel_path = _relative_video_path(video_path)
    folder = _normalize_folder(req.folder)
    metadata = _load_gallery_metadata()
    metadata["folders"] = sorted({*metadata["folders"], folder})
    destination = _unique_destination(folder, video_path.name)

    if destination.resolve() != video_path.resolve():
        shutil.move(str(video_path), str(destination))

    new_rel_path = _relative_video_path(destination)
    current = metadata["videos"].pop(old_rel_path, {})
    current.setdefault("name", video_path.stem)
    current["folder"] = folder
    metadata["videos"][new_rel_path] = current
    _save_gallery_metadata(metadata)
    return _list_gallery()


@router.delete("/gallery/videos/{video_id:path}", response_model=GalleryResponse)
def delete_gallery_video(video_id: str):
    video_path = _resolve_video_path(video_id)
    rel_path = _relative_video_path(video_path)
    video_path.unlink()

    metadata = _load_gallery_metadata()
    metadata["videos"].pop(rel_path, None)
    _save_gallery_metadata(metadata)
    return _list_gallery()
