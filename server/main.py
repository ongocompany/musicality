from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from routers.analysis import router as analysis_router
from routers.labeling import router as labeling_router
from models.schemas import HealthResponse

# Load .env for Supabase credentials
load_dotenv()

app = FastAPI(
    title="Musicality Analysis Server",
    description="Beat and downbeat analysis for Latin dance music (Bachata/Salsa)",
    version="0.2.0",
)

# CORS — allow mobile app + web labeling tool access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
app.include_router(analysis_router)
app.include_router(labeling_router, prefix="/labels", tags=["labeling"])

# Serve labeling web UI as static files
labeling_dir = Path(__file__).parent / "labeling"
if labeling_dir.exists():
    app.mount("/labeling", StaticFiles(directory=str(labeling_dir), html=True), name="labeling")


@app.get("/health", response_model=HealthResponse)
async def health_check():
    return HealthResponse(status="ok", version="0.1.0")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=3900, reload=True)
