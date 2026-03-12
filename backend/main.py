from fastapi import FastAPI
from backend.api.api import router
app = FastAPI()
app.include_router(router)
