# Musicality Analysis Server

Beat and downbeat analysis server for Latin dance music (Bachata/Salsa).
Uses Madmom (RNN + DBN) + Librosa for high-accuracy beat detection.

## Setup

```bash
cd server
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## Run

```bash
# Development (with auto-reload)
python main.py

# Or directly with uvicorn
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

## API Endpoints

### `GET /health`
Health check. Returns `{ "status": "ok", "version": "0.1.0" }`.

### `POST /analyze`
Upload audio file for beat analysis.

**Request:** `multipart/form-data` with `file` field
**Supported formats:** mp3, wav, flac, m4a, aac, ogg
**Max size:** 100MB

**Response:**
```json
{
  "bpm": 128.5,
  "beats": [0.45, 0.92, 1.38, ...],
  "downbeats": [0.45, 2.31, 4.17, ...],
  "duration": 180.5,
  "beats_per_bar": 4,
  "confidence": 0.92
}
```

## Test

```bash
curl -X POST -F "file=@test.mp3" http://localhost:8000/analyze
```
