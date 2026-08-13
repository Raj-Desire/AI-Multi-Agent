from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1.twilio import router as twilio_router
from app.api.v1.calls import router as calls_router

app = FastAPI(
    title="Cloud Rep AI API",
    version="0.1.0",
    description="Multi-Tenant AI Calling Agent Platform API"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(twilio_router, prefix="/api/v1")
app.include_router(calls_router, prefix="/api/v1")

@app.get("/health/live")
async def health_live():
    return {"status": "ok"}
