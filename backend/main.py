from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from backend.api.api import router

app = FastAPI()
app.include_router(router)
app.mount(
    "/rendered_videos",
    StaticFiles(directory="rendered_videos", check_dir=False),
    name="rendered_videos",
)

