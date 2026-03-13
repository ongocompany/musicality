import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.formation_engine import suggest_formations

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/formations", tags=["formations"])


class DancerPositionOut(BaseModel):
    dancerId: str
    x: float
    y: float


class FormationKeyframeOut(BaseModel):
    beatIndex: int
    positions: list[DancerPositionOut]


class DancerDefOut(BaseModel):
    id: str
    label: str
    role: str
    color: str


class FormationDataOut(BaseModel):
    version: int
    dancers: list[DancerDefOut]
    keyframes: list[FormationKeyframeOut]


class SectionInput(BaseModel):
    label: str
    start_time: float
    end_time: float
    confidence: float = 0.0


class FormationSuggestRequest(BaseModel):
    dancer_count: int          # 2-12
    dance_style: str           # 'bachata', 'salsa-on1', 'salsa-on2'
    beats: list[float]         # beat timestamps in seconds
    bpm: float
    sections: list[SectionInput] | None = None
    phrase_boundaries: list[float] | None = None


class FormationSuggestResponse(BaseModel):
    formation: FormationDataOut


@router.post("/suggest", response_model=FormationSuggestResponse)
async def suggest(req: FormationSuggestRequest):
    """
    Generate formation suggestions based on music analysis.
    Lightweight computation — synchronous response (no queue needed).
    """
    if req.dancer_count < 2 or req.dancer_count > 12:
        raise HTTPException(
            status_code=400,
            detail="dancer_count must be between 2 and 12",
        )

    if not req.beats or len(req.beats) < 4:
        raise HTTPException(
            status_code=400,
            detail="At least 4 beats are required",
        )

    sections_dicts = None
    if req.sections:
        sections_dicts = [s.model_dump() for s in req.sections]

    try:
        result = suggest_formations(
            dancer_count=req.dancer_count,
            dance_style=req.dance_style,
            beats=req.beats,
            bpm=req.bpm,
            sections=sections_dicts,
            phrase_boundaries=req.phrase_boundaries,
        )
        return FormationSuggestResponse(formation=result)

    except Exception as e:
        logger.error(f"Formation suggestion failed: {e}")
        raise HTTPException(status_code=500, detail=f"Formation generation failed: {str(e)}")
