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
from app.api.v1.business_profile import router as business_profile_router
from app.api.v1.prospects import router as prospects_router
from app.api.v1.campaigns import router as campaigns_router
from app.api.v1.lead_intelligence import router as lead_intelligence_router
from app.voice.gateway import router as gateway_router
from app.core.cosmos import init_cosmos_db
from app.services.campaign_dialer import campaign_dialer_engine

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Run Cosmos DB container setup and admin user seeding in a background thread
    try:
        await asyncio.to_thread(init_cosmos_db)
    except Exception as e:
        print(f"[Main Startup Error] Cosmos DB init failed: {e}")

    # Start automated outbound dialer engine
    try:
        campaign_dialer_engine.start()
    except Exception as e:
        print(f"[Main Startup Error] Campaign dialer start failed: {e}")

    yield

    # Graceful shutdown of dialer worker
    try:
        await campaign_dialer_engine.stop()
    except Exception as e:
        print(f"[Main Shutdown Error] Campaign dialer stop failed: {e}")

app = FastAPI(
    title="AI Voice Platform API",
    version="0.3.0",
    description="AI Voice Calling Agent Platform API with Real-Time Spoken Voice Engine",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=".*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    max_age=86400,
)

app.include_router(auth_router, prefix="/api/v1")
app.include_router(admin_router, prefix="/api/v1")
app.include_router(superadmin_router, prefix="/api/v1")
app.include_router(twilio_router, prefix="/api/v1")
app.include_router(calls_router, prefix="/api/v1")
app.include_router(theme_router, prefix="/api/v1")
app.include_router(business_profile_router, prefix="/api/v1")
app.include_router(agents_router, prefix="/api/v1")
app.include_router(voice_router, prefix="/api/v1")
app.include_router(prospects_router, prefix="/api/v1")
app.include_router(campaigns_router, prefix="/api/v1")
app.include_router(lead_intelligence_router, prefix="/api/v1")
app.include_router(gateway_router, prefix="/api/v1")


from fastapi.responses import Response

@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    return Response(status_code=204)

@app.get("/health/live")
async def health_live():
    return {"status": "ok"}

