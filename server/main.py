# Numpy compatibility shim — madmom's compiled Cython extensions use np.int/np.float
# which were removed in NumPy 1.24+. Restore them before any madmom import.
import numpy as np
np.int = int  # type: ignore[attr-defined]
np.float = float  # type: ignore[attr-defined]
np.complex = complex  # type: ignore[attr-defined]
np.bool = bool  # type: ignore[attr-defined]

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers.analysis import router as analysis_router
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


@app.get("/health", response_model=HealthResponse)
async def health_check():
    return HealthResponse(status="ok", version="0.1.0")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=3900, reload=True)
