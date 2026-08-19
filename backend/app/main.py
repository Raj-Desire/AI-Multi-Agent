import os
import asyncio
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1.twilio import router as twilio_router
from app.api.v1.calls import router as calls_router
from app.api.v1.auth import router as auth_router
from app.api.v1.admin import router as admin_router
from app.api.v1.superadmin import router as superadmin_router
from app.api.v1.theme import router as theme_router
from app.api.v1.agents import router as agents_router
from app.api.v1.voice import router as voice_router
from app.voice.gateway import router as gateway_router
from app.core.cosmos import init_cosmos_db

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Run Cosmos DB container setup and admin user seeding in a background thread
    try:
        await asyncio.to_thread(init_cosmos_db)
    except Exception as e:
        print(f"[Main Startup Error] Cosmos DB init failed: {e}")
    yield

app = FastAPI(
    title="Desire AI API",
    version="0.3.0",
    description="Desire AI Calling Agent Platform API with Deepgram Real-Time Voice Agent",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api/v1")
app.include_router(admin_router, prefix="/api/v1")
app.include_router(superadmin_router, prefix="/api/v1")
app.include_router(twilio_router, prefix="/api/v1")
app.include_router(calls_router, prefix="/api/v1")
app.include_router(theme_router, prefix="/api/v1")
app.include_router(agents_router, prefix="/api/v1")
app.include_router(voice_router, prefix="/api/v1")
app.include_router(gateway_router, prefix="/api/v1")


@app.get("/health/live")
async def health_live():
    return {"status": "ok"}
