import logging
logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s: %(message)s")

from dotenv import load_dotenv
load_dotenv()

# Collections compatibility shim — madmom uses collections.MutableSequence
# which was removed in Python 3.10+. Restore it before any madmom import.
import collections
import collections.abc
for _attr in ('MutableSequence', 'MutableMapping', 'MutableSet', 'Mapping', 'Sequence'):
    if not hasattr(collections, _attr):
        setattr(collections, _attr, getattr(collections.abc, _attr))

# Numpy compatibility shim — madmom's compiled Cython extensions use np.int/np.float
# which were removed in NumPy 1.24+. Restore them before any madmom import.
import numpy as np
np.int = int  # type: ignore[attr-defined]
np.float = float  # type: ignore[attr-defined]
np.complex = complex  # type: ignore[attr-defined]
np.bool = bool  # type: ignore[attr-defined]

from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from routers.analysis import router as analysis_router
from routers.formations import router as formations_router
from routers.labeling import router as labeling_router
from models.schemas import HealthResponse

app = FastAPI(
    title="Musicality Analysis Server",
    description="Beat and downbeat analysis for Latin dance music (Bachata/Salsa)",
    version="0.1.0",
)

# CORS — allow mobile app access from any origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
app.include_router(analysis_router)
app.include_router(formations_router)
app.include_router(labeling_router, prefix="/labels")

# Static files — downloads (must be before /labeling to avoid catch-all)
app.mount("/downloads", StaticFiles(directory=Path(__file__).parent / "labeling" / "downloads", html=True), name="downloads")

# Static files — labeling web UI
app.mount("/labeling", StaticFiles(directory=Path(__file__).parent / "labeling", html=True), name="labeling")


@app.get("/health", response_model=HealthResponse)
async def health_check():
    return HealthResponse(status="ok", version="0.1.0")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=3900, reload=True)
