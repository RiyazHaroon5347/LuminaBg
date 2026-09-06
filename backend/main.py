import os
import io
import time

# Set model download directory to D: drive to prevent C: drive low space errors
MODELS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "models"))
os.makedirs(MODELS_DIR, exist_ok=True)
os.environ["U2NET_HOME"] = MODELS_DIR

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from rembg import remove, new_session
from PIL import Image

app = FastAPI(title="Lumina BG API", description="Instant High-Accuracy Background Removal Engine")

# Enable CORS for frontend Vite application
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pre-initialize rembg session for instant sub-second inference
print(f"Loading background removal AI engine (Models location: {MODELS_DIR})...")
try:
    session = new_session("isnet-general-use")
    print("AI Engine loaded successfully (isnet-general-use)")
except Exception as e:
    print(f"Fallback to default u2net session due to: {e}")
    session = new_session("u2net")

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
        
        # Remove background instantly with rembg session
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
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
