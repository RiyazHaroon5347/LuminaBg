import os
import io
import time

# Set model download directory
MODELS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "models"))
os.makedirs(MODELS_DIR, exist_ok=True)
os.environ["U2NET_HOME"] = MODELS_DIR

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from rembg import remove, new_session
from PIL import Image

app = FastAPI(title="Lumina BG API", description="Instant High-Accuracy Background Removal Engine")

# Enable CORS for frontend application
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global session instance (Lazy-loaded on first request to prevent boot timeouts and OOM)
_session = None

def get_session():
    global _session
    if _session is None:
        print(f"Loading lightweight background removal AI engine (u2netp)...")
        try:
            # u2netp is ultra-lightweight (~40MB model size) optimized for CPU environments with <512MB RAM
            _session = new_session("u2netp")
            print("AI Engine loaded successfully (u2netp)")
        except Exception as e:
            print(f"Fallback to default u2net session due to: {e}")
            _session = new_session("u2net")
    return _session

@app.get("/")
@app.get("/api/health")
def health_check():
    return {
        "status": "ok",
        "engine": "rembg",
        "models_dir": MODELS_DIR
    }

@app.post("/api/remove-bg")
async def remove_background(
    file: UploadFile = File(...),
    alpha_matting: bool = False
):
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Uploaded file must be an image.")

    try:
        start_time = time.time()
        input_bytes = await file.read()
        
        # Get lazy-loaded lightweight session
        session = get_session()

        output_bytes = remove(
            input_bytes,
            session=session,
            alpha_matting=alpha_matting,
            alpha_matting_foreground_threshold=240,
            alpha_matting_background_threshold=10,
            alpha_matting_erode_size=10
        )
        
        processing_time = round(time.time() - start_time, 3)
        print(f"Background removed in {processing_time}s for image size {len(input_bytes)} bytes")
        
        return Response(
            content=output_bytes,
            media_type="image/png",
            headers={
                "X-Processing-Time": str(processing_time),
                "Content-Type": "image/png",
                "Content-Disposition": 'inline; filename="no_bg.png"',
                "Access-Control-Expose-Headers": "X-Processing-Time, Content-Disposition, Content-Type"
            }
        )
    except Exception as e:
        print(f"Error removing background: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port)

