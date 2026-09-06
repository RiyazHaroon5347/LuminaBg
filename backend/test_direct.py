import io
import time
from PIL import Image, ImageDraw
from rembg import remove, new_session

# Create a test image (red circle on white background)
img = Image.new("RGB", (400, 400), "white")
draw = ImageDraw.Draw(img)
draw.ellipse((100, 100, 300, 300), fill="red")

buf = io.BytesIO()
img.save(buf, format="PNG")
img_bytes = buf.getvalue()

print("Initializing session...")
session = new_session("isnet-general-use")

print("Removing background...")
start = time.time()
out_bytes = remove(img_bytes, session=session)
elapsed = time.time() - start

out_img = Image.open(io.BytesIO(out_bytes))
print(f"Success! Processed in {elapsed:.3f} seconds.")
print(f"Output mode: {out_img.mode}, size: {out_img.size}")
