from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from backend.main import ManimRAG


app = FastAPI(title="Manim RAG API")

# Allow local dev tools (Swagger UI, frontend later) to call the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class GenerateRequest(BaseModel):
    prompt: str


class GenerateResponse(BaseModel):
    code: str


try:
    rag = ManimRAG()
except Exception as exc:
    rag = None
    _startup_error = exc
else:
    _startup_error = None


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
